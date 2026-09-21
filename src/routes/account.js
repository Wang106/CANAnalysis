import {json, problem, readJson} from '../lib/http.js';
import {audit, requireUser} from '../lib/auth.js';
import {normalizeName, nowIso, passwordDigest, validatePassword, verifyPassword} from '../lib/security.js';

export async function accountRoutes(request, env, path) {
  if (request.method === 'PATCH' && path === '/api/me') {
    const user = await requireUser(request, env), body = await readJson(request);
    const displayName = normalizeName(body.displayName);
    const bio = String(body.bio || '').trim();
    if (!displayName || bio.length > 280) return problem(400, 'INVALID_PROFILE', '昵称应为2–32字，个性签名不超过280字');
    const avatar = Object.hasOwn(body, 'avatarFileId') ? (body.avatarFileId || null) : user.avatar_file_id;
    if (avatar) {
      const ownedAvatar = await env.DB.prepare(`SELECT id FROM files WHERE id=? AND owner_user_id=? AND purpose='avatar' AND status='ready'`).bind(avatar, user.id).first();
      if (!ownedAvatar) return problem(400, 'INVALID_AVATAR', '头像文件无效或不属于当前账号');
    }
    await env.DB.prepare('UPDATE users SET display_name=?,bio=?,avatar_file_id=?,updated_at=? WHERE id=?').bind(displayName, bio, avatar, nowIso(), user.id).run();
    if (user.avatar_file_id && user.avatar_file_id !== avatar) {
      const previous = await env.DB.prepare(`SELECT object_key FROM files WHERE id=? AND owner_user_id=? AND purpose='avatar'`).bind(user.avatar_file_id, user.id).first();
      if (previous) {
        await env.FILES.delete(previous.object_key).catch(() => {});
        await env.DB.prepare(`UPDATE files SET status='deleted',deleted_at=? WHERE id=?`).bind(nowIso(), user.avatar_file_id).run();
      }
    }
    await audit(env, request, 'profile.updated', {userId: user.id});
    return json({ok: true});
  }

  if (request.method === 'GET' && path === '/api/me/export') {
    const user = await requireUser(request, env);
    const [comments, files, reports, appeals, consents] = await Promise.all([
      env.DB.prepare('SELECT id,body,status,created_at,updated_at FROM comments WHERE author_user_id=? ORDER BY created_at').bind(user.id).all(),
      env.DB.prepare('SELECT id,original_name,content_type,byte_size,purpose,status,created_at FROM files WHERE owner_user_id=? ORDER BY created_at').bind(user.id).all(),
      env.DB.prepare('SELECT id,comment_id,reason,details,status,resolution,created_at,updated_at FROM reports WHERE reporter_user_id=? ORDER BY created_at').bind(user.id).all(),
      env.DB.prepare('SELECT id,report_id,body,status,resolution,created_at,updated_at FROM appeals WHERE appellant_user_id=? ORDER BY created_at').bind(user.id).all(),
      env.DB.prepare('SELECT policy_version,cross_border,created_at FROM consent_records WHERE user_id=? ORDER BY created_at').bind(user.id).all()
    ]);
    await audit(env, request, 'account.exported', {userId: user.id});
    return json({exportedAt: nowIso(), profile: {id: user.id, email: user.email, displayName: user.display_name, bio: user.bio}, comments: comments.results, files: files.results, reports: reports.results, appeals: appeals.results, consents: consents.results});
  }

  if (request.method === 'POST' && path === '/api/me/change-password') {
    const user = await requireUser(request, env), body = await readJson(request);
    if (!validatePassword(body.newPassword)) return problem(400, 'WEAK_PASSWORD', '新密码至少需要12位');
    const stored = await env.DB.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(user.id).first();
    if (!await verifyPassword(String(body.currentPassword || ''), stored.password_hash, stored.password_salt, stored.password_iterations)) return problem(401, 'PASSWORD_REQUIRED', '当前密码错误');
    const password = await passwordDigest(body.newPassword), now = nowIso();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE id=?').bind(password.hash, password.salt, password.iterations, now, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
    ]);
    await audit(env, request, 'password.changed', {userId: user.id});
    return json({ok: true}, 200, {'Set-Cookie': 'can_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  }

  if (request.method === 'DELETE' && path === '/api/me') {
    const user = await requireUser(request, env), body = await readJson(request);
    const stored = await env.DB.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(user.id).first();
    if (!await verifyPassword(String(body.password || ''), stored.password_hash, stored.password_salt, stored.password_iterations)) return problem(401, 'PASSWORD_REQUIRED', '密码验证失败');
    const ownedFiles = await env.DB.prepare('SELECT object_key FROM files WHERE owner_user_id=?').bind(user.id).all();
    for (const file of ownedFiles.results) await env.FILES.delete(file.object_key).catch(() => {});
    await audit(env, request, 'account.deleted', {userId: user.id});
    await env.DB.batch([
      env.DB.prepare('UPDATE comments SET author_user_id=NULL WHERE author_user_id=?').bind(user.id),
      env.DB.prepare('UPDATE files SET owner_user_id=NULL,status=?,deleted_at=? WHERE owner_user_id=?').bind('deleted', nowIso(), user.id),
      env.DB.prepare('DELETE FROM users WHERE id=?').bind(user.id)
    ]);
    return json({ok: true}, 200, {'Set-Cookie': 'can_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  }
  return null;
}
