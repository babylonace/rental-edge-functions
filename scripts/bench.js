// Measures the CPU work behind each endpoint (the network time to Airbnb is not included).
// Usage: npm run bench
import { parseIcal, dayStatus, isFree } from '../staff/lib/ical.js';
import { matchToken, makeCookie, hasValidCookie } from '../guests/lib/guest-auth.js';
import { accessEmail } from '../staff/lib/access-auth.js';
import { makeAccessTeam } from '../test/helpers.js';

// A busy calendar: a year of 3-night bookings with one free night between them (90 events)
let ics = 'BEGIN:VCALENDAR\n';
const d0 = Date.UTC(2026, 0, 1);
const f = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
for (let i = 0; i < 90; i++) {
  const s = d0 + i * 4 * 864e5;
  ics += `BEGIN:VEVENT\nDTEND;VALUE=DATE:${f(s + 3 * 864e5)}\nDTSTART;VALUE=DATE:${f(s)}\nUID:x${i}\n` +
    `DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/\n details/HMFAKE${String(i).padStart(4, '0')}\\nPhone\nSUMMARY:Reserved\nEND:VEVENT\n`;
}
ics += 'END:VCALENDAR\n';

async function time(label, n, fn) {
  for (let i = 0; i < 50; i++) await fn();
  const t = performance.now();
  for (let i = 0; i < n; i++) await fn();
  console.log(label.padEnd(56), ((performance.now() - t) / n * 1000).toFixed(1).padStart(8), 'µs');
}

const ev = parseIcal(ics);
console.log('events:', ev.length, '| ics size:', ics.length, 'bytes | node', process.version);
await time('parseIcal, one busy calendar (90 events)', 2000, () => parseIcal(ics));
await time('7 units x 14 days of dayStatus (/api/calendar)', 2000, () => {
  for (let u = 0; u < 7; u++) for (let d = 0; d < 14; d++) dayStatus(ev, '2026-03-' + String(10 + d).padStart(2, '0'));
});
await time('7 units x isFree (/api/availability)', 20000, () => { for (let u = 0; u < 7; u++) isFree(ev, '2026-03-10', '2026-03-14'); });

const env = { GUEST_TOKEN: 'a'.repeat(43), GUEST_TOKEN_PREV: 'b'.repeat(43) };
const cookie = (await makeCookie(env.GUEST_TOKEN)).split(';')[0];
const req = new Request('https://x.test/', { headers: { Cookie: cookie } });
await time('matchToken (2 tokens, constant time)', 2000, () => matchToken('a'.repeat(43), env));
await time('hasValidCookie (2 HMACs + comparisons)', 2000, () => hasValidCookie(req, env));

const team = await makeAccessTeam();
const jwt = await team.sign();
const certs = Object.values(team.routes)[0];
globalThis.fetch = async () => certs();
const jreq = new Request('https://x.test/', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
await time('accessEmail (RS256 verify, keys already fetched)', 1000, () => accessEmail(jreq, team.env));
