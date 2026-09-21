import {json, problem} from '../lib/http.js';
import {requireUser} from '../lib/auth.js';
import {rateLimit} from '../lib/abuse.js';
import {nowIso, sha256, uuid} from '../lib/security.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasPrefix(bytes, prefix) { return prefix.every((value, index) => bytes[index] === value); }
function contentMatches(type, buffer) {
  const bytes = new Uint8Array(buffer);
  if (type === 'image/jpeg') return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (type === 'image/png') return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === 'image/webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (type === 'text/plain' || type === 'text/csv') return !bytes.slice(0, Math.min(bytes.length, 4096)).includes(0);
  return false;
}

export async function fileRoutes(request, env, path) {
  if (request.method === 'POST' && path === '/api/files') {
    const user = await requireUser(request, env);
    await rateLimit(request, env, 'file-user', 10, user.id);
    const form = await request.formData(), file = form.get('file'), purpose = String(form.get('purpose') || 'comment_attachment');
    if (!(file instanceof File) || !['avatar', 'comment_attachment'].includes(purpose)) return problem(400, 'INVALID_FILE', '请选择有效文件');
    const max = purpose === 'avatar' ? 2 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!allowed.has(file.type) || (purpose === 'avatar' && !imageTypes.has(file.type)) || file.size < 1 || file.size > max) return problem(400, 'INVALID_FILE', '文件类型或大小不符合要求');
    const buffer = await file.arrayBuffer();
    if (!contentMatches(file.type, buffer)) return problem(400, 'FILE_SIGNATURE_MISMATCH', '文件内容与声明类型不一致');
    const id = uuid(), objectKey = `${user.id}/${purpose}/${id}`;
    await env.FILES.put(objectKey, buffer, {httpMetadata: {contentType: file.type}, customMetadata: {owner: user.id, originalName: file.name.slice(0, 180)}});
    await env.DB.prepare(`INSERT INTO files(id,owner_user_id,object_key,original_name,content_type,byte_size,sha256,purpose,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, user.id, objectKey, file.name.slice(0, 180), file.type, file.size, await sha256(buffer), purpose, 'ready', nowIso()).run();
    return json({id, name: file.name, contentType: file.type, byteSize: file.size}, 201);
  }

  const match = path.match(/^\/api\/files\/([^/]+)$/);
  if (request.method === 'GET' && match) {
    const file = await env.DB.prepare(`SELECT f.*,c.status comment_status FROM files f LEFT JOIN comment_files cf ON cf.file_id=f.id LEFT JOIN comments c ON c.id=cf.comment_id WHERE f.id=?`).bind(match[1]).first();
    if (!file || file.status !== 'ready' || (file.purpose === 'comment_attachment' && file.comment_status !== 'visible')) return new Response('Not found', {status: 404});
    const object = await env.FILES.get(file.object_key);
    if (!object) return new Response('Not found', {status: 404});
    const headers = new Headers();object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `${file.purpose === 'avatar' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    headers.set('X-Content-Type-Options', 'nosniff');headers.set('Cache-Control', 'private, max-age=300');
    return new Response(object.body, {headers});
  }
  if (request.method === 'DELETE' && match) {
    const user = await requireUser(request, env);
    const file = await env.DB.prepare(`SELECT f.object_key,(SELECT count(*) FROM comment_files cf WHERE cf.file_id=f.id) attachment_count FROM files f WHERE f.id=? AND f.owner_user_id=? AND f.status='ready'`).bind(match[1], user.id).first();
    if (!file) return problem(404, 'NOT_FOUND', '文件不存在或不属于当前账号');
    if (file.attachment_count) return problem(409, 'FILE_IN_USE', '请先删除引用该附件的评论');
    await env.FILES.delete(file.object_key);
    await env.DB.prepare(`UPDATE files SET status='deleted',deleted_at=? WHERE id=?`).bind(nowIso(), match[1]).run();
    return json({ok: true});
  }
  return null;
}
