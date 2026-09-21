import {sha256} from './security.js';

export async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET) {
    if (env.REQUIRE_TURNSTILE === 'true') throw new Response('Anti-bot protection is unavailable', {status: 503});
    return;
  }
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined})
  });
  const result = await response.json();
  if (!result.success) throw new Response('Anti-bot verification failed', {status: 400});
}

export async function rateLimit(request, env, scope, limit, subject = '') {
  const raw = subject || request.headers.get('CF-Connecting-IP') || 'unknown';
  const hash = await sha256(`${env.LOG_HASH_SALT || 'development-only'}:${scope}:${raw}`);
  const bucket = Math.floor(Date.now() / 60000);
  const result = await env.DB.prepare(`INSERT INTO rate_limits(scope,subject_hash,bucket,count) VALUES(?,?,?,1)
    ON CONFLICT(scope,subject_hash,bucket) DO UPDATE SET count=count+1 RETURNING count`).bind(scope, hash, bucket).first();
  if ((result?.count || 1) > limit) throw new Response('Too many requests', {status: 429, headers: {'Retry-After': '60'}});
}
