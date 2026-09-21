import {json, problem, readJson} from '../lib/http.js';
import {audit, createSession, currentUser} from '../lib/auth.js';
import {rateLimit, verifyTurnstile} from '../lib/abuse.js';
import {enqueueMail} from '../lib/outbox.js';
import {clearSessionCookie, normalizeEmail, normalizeName, nowIso, passwordDigest, randomToken, requestFingerprint, sha256, uuid, validatePassword, verifyPassword, parseCookies} from '../lib/security.js';

const publicUser = user => user ? ({id: user.id, email: user.email, emailVerified: Boolean(user.email_verified_at), displayName: user.display_name, bio: user.bio, avatarFileId: user.avatar_file_id, role: user.role}) : null;

export async function authRoutes(request, env, path) {
  if (request.method === 'GET' && path === '/api/auth/session') return json({user: publicUser(await currentUser(request, env))});

  if (request.method === 'POST' && path === '/api/auth/register') {
    await rateLimit(request, env, 'register', 5);
    const body = await readJson(request);
    await verifyTurnstile(request, env, body.turnstileToken);
    const email = normalizeEmail(body.email), displayName = normalizeName(body.displayName);
    if (!email || !displayName || !validatePassword(body.password)) return problem(400, 'INVALID_REGISTRATION', '请提供有效邮箱、2–32字昵称和至少12位密码');
    if (body.crossBorderConsent !== true || body.policyVersion !== env.POLICY_VERSION) return problem(400, 'CONSENT_REQUIRED', '必须阅读并单独同意个人信息跨境处理说明');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json({ok: true}, 202);
    const userId = uuid(), token = randomToken(), tokenHash = await sha256(token), createdAt = nowIso();
    const password = await passwordDigest(body.password);
    const {ipHash} = await requestFingerprint(request, env);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,email,password_hash,password_salt,password_iterations,display_name,consent_version,cross_border_consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, email, password.hash, password.salt, password.iterations, displayName, body.policyVersion, createdAt, createdAt, createdAt),
      env.DB.prepare(`INSERT INTO email_tokens(token_hash,user_id,purpose,created_at,expires_at) VALUES(?,?,?,?,?)`)
        .bind(tokenHash, userId, 'verify_email', createdAt, new Date(Date.now() + 30 * 60000).toISOString()),
      env.DB.prepare(`INSERT INTO consent_records(id,user_id,policy_version,cross_border,ip_hash,created_at) VALUES(?,?,?,?,?,?)`)
        .bind(uuid(), userId, body.policyVersion, 1, ipHash, createdAt)
    ]);
    const link = `${env.APP_ORIGIN}/community.html?verify=${encodeURIComponent(token)}`;
    await enqueueMail(env, 'verify_email', email, {subject: '验证 CANAnalysis 账号邮箱', text: `请在30分钟内打开以下链接完成邮箱验证：\n${link}`, html: `<p>请在30分钟内完成邮箱验证：</p><p><a href="${link}">验证邮箱</a></p>`});
    await audit(env, request, 'user.registered', {userId});
    return json({ok: true}, 202);
  }

  if (request.method === 'POST' && path === '/api/auth/verify-email') {
    await rateLimit(request, env, 'verify-email', 10);
    const {token} = await readJson(request);
    const hash = await sha256(String(token || ''));
    const record = await env.DB.prepare(`SELECT user_id,expires_at,used_at FROM email_tokens WHERE token_hash=? AND purpose='verify_email'`).bind(hash).first();
    if (!record || record.used_at || Date.parse(record.expires_at) <= Date.now()) return problem(400, 'INVALID_TOKEN', '验证链接无效或已过期');
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare('UPDATE email_tokens SET used_at=? WHERE token_hash=?').bind(now, hash),
      env.DB.prepare('UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?').bind(now, now, record.user_id)
    ]);
    return json({ok: true});
  }

  if (request.method === 'POST' && path === '/api/auth/login') {
    await rateLimit(request, env, 'login', 10);
    const body = await readJson(request);
    await verifyTurnstile(request, env, body.turnstileToken);
    const email = normalizeEmail(body.email);
    const user = email ? await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first() : null;
    const valid = user && await verifyPassword(String(body.password || ''), user.password_hash, user.password_salt, user.password_iterations);
    if (!valid || user.status !== 'active') return problem(401, 'INVALID_LOGIN', '邮箱或密码错误');
    if (!user.email_verified_at) return problem(403, 'EMAIL_NOT_VERIFIED', '请先完成邮箱验证');
    const cookie = await createSession(request, env, user.id);
    await audit(env, request, 'user.logged_in', {userId: user.id});
    return json({user: publicUser(user)}, 200, {'Set-Cookie': cookie});
  }

  if (request.method === 'POST' && path === '/api/auth/request-password-reset') {
    await rateLimit(request, env, 'password-reset', 5);
    const body = await readJson(request);
    await verifyTurnstile(request, env, body.turnstileToken);
    const email = normalizeEmail(body.email);
    const user = email ? await env.DB.prepare(`SELECT id,email FROM users WHERE email=? AND status='active'`).bind(email).first() : null;
    if (user) {
      const token = randomToken(), hash = await sha256(token), now = nowIso();
      await env.DB.prepare(`INSERT INTO email_tokens(token_hash,user_id,purpose,created_at,expires_at) VALUES(?,?,?,?,?)`)
        .bind(hash, user.id, 'reset_password', now, new Date(Date.now() + 20 * 60000).toISOString()).run();
      const link = `${env.APP_ORIGIN}/community.html?reset=${encodeURIComponent(token)}`;
      await enqueueMail(env, 'reset_password', user.email, {subject: '重置 CANAnalysis 账号密码', text: `请在20分钟内打开以下链接重置密码：\n${link}`, html: `<p>请在20分钟内重置密码：</p><p><a href="${link}">重置密码</a></p>`});
    }
    return json({ok: true}, 202);
  }

  if (request.method === 'POST' && path === '/api/auth/resend-verification') {
    await rateLimit(request, env, 'resend-verification', 3);
    const body = await readJson(request);
    await verifyTurnstile(request, env, body.turnstileToken);
    const email = normalizeEmail(body.email);
    const user = email ? await env.DB.prepare(`SELECT id,email FROM users WHERE email=? AND email_verified_at IS NULL AND status='active'`).bind(email).first() : null;
    if (user) {
      const token = randomToken(), hash = await sha256(token), now = nowIso();
      await env.DB.prepare(`INSERT INTO email_tokens(token_hash,user_id,purpose,created_at,expires_at) VALUES(?,?,?,?,?)`)
        .bind(hash, user.id, 'verify_email', now, new Date(Date.now() + 30 * 60000).toISOString()).run();
      const link = `${env.APP_ORIGIN}/community.html?verify=${encodeURIComponent(token)}`;
      await enqueueMail(env, 'verify_email', user.email, {subject: '验证 CANAnalysis 账号邮箱', text: `请在30分钟内打开以下链接完成邮箱验证：\n${link}`, html: `<p>请在30分钟内完成邮箱验证：</p><p><a href="${link}">验证邮箱</a></p>`});
    }
    return json({ok: true}, 202);
  }

  if (request.method === 'POST' && path === '/api/auth/reset-password') {
    await rateLimit(request, env, 'password-reset-confirm', 8);
    const body = await readJson(request);
    if (!validatePassword(body.password)) return problem(400, 'WEAK_PASSWORD', '新密码至少需要12位');
    const hash = await sha256(String(body.token || ''));
    const record = await env.DB.prepare(`SELECT user_id,expires_at,used_at FROM email_tokens WHERE token_hash=? AND purpose='reset_password'`).bind(hash).first();
    if (!record || record.used_at || Date.parse(record.expires_at) <= Date.now()) return problem(400, 'INVALID_TOKEN', '重置链接无效或已过期');
    const password = await passwordDigest(body.password), now = nowIso();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE id=?').bind(password.hash, password.salt, password.iterations, now, record.user_id),
      env.DB.prepare('UPDATE email_tokens SET used_at=? WHERE token_hash=?').bind(now, hash),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id)
    ]);
    return json({ok: true});
  }

  if (request.method === 'POST' && path === '/api/auth/logout') {
    const token = parseCookies(request).can_session;
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return json({ok: true}, 200, {'Set-Cookie': clearSessionCookie()});
  }

  return null;
}
