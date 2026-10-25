// Cloudflare Access verification for the staff functions.
// Cloudflare Access already blocks the page for anyone who is not authorised; this check is a second
// barrier: the functions only answer when the request carries a valid Access token (signed by the
// Cloudflare Zero Trust team and issued for this application). Missing configuration means deny.
//
// Variables (Pages project, Settings, Variables and Secrets):
//   ACCESS_TEAM_DOMAIN  e.g. https://your-team.cloudflareaccess.com
//   ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"

const enc = new TextEncoder();

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function readToken(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === 'CF_Authorization') return part.slice(i + 1).trim();
  }
  return null;
}

async function getKeys(team) {
  const res = await fetch(team + '/cdn-cgi/access/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error('certs ' + res.status);
  const body = await res.json();
  return body.keys || [];
}

// Returns the signed-in email, or null if the token is not valid.
export async function accessEmail(request, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, '');
  const aud = env.ACCESS_AUD || '';
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || aud.length < 16) return null;

  const token = readToken(request);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try { header = decodePart(parts[0]); payload = decodePart(parts[1]); } catch (e) { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let keys;
  try { keys = await getKeys(team); } catch (e) { return null; }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (payload.iss !== team) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  return typeof payload.email === 'string' ? payload.email : 'ok';
}
