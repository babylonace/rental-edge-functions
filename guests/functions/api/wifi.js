// GET /api/wifi: network name and password, only with the cookie from the check-in link. Otherwise 401.
import { hasValidCookie } from '../../lib/guest-auth.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await hasValidCookie(request, env))) return json({ error: 'locked' }, 401);
  if (!env.WIFI_SSID || !env.WIFI_PASS) return json({ error: 'not-configured' }, 503);
  return json({ ssid: env.WIFI_SSID, password: env.WIFI_PASS }, 200);
}
