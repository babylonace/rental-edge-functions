import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as availability, onRequestOptions } from '../staff/functions/api/availability.js';
import { onRequestGet as today } from '../staff/functions/api/today.js';
import { onRequestGet as calendar } from '../staff/functions/api/calendar.js';
import { originAllowed } from '../staff/lib/http.js';
import { calendarRoutes, calendarEnv, stubFetch, freezeTime, makeAccessTeam, request } from './helpers.js';

const team = await makeAccessTeam();
const ORIGINS = 'https://rentals.example.test,https://*.rentals-preview.pages.dev,http://localhost:8788';
const env = { ...calendarEnv(), ...team.env, ALLOWED_ORIGINS: ORIGINS };

// 22:30 on 10 March in Lima is already 11 March in UTC: "today" must be the 10th.
const NOW = '2026-03-11T03:30:00Z';

function search(query, origin = 'https://rentals.example.test') {
  return request('https://staff.example.test/api/availability?' + query, origin ? { Origin: origin } : {});
}

test('origin rules: exact matches and one-label wildcards only', () => {
  const ok = ['https://rentals.example.test', 'https://feat-x.rentals-preview.pages.dev', 'http://localhost:8788'];
  const no = [
    'https://rentals.example.test.evil.test', 'http://rentals.example.test', 'https://rentals-preview.pages.dev',
    'https://a.b.rentals-preview.pages.dev', 'https://evilrentals-preview.pages.dev', 'http://localhost:9999', null, ''
  ];
  for (const o of ok) assert.equal(originAllowed(o, ORIGINS), true, o);
  for (const o of no) assert.equal(originAllowed(o, ORIGINS), false, String(o));
  assert.equal(originAllowed('https://rentals.example.test', undefined), false);
});

test('availability: free or not free per unit, in the property time zone', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, calendarRoutes());
  const res = await availability({ request: search('checkin=2026-03-10&checkout=2026-03-12'), env });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { checkin: '2026-03-10', checkout: '2026-03-12', nights: 2, units: { A: false, B: false }, missing: ['C'] });

  const later = await availability({ request: search('checkin=2026-03-14&checkout=2026-03-16'), env });
  assert.deepEqual((await later.json()).units, { A: true, B: false });
});

test('availability: never returns booking dates, links or guest data', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, calendarRoutes());
  const text = await (await availability({ request: search('checkin=2026-03-19&checkout=2026-03-20'), env })).text();
  assert.doesNotMatch(text, /airbnb|HMFAKE|ical|2026-03-21|2026-03-16/i);
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body), ['checkin', 'checkout', 'nights', 'units', 'missing']);
  assert.deepEqual(body.units, { A: true, B: true });
});

test('availability: rejects bad ranges before reading any calendar', async (t) => {
  freezeTime(t, NOW);
  const calls = stubFetch(t, calendarRoutes());
  const bad = [
    '', 'checkin=2026-03-12', 'checkin=12/03/2026&checkout=14/03/2026', 'checkin=2026-3-12&checkout=2026-3-14',
    'checkin=2026-03-12&checkout=2026-03-12', 'checkin=2026-03-14&checkout=2026-03-12',
    'checkin=2026-03-09&checkout=2026-03-11', 'checkin=2026-03-10&checkout=2026-06-09',
    'checkin=2027-04-15&checkout=2027-04-16'
  ];
  for (const q of bad) {
    const res = await availability({ request: search(q), env });
    assert.equal(res.status, 400, q);
    assert.equal(res.headers.get('Cache-Control'), 'no-store', q);
  }
  assert.equal(calls.length, 0);
  assert.equal((await availability({ request: search('checkin=2026-03-10&checkout=2026-06-08'), env })).status, 200);
});

test('availability: 503 when no calendar can be read', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, calendarRoutes());
  const res = await availability({ request: search('checkin=2026-03-12&checkout=2026-03-13'), env: { ...env, UNITS: 'C' } });
  assert.equal(res.status, 503);
  const none = await availability({ request: search('checkin=2026-03-12&checkout=2026-03-13'), env: { ...env, UNITS: '' } });
  assert.equal(none.status, 503);
});

test('availability: CORS headers only for allowed origins, cached for 5 minutes', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, calendarRoutes());
  const allowed = await availability({ request: search('checkin=2026-03-12&checkout=2026-03-13'), env });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://rentals.example.test');
  assert.equal(allowed.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(allowed.headers.get('Vary'), 'Origin');

  const denied = await availability({ request: search('checkin=2026-03-12&checkout=2026-03-13', 'https://evil.test'), env });
  assert.equal(denied.status, 200);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);

  const preflight = await onRequestOptions({ request: search('', 'https://feat-x.rentals-preview.pages.dev'), env });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(await preflight.text(), '');
});

test('staff endpoints answer 403 without a valid Access token', async (t) => {
  const calls = stubFetch(t, { ...calendarRoutes(), ...team.routes });
  for (const handler of [today, calendar]) {
    const res = await handler({ request: request('https://staff.example.test/api/x'), env });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  }
  assert.equal(calls.filter((u) => u.includes('airbnb')).length, 0);
});

test('/api/today: yesterday, today and tomorrow per unit', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, { ...calendarRoutes(), ...team.routes });
  const jwt = await team.sign();
  const res = await today({ request: request('https://staff.example.test/api/today', { 'Cf-Access-Jwt-Assertion': jwt }), env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.date, '2026-03-10');
  assert.equal(body.units.A.status, 'turn');
  assert.equal(body.yesterday.A.status, 'stay');
  assert.equal(body.tomorrow.A.status, 'stay');
  assert.equal(body.units.B.status, 'stay');
  assert.deepEqual(body.missing, ['C']);
});

test('/api/calendar: 14 days from today for every unit', async (t) => {
  freezeTime(t, NOW);
  stubFetch(t, { ...calendarRoutes(), ...team.routes });
  const jwt = await team.sign();
  const res = await calendar({ request: request('https://staff.example.test/api/calendar', { Cookie: `CF_Authorization=${jwt}` }), env });
  const body = await res.json();
  assert.equal(body.dates.length, 14);
  assert.equal(body.dates[0], '2026-03-10');
  assert.equal(body.dates[13], '2026-03-23');
  assert.deepEqual(body.units.A.map((d) => d.status).slice(0, 5), ['turn', 'stay', 'stay', 'stay', 'out']);
  assert.equal(body.units.A[10].note, 'early-checkin');
  assert.deepEqual(body.units.B.slice(6, 9).map((d) => d.status), ['blocked', 'blocked', 'blocked']);
});
