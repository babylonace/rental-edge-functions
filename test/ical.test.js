import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcal, dayStatus, isFree, isoDate, addDays, daysBetween, unitsFrom, fetchUnit, loadCalendars } from '../staff/lib/ical.js';
import { fixture, stubFetch, calendarRoutes, calendarEnv, ICAL_URL } from './helpers.js';

const a = parseIcal(fixture('unit-a.ics'));
const b = parseIcal(fixture('unit-b.ics'));

test('parses bookings and blocks, skipping events without an end date', () => {
  assert.equal(a.length, 5);
  assert.deepEqual(a[0], { start: '2026-03-05', end: '2026-03-10', url: 'https://www.airbnb.com/hosting/reservations/details/HMFAKE0001', reserved: true });
  assert.deepEqual(a[2], { start: '2026-03-20', end: '2026-03-21', reserved: false });
});

test('unfolds long lines so the reservation link is complete', () => {
  assert.ok(a.filter((e) => e.reserved).every((e) => /\/details\/HMFAKE\d{4}$/.test(e.url)));
});

test('reads Windows line endings the same way', () => {
  assert.deepEqual(parseIcal(fixture('unit-a.ics').replace(/\n/g, '\r\n')), a);
});

test('ignores text outside events and garbage input', () => {
  assert.deepEqual(parseIcal(''), []);
  assert.deepEqual(parseIcal('SUMMARY:Reserved\nDTSTART:20260101'), []);
  assert.deepEqual(parseIcal(null), []);
});

test('a departure and an arrival on the same day is a turnover', () => {
  assert.deepEqual(dayStatus(a, '2026-03-10'), {
    status: 'turn', next: '2026-03-21',
    outUrl: 'https://www.airbnb.com/hosting/reservations/details/HMFAKE0001',
    inUrl: 'https://www.airbnb.com/hosting/reservations/details/HMFAKE0002',
    until: '2026-03-14'
  });
});

test('stay, departure, free day and arrival', () => {
  assert.equal(dayStatus(a, '2026-03-12').status, 'stay');
  assert.equal(dayStatus(a, '2026-03-12').until, '2026-03-14');
  assert.equal(dayStatus(a, '2026-03-14').status, 'out');
  assert.deepEqual(dayStatus(a, '2026-03-15'), { status: 'free', next: '2026-03-21' });
  assert.equal(dayStatus(a, '2026-03-21').status, 'in');
  assert.equal(dayStatus(a, '2026-03-21').until, '2026-03-23');
});

test('a one-day block right before an arrival is flagged as an early check-in', () => {
  assert.deepEqual(dayStatus(a, '2026-03-20'), { status: 'blocked', next: '2026-03-21', note: 'early-checkin' });
  assert.deepEqual(dayStatus(b, '2026-03-16'), { status: 'blocked', next: null, note: null });
});

test('bookings that cross into the next month', () => {
  assert.equal(dayStatus(a, '2026-03-31').status, 'stay');
  assert.equal(dayStatus(a, '2026-04-01').status, 'stay');
  assert.equal(dayStatus(a, '2026-04-03').status, 'out');
  assert.equal(dayStatus(a, '2026-04-04').next, null);
});

test('free means no overlap, and a departure day can be an arrival day', () => {
  assert.equal(isFree(a, '2026-03-14', '2026-03-16'), true);
  assert.equal(isFree(b, '2026-03-14', '2026-03-16'), false);
  assert.equal(isFree(a, '2026-03-19', '2026-03-20'), true);
  assert.equal(isFree(a, '2026-03-19', '2026-03-21'), false);
  assert.equal(isFree(b, '2026-03-19', '2026-03-20'), true);
});

test('dates use the property time zone, not UTC', () => {
  const lateEvening = new Date('2026-03-11T03:30:00Z');
  assert.equal(isoDate(lateEvening, 'America/Lima'), '2026-03-10');
  assert.equal(isoDate(lateEvening, 'UTC'), '2026-03-11');
});

test('date arithmetic across months and leap years', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
});

test('UNITS keeps only safe ids', () => {
  assert.deepEqual(unitsFrom({ UNITS: ' A, B ,,C-1,D_2,' + 'x'.repeat(17) }), ['A', 'B', 'D_2']);
  assert.deepEqual(unitsFrom({}), []);
});

test('fetchUnit only downloads Airbnb calendar exports', async (t) => {
  const calls = stubFetch(t, calendarRoutes());
  assert.equal(await fetchUnit('https://evil.example/calendar/ical/1.ics?s=x'), null);
  assert.equal(await fetchUnit('http://www.airbnb.com/calendar/ical/1.ics?s=x'), null);
  assert.equal(await fetchUnit(undefined), null);
  assert.equal(calls.length, 0);
  assert.equal(await fetchUnit(ICAL_URL.C), null);
  assert.equal((await fetchUnit(ICAL_URL.A)).length, 5);
});

test('loadCalendars reports units whose calendar failed or is not set', async (t) => {
  stubFetch(t, calendarRoutes());
  const { units, calendars, missing } = await loadCalendars({ ...calendarEnv(), UNITS: 'A,B,C,D' });
  assert.deepEqual(units, ['A', 'B', 'C', 'D']);
  assert.deepEqual(Object.keys(calendars), ['A', 'B']);
  assert.deepEqual(missing, ['C', 'D']);
});
