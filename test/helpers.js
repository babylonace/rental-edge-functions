// Test helpers: invented fixtures, a fetch stub and a fake Cloudflare Access team.
// Nothing here is real: unit ids, calendar URLs, tokens and keys are made up for the tests.
import { readFileSync } from 'node:fs';

export const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

export const ICAL_URL = {
  A: 'https://www.airbnb.com/calendar/ical/1000001.ics?s=fixture',
  B: 'https://www.airbnb.com/calendar/ical/1000002.ics?s=fixture',
  C: 'https://www.airbnb.com/calendar/ical/1000003.ics?s=fixture'
};

// Units A and B answer with the fixtures; C fails with 500, as a broken calendar link would.
export function calendarRoutes() {
  return {
    [ICAL_URL.A]: () => new Response(fixture('unit-a.ics')),
    [ICAL_URL.B]: () => new Response(fixture('unit-b.ics')),
    [ICAL_URL.C]: () => new Response('error', { status: 500 })
  };
}

export const calendarEnv = () => ({ UNITS: 'A,B,C', ICAL_A: ICAL_URL.A, ICAL_B: ICAL_URL.B, ICAL_C: ICAL_URL.C });

// Replaces globalThis.fetch for one test. Unknown URLs reject, so no test can reach the network.
export function stubFetch(t, routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const route = routes[String(url)];
    if (!route) throw new Error('unexpected fetch ' + url);
    return route();
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

// Freezes Date at an instant (an ISO string with offset) for one test.
export function freezeTime(t, iso) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64json = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export const TEAM = 'https://example-team.cloudflareaccess.com';
export const AUD = 'fixture-aud-0123456789abcdef';

// A fake Access team: an RSA key pair, its public JWK set and a signer for test tokens.
export async function makeAccessTeam() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'fixture-key-1', alg: 'RS256', use: 'sig' };
  const now = () => Math.floor(Date.now() / 1000);

  async function sign(claims = {}, header = {}, key = pair.privateKey) {
    const head = b64json({ alg: 'RS256', kid: jwk.kid, typ: 'JWT', ...header });
    const body = b64json({ iss: TEAM, aud: [AUD], email: 'staff@example.test', iat: now(), exp: now() + 3600, ...claims });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
    return head + '.' + body + '.' + b64url(new Uint8Array(sig));
  }

  return {
    env: { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD },
    routes: { [TEAM + '/cdn-cgi/access/certs']: () => Response.json({ keys: [jwk] }) },
    sign
  };
}

export const request = (url, headers = {}, method = 'GET') => new Request(url, { method, headers });
