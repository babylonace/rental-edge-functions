// Reading the iCal calendars that Airbnb exports, one per listing.
// Airbnb exports each booking as "Reserved" (DTSTART = arrival day, DTEND = departure day)
// and blocked dates as "Airbnb (Not available)". The guest's name is not included.

// UNITS is a comma-separated list of unit ids; each one reads its calendar URL from ICAL_<id>.
export function unitsFrom(env) {
  return String(env.UNITS || '').split(',').map((u) => u.trim()).filter((u) => /^[A-Za-z0-9_]{1,16}$/.test(u));
}
export const envName = (u) => 'ICAL_' + u;
export const timeZone = (env) => env.TIMEZONE || 'America/Lima';

function toIso(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// One pass over the lines: BEGIN:VEVENT opens an event, END:VEVENT keeps it if it has both dates.
// Returns [{ start, end, reserved, url? }] with dates as YYYY-MM-DD strings (they compare correctly as text).
export function parseIcal(text) {
  // Unfold first: long lines continue on the next line after a space or a tab (RFC 5545, 3.1)
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') { if (ev && ev.start && ev.end) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    const value = line.slice(i + 1);
    if (name === 'DTSTART') ev.start = toIso(value);
    else if (name === 'DTEND') ev.end = toIso(value);
    else if (name === 'SUMMARY') ev.reserved = /reserved/i.test(value);
    else if (name === 'DESCRIPTION') {
      const m = /https:\/\/www\.airbnb\.[a-z.]+\/hosting\/reservations\/details\/[A-Z0-9]+/.exec(value.replace(/\\n/g, ' '));
      if (m) ev.url = m[0];
    }
  }
  return events;
}

export function addDays(iso, n) {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// Status of a unit on a date: turn (one guest leaves, another arrives), out, in, stay, blocked or free.
// A one-day block right before an arrival is usually there to allow an early check-in, so it gets
// note: 'early-checkin'. That is a guess from the shape of the calendar: the iCal does not say why a date is blocked.
export function dayStatus(events, d) {
  const res = events.filter((e) => e.reserved);
  const outEv = res.find((e) => e.end === d);
  const inEv = res.find((e) => e.start === d);
  const stayEv = res.find((e) => e.start < d && e.end > d);
  const blocked = events.some((e) => !e.reserved && e.start <= d && e.end > d);
  const next = res.filter((e) => e.start > d).map((e) => e.start).sort()[0] || null;
  const out = { status: 'free', next };
  if (outEv && inEv) Object.assign(out, { status: 'turn', outUrl: outEv.url || null, inUrl: inEv.url || null, until: inEv.end });
  else if (outEv) Object.assign(out, { status: 'out', outUrl: outEv.url || null });
  else if (inEv) Object.assign(out, { status: 'in', inUrl: inEv.url || null, until: inEv.end });
  else if (stayEv) Object.assign(out, { status: 'stay', until: stayEv.end, url: stayEv.url || null });
  else if (blocked) Object.assign(out, { status: 'blocked', note: next === addDays(d, 1) ? 'early-checkin' : null });
  return out;
}

// A unit is free for [checkin, checkout) if no booking or block overlaps it.
// Another guest's departure day can be an arrival day.
export const isFree = (events, checkin, checkout) => !events.some((e) => e.start < checkout && e.end > checkin);

export function isoDate(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

// Downloads and parses one unit's iCal. Null if the URL is not an Airbnb export or the request fails.
export async function fetchUnit(url) {
  if (!/^https:\/\/www\.airbnb\.[a-z.]+\/calendar\/ical\/\d+\.ics\?/.test(url || '')) return null;
  const res = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!res.ok) return null;
  return parseIcal(await res.text());
}

// Every configured unit's events, fetched in parallel. A unit whose calendar fails goes to `missing`.
export async function loadCalendars(env) {
  const units = unitsFrom(env);
  const results = await Promise.all(units.map((u) => fetchUnit(env[envName(u)]).catch(() => null)));
  const calendars = {}, missing = [];
  units.forEach((u, i) => { if (results[i]) calendars[u] = results[i]; else missing.push(u); });
  return { units, calendars, missing };
}
