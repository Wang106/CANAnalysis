export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers}});
}

export function problem(status, code, message) {
  return json({error: {code, message}}, status);
}

export async function readJson(request, maxBytes = 32768) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw new Response('Payload too large', {status: 413});
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Response('Payload too large', {status: 413});
  try { return JSON.parse(text || '{}'); } catch { throw new Response('Invalid JSON', {status: 400}); }
}

export function assertSameOrigin(request, env) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  const expected = new URL(env.APP_ORIGIN || request.url).origin;
  if (origin !== expected) throw new Response('Forbidden origin', {status: 403});
}

export function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
