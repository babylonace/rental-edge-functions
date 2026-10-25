// Runs on the guide pages and /api/* (limit it with _routes.json).
// If the URL carries ?k=, it checks the token, sets the cookie when valid and redirects to the same URL
// without k, so the token does not stay in the browser history. An invalid k is also removed, with no cookie.
import { matchToken, makeCookie } from '../lib/guest-auth.js';

export const PRIVATE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.searchParams.has('k') && (request.method === 'GET' || request.method === 'HEAD')) {
    const token = await matchToken(url.searchParams.get('k'), env);
    url.searchParams.delete('k');
    const headers = new Headers(PRIVATE_HEADERS);
    headers.set('Location', url.pathname + url.search);
    headers.set('Cache-Control', 'no-store');
    if (token) headers.append('Set-Cookie', await makeCookie(token));
    return new Response(null, { status: 302, headers });
  }

  // Pages does not apply _headers to responses that go through Functions, so the privacy headers are set here.
  // They overwrite, never just fill in: Pages already sends its own Referrer-Policy (strict-origin-when-cross-origin).
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) out.headers.set(k, v);
  return out;
}
