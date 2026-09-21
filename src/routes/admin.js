import {json, problem, readJson} from '../lib/http.js';
import {requireAdmin} from '../lib/access.js';
import {audit, requireUser} from '../lib/auth.js';
import {nowIso, uuid} from '../lib/security.js';

const reportStates = new Set(['pending', 'investigating', 'actioned', 'dismissed', 'closed']);
const appealStates = new Set(['pending', 'reviewing', 'upheld', 'reversed']);

export async function adminRoutes(request, env, path, url) {
  if (!path.startsWith('/api/admin/')) return null;
  const admin = await requireAdmin(request, env);
  if (request.method === 'GET' && path === '/api/admin/overview') {
    const [users, comments, reports, appeals, outbox] = await Promise.all([
      env.DB.prepare(`SELECT count(*) count FROM users WHERE status='active'`).first(),
      env.DB.prepare(`SELECT count(*) count FROM comments WHERE status='visible'`).first(),
      env.DB.prepare(`SELECT count(*) count FROM reports WHERE status IN ('pending','investigating')`).first(),
      env.DB.prepare(`SELECT count(*) count FROM appeals WHERE status IN ('pending','reviewing')`).first(),
      env.DB.prepare(`SELECT count(*) count FROM outbox WHERE status='failed'`).first()
    ]);
    return json({users: users.count, comments: comments.count, openReports: reports.count, openAppeals: appeals.count, failedNotifications: outbox.count});
  }
  if (request.method === 'GET' && path === '/api/admin/reports') {
    const status = url.searchParams.get('status') || 'pending';
    if (!reportStates.has(status)) return problem(400, 'INVALID_STATUS', '无效状态');
    const {results} = await env.DB.prepare(`SELECT r.*,u.display_name reporter_name FROM reports r LEFT JOIN users u ON u.id=r.reporter_user_id WHERE r.status=? ORDER BY r.created_at LIMIT 100`).bind(status).all();
    return json({reports: results});
  }
  if (request.method === 'GET' && path === '/api/admin/comments') {
    const status = url.searchParams.get('status') || 'visible';
    if (!['visible', 'hidden', 'deleted'].includes(status)) return problem(400, 'INVALID_STATUS', '无效状态');
    const {results} = await env.DB.prepare(`SELECT c.id,c.body,c.status,c.created_at,c.updated_at,CASE WHEN u.id IS NULL THEN '已注销账号' ELSE u.display_name END display_name
      FROM comments c LEFT JOIN users u ON u.id=c.author_user_id WHERE c.status=? ORDER BY c.created_at DESC LIMIT 100`).bind(status).all();
    return json({comments: results});
  }
  const reportMatch = path.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (request.method === 'PATCH' && reportMatch) {
    const body = await readJson(request), status = String(body.status || ''), resolution = String(body.resolution || '').trim();
    if (!reportStates.has(status) || resolution.length < 2 || resolution.length > 1000) return problem(400, 'INVALID_RESOLUTION', '请选择状态并填写处理理由');
    const report = await env.DB.prepare('SELECT id FROM reports WHERE id=?').bind(reportMatch[1]).first();
    if (!report) return problem(404, 'NOT_FOUND', '举报不存在');
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare('UPDATE reports SET status=?,resolution=?,updated_at=? WHERE id=?').bind(status, resolution, now, report.id),
      env.DB.prepare('INSERT INTO moderation_actions(id,admin_email,target_type,target_id,action,reason,created_at) VALUES(?,?,?,?,?,?,?)').bind(uuid(), admin.email, 'report', report.id, status, resolution, now)
    ]);
    await audit(env, request, 'report.moderated', {adminEmail: admin.email, targetType: 'report', targetId: report.id, metadata: {status}});
    return json({ok: true});
  }
  const commentMatch = path.match(/^\/api\/admin\/comments\/([^/]+)$/);
  if (request.method === 'PATCH' && commentMatch) {
    const body = await readJson(request), status = String(body.status || ''), reason = String(body.reason || '').trim();
    if (!['visible', 'hidden', 'deleted'].includes(status) || reason.length < 2 || reason.length > 1000) return problem(400, 'INVALID_ACTION', '请选择状态并填写处理理由');
    const now = nowIso();
    const result = await env.DB.prepare('UPDATE comments SET status=?,updated_at=? WHERE id=?').bind(status, now, commentMatch[1]).run();
    if (!result.meta.changes) return problem(404, 'NOT_FOUND', '评论不存在');
    await env.DB.prepare('INSERT INTO moderation_actions(id,admin_email,target_type,target_id,action,reason,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(uuid(), admin.email, 'comment', commentMatch[1], status, reason, now).run();
    await audit(env, request, 'comment.moderated', {adminEmail: admin.email, targetType: 'comment', targetId: commentMatch[1], metadata: {status}});
    return json({ok: true});
  }
  if (request.method === 'GET' && path === '/api/admin/appeals') {
    const status = url.searchParams.get('status') || 'pending';
    if (!appealStates.has(status)) return problem(400, 'INVALID_STATUS', '无效状态');
    const {results} = await env.DB.prepare('SELECT * FROM appeals WHERE status=? ORDER BY created_at LIMIT 100').bind(status).all();
    return json({appeals: results});
  }
  const appealMatch = path.match(/^\/api\/admin\/appeals\/([^/]+)$/);
  if (request.method === 'PATCH' && appealMatch) {
    const body = await readJson(request), status = String(body.status || ''), resolution = String(body.resolution || '').trim();
    if (!appealStates.has(status) || resolution.length < 2 || resolution.length > 1000) return problem(400, 'INVALID_RESOLUTION', '请选择状态并填写复核理由');
    const now = nowIso();
    const result = await env.DB.prepare('UPDATE appeals SET status=?,resolution=?,updated_at=? WHERE id=?').bind(status, resolution, now, appealMatch[1]).run();
    if (!result.meta.changes) return problem(404, 'NOT_FOUND', '申诉不存在');
    await env.DB.prepare('INSERT INTO moderation_actions(id,admin_email,target_type,target_id,action,reason,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(uuid(), admin.email, 'appeal', appealMatch[1], status, resolution, now).run();
    await audit(env, request, 'appeal.reviewed', {adminEmail: admin.email, targetType: 'appeal', targetId: appealMatch[1], metadata: {status}});
    return json({ok: true});
  }
  return problem(404, 'NOT_FOUND', '接口不存在');
}

export async function appealRoute(request, env, path) {
  const match = path.match(/^\/api\/reports\/([^/]+)\/appeals$/);
  if (request.method !== 'POST' || !match) return null;
  const user = await requireUser(request, env), body = await readJson(request), content = String(body.body || '').trim();
  if (content.length < 10 || content.length > 2000) return problem(400, 'INVALID_APPEAL', '申诉说明应为10–2000字');
  const report = await env.DB.prepare(`SELECT r.id,c.author_user_id FROM reports r JOIN comments c ON c.id=r.comment_id WHERE r.id=? AND r.status='actioned'`).bind(match[1]).first();
  if (!report || report.author_user_id !== user.id) return problem(403, 'NOT_APPEALABLE', '当前账号不能对该处理结果申诉');
  if (await env.DB.prepare(`SELECT 1 FROM appeals WHERE report_id=? AND appellant_user_id=? AND status IN ('pending','reviewing')`).bind(report.id, user.id).first()) return problem(409, 'APPEAL_EXISTS', '已有申诉正在处理');
  const id = uuid(), now = nowIso();
  await env.DB.prepare('INSERT INTO appeals(id,appellant_user_id,report_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id, user.id, report.id, content, now, now).run();
  await audit(env, request, 'appeal.created', {userId: user.id, targetType: 'appeal', targetId: id});
  return json({id}, 201);
}
