// GET /api/calendar: status of every unit for the next 14 days, read from the Airbnb iCals.
// Only answers people who signed in through Cloudflare Access. The iCal links are secrets (ICAL_<unit>).
import { accessEmail } from '../../lib/access-auth.js';
import { json } from '../../lib/http.js';
import { loadCalendars, dayStatus, isoDate, addDays, timeZone } from '../../lib/ical.js';

export const DAYS = 14;

export async function onRequestGet({ request, env }) {
  if (!(await accessEmail(request, env))) return json({ error: 'forbidden' }, 403);

  const first = isoDate(new Date(), timeZone(env));
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(first, i));

  const { units: ids, calendars, missing } = await loadCalendars(env);
  if (missing.length === ids.length) return json({ error: 'not-configured' }, 503);
  const units = {};
  for (const [u, events] of Object.entries(calendars)) units[u] = dates.map((d) => dayStatus(events, d));
  return json({ dates, units, missing }, 200);
}
