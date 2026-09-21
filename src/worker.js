import {securityHeaders, assertSameOrigin, json, problem} from './lib/http.js';
import {authRoutes} from './routes/auth.js';
import {communityRoutes} from './routes/community.js';
import {accountRoutes} from './routes/account.js';
import {fileRoutes} from './routes/files.js';
import {adminRoutes, appealRoute} from './routes/admin.js';
import {deliverOutbox} from './lib/outbox.js';

async function route(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/health') {
    const required = ['ADMIN_EMAIL', 'LOG_HASH_SALT', 'TURNSTILE_SECRET', 'TURNSTILE_SITE_KEY', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'RESEND_API_KEY', 'MAIL_FROM'];
    const missingConfiguration = required.filter(key => !env[key]);
    return json({ok: true, communityEnabled: env.COMMUNITY_ENABLED === 'true', communityReady: missingConfiguration.length === 0, missingConfiguration});
  }
  if (path === '/api/config') return json({communityEnabled: env.COMMUNITY_ENABLED === 'true', turnstileSiteKey: env.TURNSTILE_SITE_KEY || ''});
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (env.COMMUNITY_ENABLED !== 'true') return problem(503, 'COMMUNITY_NOT_READY', '社区功能正在配置中');
  assertSameOrigin(request, env);
  for (const handler of [authRoutes, accountRoutes, fileRoutes, appealRoute, adminRoutes, communityRoutes]) {
    const response = await handler(request, env, path, url);
    if (response) return response;
  }
  return problem(404, 'NOT_FOUND', '接口不存在');
}

export default {
  async fetch(request, env, ctx) {
    try { return securityHeaders(await route(request, env, ctx)); }
    catch (error) {
      if (error instanceof Response) return securityHeaders(error);
      console.error('request_failed', {path: new URL(request.url).pathname, message: error?.message});
      return securityHeaders(problem(500, 'INTERNAL_ERROR', '服务器暂时无法处理请求'));
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try { await deliverOutbox(env, message.body.outboxId); message.ack(); }
      catch (error) { console.error('mail_delivery_failed', {message: error?.message}); message.retry(); }
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(new Date().toISOString()),
        env.DB.prepare('DELETE FROM email_tokens WHERE expires_at<?').bind(new Date(Date.now() - 86400000).toISOString()),
        env.DB.prepare('DELETE FROM rate_limits WHERE bucket<?').bind(Math.floor(Date.now() / 60000) - 1440)
      ]);
      if (env.MAIL_QUEUE) {
        const pending = await env.DB.prepare(`SELECT id FROM outbox WHERE status IN ('pending','failed') AND attempts<8 ORDER BY created_at LIMIT 50`).all();
        if (pending.results.length) await env.MAIL_QUEUE.sendBatch(pending.results.map(row => ({body: {outboxId: row.id}})));
      }
    })());
  }
};
