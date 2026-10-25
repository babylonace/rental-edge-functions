// GET /api/availability?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD: which units are free on those dates.
// The only public staff route: the date search on the public landing page calls it, and it reuses the
// ICAL_* secrets of this project instead of copying them to another one. In Cloudflare Access it has its
// own application with a Bypass policy.
// It only answers free or not free per unit: never booking dates, links or guests.
import { loadCalendars, isFree, isoDate, daysBetween, timeZone } from '../../lib/ical.js';
import { json, originAllowed } from '../../lib/http.js';

export const MAX_NIGHTS = 90;
export const MAX_AHEAD_DAYS = 400;

function reply(body, status, request, env) {
  const origin = request.headers.get('Origin');
  const headers = { 'Vary': 'Origin' };
  if (status === 200) headers['Cache-Control'] = 'public, max-age=300';
  if (originAllowed(origin, env.ALLOWED_ORIGINS)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  }
  return json(body, status, headers);
}

export async function onRequestOptions({ request, env }) {
  return reply(null, 204, request, env);
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const checkin = q.get('checkin') || '';
  const checkout = q.get('checkout') || '';
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(checkin) || !iso.test(checkout)) return reply({ error: 'bad-dates' }, 400, request, env);

  const today = isoDate(new Date(), timeZone(env));
  const nights = daysBetween(checkin, checkout);
  if (!(nights >= 1 && nights <= MAX_NIGHTS) || checkin < today || daysBetween(today, checkin) > MAX_AHEAD_DAYS) {
    return reply({ error: 'bad-dates' }, 400, request, env);
  }

  const { units: ids, calendars, missing } = await loadCalendars(env);
  if (missing.length === ids.length) return reply({ error: 'not-configured' }, 503, request, env);
  const units = {};
  for (const [u, events] of Object.entries(calendars)) units[u] = isFree(events, checkin, checkout);
  return reply({ checkin, checkout, nights, units, missing }, 200, request, env);
}
