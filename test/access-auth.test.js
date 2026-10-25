import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessEmail } from '../staff/lib/access-auth.js';
import { makeAccessTeam, stubFetch, request, TEAM } from './helpers.js';

const team = await makeAccessTeam();
const withJwt = (jwt) => request('https://staff.example.test/api/today', { 'Cf-Access-Jwt-Assertion': jwt });

test('a valid Access token returns the email, from the header or the cookie', async (t) => {
  stubFetch(t, team.routes);
  const jwt = await team.sign();
  assert.equal(await accessEmail(withJwt(jwt), team.env), 'staff@example.test');
  const viaCookie = request('https://staff.example.test/api/today', { Cookie: `a=1; CF_Authorization=${jwt}` });
  assert.equal(await accessEmail(viaCookie, team.env), 'staff@example.test');
  assert.equal(await accessEmail(withJwt(await team.sign({ email: undefined })), team.env), 'ok');
  assert.equal(await accessEmail(withJwt(await team.sign({ aud: team.env.ACCESS_AUD })), team.env), 'staff@example.test');
});

test('rejects a token signed by another key', async (t) => {
  stubFetch(t, team.routes);
  const other = await makeAccessTeam();
  assert.equal(await accessEmail(withJwt(await other.sign()), team.env), null);
});

test('rejects tampered claims', async (t) => {
  stubFetch(t, team.routes);
  const [h, , s] = (await team.sign()).split('.');
  const forged = Buffer.from(JSON.stringify({ iss: TEAM, aud: [team.env.ACCESS_AUD], email: 'intruder@example.test', exp: 4102444800 })).toString('base64url');
  assert.equal(await accessEmail(withJwt(`${h}.${forged}.${s}`), team.env), null);
});

test('rejects the wrong audience, issuer, expiry or not-before', async (t) => {
  stubFetch(t, team.routes);
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    'other app': { aud: ['another-aud-0123456789abcdef'] },
    'other team': { iss: 'https://other-team.cloudflareaccess.com' },
    expired: { exp: now - 1 },
    'no exp': { exp: undefined },
    'not yet valid': { nbf: now + 600 }
  };
  for (const [name, claims] of Object.entries(cases)) {
    assert.equal(await accessEmail(withJwt(await team.sign(claims)), team.env), null, name);
  }
});

test('rejects other algorithms and unknown key ids', async (t) => {
  stubFetch(t, team.routes);
  assert.equal(await accessEmail(withJwt(await team.sign({}, { alg: 'none' })), team.env), null);
  assert.equal(await accessEmail(withJwt(await team.sign({}, { alg: 'HS256' })), team.env), null);
  assert.equal(await accessEmail(withJwt(await team.sign({}, { kid: 'unknown' })), team.env), null);
});

test('rejects missing or malformed tokens without fetching keys', async (t) => {
  const calls = stubFetch(t, team.routes);
  for (const jwt of ['', 'a.b', 'a.b.c.d', 'not-base64.!!.x']) {
    assert.equal(await accessEmail(withJwt(jwt), team.env), null, jwt);
  }
  assert.equal(await accessEmail(request('https://staff.example.test/'), team.env), null);
  assert.equal(calls.length, 0);
});

test('denies when the configuration is missing or suspicious', async (t) => {
  const calls = stubFetch(t, team.routes);
  const jwt = await team.sign();
  const bad = [
    {},
    { ...team.env, ACCESS_AUD: 'short' },
    { ...team.env, ACCESS_TEAM_DOMAIN: 'https://example-team.evil.test' },
    { ...team.env, ACCESS_TEAM_DOMAIN: 'http://example-team.cloudflareaccess.com' }
  ];
  for (const env of bad) assert.equal(await accessEmail(withJwt(jwt), env), null);
  assert.equal(calls.length, 0);
});

test('denies when the key endpoint fails', async (t) => {
  stubFetch(t, { [TEAM + '/cdn-cgi/access/certs']: () => new Response('down', { status: 502 }) });
  assert.equal(await accessEmail(withJwt(await team.sign()), team.env), null);
});
