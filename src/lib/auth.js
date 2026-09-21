import {parseCookies, requestFingerprint, sessionCookie, sha256, uuid, nowIso} from './security.js';

export async function currentUser(request, env) {
  const token = parseCookies(request).can_session;
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.email,u.email_verified_at,u.display_name,u.bio,u.avatar_file_id,u.role,u.status,s.expires_at,s.last_seen_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).bind(hash).first();
  if (!row || row.status !== 'active' || Date.parse(row.expires_at) <= Date.now()) return null;
  if (Date.now() - Date.parse(row.last_seen_at) > 5 * 60000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(nowIso(), hash).run().catch(() => {});
  }
  return row;
}

export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new Response('Authentication required', {status: 401});
  if (!user.email_verified_at) throw new Response('Verified email required', {status: 403});
  return user;
}

export async function createSession(request, env, userId) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const fingerprint = await requestFingerprint(request, env);
  await env.DB.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,ip_hash,user_agent_hash) VALUES(?,?,?,?,?,?,?)`)
    .bind(tokenHash, userId, createdAt, expiresAt, createdAt, fingerprint.ipHash, fingerprint.userAgentHash).run();
  return sessionCookie(token);
}

export async function audit(env, request, action, {userId = null, adminEmail = null, targetType = null, targetId = null, metadata = {}} = {}) {
  const {ipHash} = await requestFingerprint(request, env);
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,actor_admin_email,action,target_type,target_id,metadata_json,ip_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uuid(), userId, adminEmail, action, targetType, targetId, JSON.stringify(metadata), ipHash, nowIso()).run();
}
