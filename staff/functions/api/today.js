// GET /api/today: yesterday's, today's and tomorrow's status of every unit, read from the Airbnb iCals.
// Only answers people who signed in through Cloudflare Access. The iCal links are secrets (ICAL_<unit>).
import { accessEmail } from '../../lib/access-auth.js';
import { json } from '../../lib/http.js';
import { loadCalendars, dayStatus, isoDate, timeZone } from '../../lib/ical.js';

export async function onRequestGet({ request, env }) {
  if (!(await accessEmail(request, env))) return json({ error: 'forbidden' }, 403);

  const tz = timeZone(env);
  const now = Date.now();
  const today = isoDate(new Date(now), tz);
  const tomorrow = isoDate(new Date(now + 86400000), tz);
  const yesterday = isoDate(new Date(now - 86400000), tz);

  const { units: ids, calendars, missing } = await loadCalendars(env);
  if (missing.length === ids.length) return json({ error: 'not-configured' }, 503);
  const units = {}, next = {}, prev = {};
  for (const [u, events] of Object.entries(calendars)) {
    units[u] = dayStatus(events, today);
    next[u] = dayStatus(events, tomorrow);
    prev[u] = dayStatus(events, yesterday);
  }
  return json({ date: today, units, tomorrow: next, yesterday: prev, missing }, 200);
}
