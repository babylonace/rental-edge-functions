import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchToken, makeCookie, hasValidCookie, COOKIE_NAME } from '../guests/lib/guest-auth.js';
import { onRequest } from '../guests/functions/_middleware.js';
import { onRequestGet as wifi } from '../guests/functions/api/wifi.js';
import { freezeTime, request } from './helpers.js';

const CURRENT = 'current-token-fixture-0001';
const PREVIOUS = 'previous-token-fixture-0001';
const env = { GUEST_TOKEN: CURRENT, GUEST_TOKEN_PREV: PREVIOUS, WIFI_SSID: 'Fixture-WiFi', WIFI_PASS: 'not-a-real-password' };

const cookieValue = (setCookie) => setCookie.split(';')[0];
const withCookie = (cookie) => request('https://guide.example.test/api/wifi', { Cookie: 'other=1; ' + cookie });

test('accepts the current and the previous token, nothing else', async () => {
  assert.equal(await matchToken(CURRENT, env), CURRENT);
  assert.equal(await matchToken(PREVIOUS, env), PREVIOUS);
  assert.equal(await matchToken('wrong-token-fixture-0001', env), null);
  assert.equal(await matchToken(CURRENT.slice(0, -1), env), null);
});

test('rejects short, huge or missing tokens, and short configured tokens', async () => {
  assert.equal(await matchToken('short', env), null);
  assert.equal(await matchToken('x'.repeat(257), env), null);
  assert.equal(await matchToken(undefined, env), null);
  assert.equal(await matchToken('tiny', { GUEST_TOKEN: 'tiny' }), null);
});

test('the cookie is HttpOnly, Secure, SameSite=Lax and lasts 60 days', async () => {
  const c = await makeCookie(CURRENT);
  assert.match(c, new RegExp(`^${COOKIE_NAME}=\\d+\\.[A-Za-z0-9_-]{43}; Max-Age=5184000; Path=/; HttpOnly; Secure; SameSite=Lax$`));
  assert.ok(!c.includes(CURRENT));
});

test('a cookie is valid until it expires', async (t) => {
  freezeTime(t, '2026-03-10T12:00:00Z');
  const cookie = cookieValue(await makeCookie(CURRENT));
  assert.equal(await hasValidCookie(withCookie(cookie), env), true);
  t.mock.timers.tick(59 * 86400000);
  assert.equal(await hasValidCookie(withCookie(cookie), env), true);
  t.mock.timers.tick(2 * 86400000);
  assert.equal(await hasValidCookie(withCookie(cookie), env), false);
});

test('rotation keeps the previous cookies for one round only', async () => {
  const cookie = cookieValue(await makeCookie(CURRENT));
  const rotated = { GUEST_TOKEN: 'next-token-fixture-000001', GUEST_TOKEN_PREV: CURRENT };
  assert.equal(await hasValidCookie(withCookie(cookie), rotated), true);
  const rotatedTwice = { GUEST_TOKEN: 'last-token-fixture-000001', GUEST_TOKEN_PREV: rotated.GUEST_TOKEN };
  assert.equal(await hasValidCookie(withCookie(cookie), rotatedTwice), false);
});

test('tampered, extended or malformed cookies are rejected', async () => {
  const [exp, sig] = cookieValue(await makeCookie(CURRENT)).split('=')[1].split('.');
  const bad = [
    `${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`,
    `${Number(exp) + 86400}.${sig}`,
    `${exp}`,
    `${exp}.${sig}.extra`,
    ''
  ];
  for (const v of bad) assert.equal(await hasValidCookie(withCookie(`${COOKIE_NAME}=${v}`), env), false, v);
  assert.equal(await hasValidCookie(request('https://guide.example.test/'), env), false);
});

test('middleware: a valid link sets the cookie and removes the token from the URL', async () => {
  const res = await onRequest({ request: request(`https://guide.example.test/stay?lang=en&k=${CURRENT}`), env, next: () => assert.fail('no next') });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/stay?lang=en');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  const cookie = cookieValue(res.headers.get('Set-Cookie'));
  assert.equal(await hasValidCookie(withCookie(cookie), env), true);
});

test('middleware: a wrong token is also removed, with no cookie', async () => {
  const res = await onRequest({ request: request('https://guide.example.test/?k=wrong-token-fixture-0001'), env, next: () => assert.fail('no next') });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/');
  assert.equal(res.headers.get('Set-Cookie'), null);
});

test('middleware: other requests pass through with the privacy headers, which win over the defaults', async () => {
  const next = () => new Response('<p>guide</p>', { headers: { 'Content-Type': 'text/html', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
  const res = await onRequest({ request: request('https://guide.example.test/'), env, next });
  assert.equal(await res.text(), '<p>guide</p>');
  assert.equal(res.headers.get('Content-Type'), 'text/html');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  const post = await onRequest({ request: request(`https://guide.example.test/?k=${CURRENT}`, {}, 'POST'), env, next });
  assert.equal(post.status, 200);
});

test('/api/wifi: 401 without the cookie, the details with it, 503 if not configured', async () => {
  const locked = await wifi({ request: request('https://guide.example.test/api/wifi'), env });
  assert.equal(locked.status, 401);
  assert.deepEqual(await locked.json(), { error: 'locked' });

  const cookie = cookieValue(await makeCookie(PREVIOUS));
  const open = await wifi({ request: withCookie(cookie), env });
  assert.equal(open.status, 200);
  assert.equal(open.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await open.json(), { ssid: 'Fixture-WiFi', password: 'not-a-real-password' });

  const empty = await wifi({ request: withCookie(cookie), env: { GUEST_TOKEN_PREV: PREVIOUS } });
  assert.equal(empty.status, 503);
});
