// Guest access to the Wi-Fi details.
// The check-in message links to ?k=TOKEN. If it matches GUEST_TOKEN or GUEST_TOKEN_PREV, the browser
// gets a cookie signed with that token (HMAC-SHA256), valid for 60 days.
// Rotation (PREV <- current, new value in GUEST_TOKEN) keeps cookies issued with the previous token
// working until the next rotation. No secret is ever stored in the cookie or in the repository.

export const COOKIE_NAME = 'guest_session';
export const COOKIE_DAYS = 60;
const MIN_TOKEN_LENGTH = 16;
const enc = new TextEncoder();

function b64url(buf) {
  let s = '';
  for (const byte of new Uint8Array(buf)) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', enc.encode(text));
}

// Constant-time comparison. The SHA-256 digests are compared, so the length does not leak.
async function sameSecret(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(ha, hb);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function tokens(env) {
  return [env.GUEST_TOKEN, env.GUEST_TOKEN_PREV].filter((t) => typeof t === 'string' && t.length >= MIN_TOKEN_LENGTH);
}

// Returns the configured token that matches k, or null. Always compares against every token.
export async function matchToken(k, env) {
  if (typeof k !== 'string' || k.length < MIN_TOKEN_LENGTH || k.length > 256) return null;
  let found = null;
  for (const t of tokens(env)) {
    if ((await sameSecret(k, t)) && !found) found = t;
  }
  return found;
}

async function sign(token, exp) {
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode('guest-cookie:' + exp)));
}

export async function makeCookie(token) {
  const maxAge = COOKIE_DAYS * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const value = exp + '.' + (await sign(token, exp));
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE_NAME) return part.slice(i + 1).trim();
  }
  return null;
}

// The cookie is "expiry.signature". Checks, cheapest first: the shape, the expiry, then the signature
// recomputed with each configured token. The expiry is part of the signed text, so editing it breaks the signature.
export async function hasValidCookie(request, env) {
  const value = readCookie(request);
  const m = value && /^(\d{9,12})\.([A-Za-z0-9_-]{20,100})$/.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < Date.now() / 1000) return false;
  let ok = false;
  for (const t of tokens(env)) {
    if (await sameSecret(m[2], await sign(t, exp))) ok = true;
  }
  return ok;
}
