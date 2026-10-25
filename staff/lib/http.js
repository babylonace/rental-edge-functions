// JSON responses and the CORS origin check shared by the staff functions.

export const PRIVATE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff'
};

export function json(body, status, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Cache-Control': 'no-store', ...headers }
  });
}

// ALLOWED_ORIGINS is a comma-separated list of exact origins. A rule like "https://*.example.pages.dev"
// matches exactly one extra subdomain label (branch previews), never a suffix such as "evil-example.pages.dev".
export function originAllowed(origin, list) {
  if (!origin) return false;
  const m = /^([a-z]+):\/\/([a-z0-9-]+)\.([a-z0-9.-]+(?::\d+)?)$/.exec(origin);
  return String(list || '').split(',').map((r) => r.trim()).filter(Boolean).some((rule) => {
    if (!rule.includes('*')) return rule === origin;
    const w = /^([a-z]+):\/\/\*\.([a-z0-9.-]+(?::\d+)?)$/.exec(rule);
    return !!(w && m && m[1] === w[1] && m[3] === w[2]);
  });
}
