import {json, problem, readJson} from '../lib/http.js';
import {audit, currentUser, requireUser} from '../lib/auth.js';
import {rateLimit} from '../lib/abuse.js';
import {enqueueMail} from '../lib/outbox.js';
import {nowIso, uuid} from '../lib/security.js';

const reasons = new Set(['harassment', 'hate', 'privacy', 'spam', 'illegal', 'other']);

export async function communityRoutes(request, env, path, url) {
  if (request.method === 'GET' && path === '/api/comments') {
    const viewer = await currentUser(request, env);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
    const before = url.searchParams.get('before') || '9999-12-31T23:59:59.999Z';
    const {results} = await env.DB.prepare(`SELECT c.id,c.author_user_id,c.body,c.created_at,c.updated_at,
      CASE WHEN u.id IS NULL THEN '已注销账号' ELSE u.display_name END display_name,
      CASE WHEN u.id IS NULL THEN NULL ELSE u.avatar_file_id END avatar_file_id
      FROM comments c LEFT JOIN users u ON u.id=c.author_user_id
      WHERE c.status='visible' AND c.created_at<? ORDER BY c.created_at DESC LIMIT ?`).bind(before, limit).all();
    for (const comment of results) {
      const files = await env.DB.prepare(`SELECT f.id,f.original_name,f.content_type,f.byte_size FROM comment_files cf JOIN files f ON f.id=cf.file_id
        WHERE cf.comment_id=? AND f.status='ready'`).bind(comment.id).all();
      comment.attachments = files.results;
      comment.canDelete = Boolean(viewer && comment.author_user_id === viewer.id);
      delete comment.author_user_id;
    }
    return json({comments: results, nextCursor: results.length === limit ? results.at(-1).created_at : null});
  }

  if (request.method === 'POST' && path === '/api/comments') {
    const user = await requireUser(request, env);
    await rateLimit(request, env, 'comment-user', 6, user.id);
    const body = await readJson(request);
    const content = String(body.body || '').trim();
    const fileIds = Array.isArray(body.fileIds) ? [...new Set(body.fileIds)].slice(0, 3) : [];
    if (content.length < 1 || content.length > 2000) return problem(400, 'INVALID_COMMENT', '评论长度应为1–2000字');
    const owned = [];
    for (const fileId of fileIds) {
      const file = await env.DB.prepare(`SELECT id FROM files WHERE id=? AND owner_user_id=? AND purpose='comment_attachment' AND status='ready'`).bind(fileId, user.id).first();
      if (!file) return problem(400, 'INVALID_ATTACHMENT', '附件无效或不属于当前账号');
      owned.push(file.id);
    }
    const id = uuid(), now = nowIso();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO comments(id,author_user_id,body,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, user.id, content, now, now),
      ...owned.map(fileId => env.DB.prepare('INSERT INTO comment_files(comment_id,file_id) VALUES(?,?)').bind(id, fileId))
    ]);
    await enqueueMail(env, 'new_comment', env.ADMIN_EMAIL, {subject: 'CANAnalysis 收到新评论', text: `${user.display_name}：${content.slice(0, 180)}\n\n${env.APP_ORIGIN}/admin`, html: `<p><strong>${escapeHtml(user.display_name)}</strong> 发布了新评论：</p><p>${escapeHtml(content.slice(0, 180))}</p><p><a href="${env.APP_ORIGIN}/admin">进入后台</a></p>`});
    await audit(env, request, 'comment.created', {userId: user.id, targetType: 'comment', targetId: id});
    return json({id, createdAt: now}, 201);
  }

  const reportMatch = path.match(/^\/api\/comments\/([^/]+)\/reports$/);
  if (request.method === 'POST' && reportMatch) {
    const user = await requireUser(request, env);
    await rateLimit(request, env, 'report-user', 5, user.id);
    const body = await readJson(request), reason = String(body.reason || '');
    if (!reasons.has(reason) || String(body.details || '').length > 1000) return problem(400, 'INVALID_REPORT', '请选择有效举报原因');
    const comment = await env.DB.prepare(`SELECT id,body FROM comments WHERE id=? AND status='visible'`).bind(reportMatch[1]).first();
    if (!comment) return problem(404, 'NOT_FOUND', '评论不存在');
    const id = uuid(), now = nowIso();
    await env.DB.prepare(`INSERT INTO reports(id,reporter_user_id,comment_id,reason,details,comment_snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id, user.id, comment.id, reason, String(body.details || '').trim(), comment.body, now, now).run();
    await enqueueMail(env, 'new_report', env.ADMIN_EMAIL, {subject: 'CANAnalysis 收到内容举报', text: `举报编号：${id}\n原因：${reason}\n${env.APP_ORIGIN}/admin`, html: `<p>收到新的内容举报：${id}</p><p><a href="${env.APP_ORIGIN}/admin">进入后台</a></p>`});
    await audit(env, request, 'report.created', {userId: user.id, targetType: 'report', targetId: id});
    return json({id}, 201);
  }
  const deleteMatch = path.match(/^\/api\/comments\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    const user = await requireUser(request, env);
    const comment = await env.DB.prepare('SELECT id FROM comments WHERE id=? AND author_user_id=?').bind(deleteMatch[1], user.id).first();
    if (!comment) return problem(404, 'NOT_FOUND', '评论不存在或不属于当前账号');
    const attachments = await env.DB.prepare(`SELECT f.id,f.object_key FROM files f JOIN comment_files cf ON cf.file_id=f.id WHERE cf.comment_id=? AND f.owner_user_id=? AND f.status='ready'`).bind(comment.id, user.id).all();
    for (const file of attachments.results) await env.FILES.delete(file.object_key).catch(() => {});
    const now = nowIso();
    if (attachments.results.length) {
      await env.DB.prepare(`UPDATE files SET status='deleted',deleted_at=? WHERE id IN (SELECT file_id FROM comment_files WHERE comment_id=?)`).bind(now, comment.id).run();
    }
    await env.DB.prepare(`UPDATE comments SET status='deleted',body='[内容已由作者删除]',updated_at=? WHERE id=?`).bind(now, comment.id).run();
    await audit(env, request, 'comment.deleted_by_author', {userId: user.id, targetType: 'comment', targetId: comment.id});
    return json({ok: true});
  }
  return null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}
