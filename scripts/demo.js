// Runs the real handlers locally with invented data, so you can watch each flow without a Cloudflare account.
// Usage: npm run demo
// fetch is replaced by the test fixtures (no network) and the clock is fixed at 22:30 on 10 March 2026 in Lima.
import { onRequest as guestMiddleware } from '../guests/functions/_middleware.js';
import { onRequestGet as wifi } from '../guests/functions/api/wifi.js';
import { onRequestGet as availability } from '../staff/functions/api/availability.js';
import { onRequestGet as today } from '../staff/functions/api/today.js';
import { calendarRoutes, calendarEnv, makeAccessTeam } from '../test/helpers.js';

const NOW = Date.parse('2026-03-11T03:30:00Z');
Date.now = () => NOW;
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } };

const team = await makeAccessTeam();
const routes = { ...calendarRoutes(), ...team.routes };
globalThis.fetch = async (url) => routes[String(url)]?.() ?? new Response('not found', { status: 404 });

const guestEnv = { GUEST_TOKEN: 'demo-token-0123456789abcdef', WIFI_SSID: 'Demo-WiFi', WIFI_PASS: 'demo-password' };
const staffEnv = { ...calendarEnv(), ...team.env, ALLOWED_ORIGINS: 'https://www.example.com' };

const step = (title) => console.log('\n\x1b[1m' + title + '\x1b[0m');
const show = async (res) => {
  const text = await res.clone().text();
  console.log(`  ${res.status}`, text ? JSON.stringify(JSON.parse(text), null, 1).replace(/\n\s*/g, ' ') : '');
  return res;
};

step('1. Guest opens /api/wifi without the cookie');
await show(await wifi({ request: new Request('https://guide.example.com/api/wifi'), env: guestEnv }));

step('2. Guest opens the check-in link https://guide.example.com/?k=TOKEN');
const redirect = await guestMiddleware({
  request: new Request(`https://guide.example.com/?lang=en&k=${guestEnv.GUEST_TOKEN}`),
  env: guestEnv,
  next: () => new Response('page')
});
const cookie = redirect.headers.get('Set-Cookie');
console.log(`  ${redirect.status} Location: ${redirect.headers.get('Location')}   (token removed from the URL)`);
console.log(`  Set-Cookie: ${cookie.replace(/=(\d+)\.[\w-]+/, '=$1.<hmac>')}`);

step('3. The page asks /api/wifi again, now with the cookie');
await show(await wifi({ request: new Request('https://guide.example.com/api/wifi', { headers: { Cookie: cookie.split(';')[0] } }), env: guestEnv }));

step('4. Public site searches 14 to 16 March (unit C has a broken calendar link)');
await show(await availability({
  request: new Request('https://staff.example.com/api/availability?checkin=2026-03-14&checkout=2026-03-16', { headers: { Origin: 'https://www.example.com' } }),
  env: staffEnv
}));

step('5. Someone calls /api/today without signing in through Cloudflare Access');
await show(await today({ request: new Request('https://staff.example.com/api/today'), env: staffEnv }));

step('6. A staff member signed in through Access (the JWT is checked against the team keys)');
const res = await today({
  request: new Request('https://staff.example.com/api/today', { headers: { 'Cf-Access-Jwt-Assertion': await team.sign() } }),
  env: staffEnv
});
const body = await res.json();
console.log(`  ${res.status} date ${body.date}, missing: ${body.missing.join(', ')}`);
for (const u of Object.keys(body.units)) {
  console.log(`  unit ${u}: yesterday ${body.yesterday[u].status}, today ${body.units[u].status}, tomorrow ${body.tomorrow[u].status}`);
}
