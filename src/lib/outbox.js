import {nowIso, uuid} from './security.js';

export async function enqueueMail(env, eventType, recipient, payload) {
  if (!recipient) {
    console.error('mail_recipient_missing', {eventType});
    return null;
  }
  const id = uuid();
  await env.DB.prepare('INSERT INTO outbox(id,event_type,recipient,payload_json,created_at) VALUES(?,?,?,?,?)')
    .bind(id, eventType, recipient, JSON.stringify(payload), nowIso()).run();
  if (env.MAIL_QUEUE) await env.MAIL_QUEUE.send({outboxId: id}).catch(() => {});
  return id;
}

export async function deliverOutbox(env, outboxId) {
  const row = await env.DB.prepare('SELECT * FROM outbox WHERE id=? AND status!=?').bind(outboxId, 'sent').first();
  if (!row) return;
  const payload = JSON.parse(row.payload_json);
  await env.DB.prepare('UPDATE outbox SET status=?,attempts=attempts+1 WHERE id=?').bind('sending', outboxId).run();
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    await env.DB.prepare('UPDATE outbox SET status=?,last_error=? WHERE id=?').bind('failed', 'Mail provider is not configured', outboxId).run();
    throw new Error('Mail provider is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: {'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': outboxId},
    body: JSON.stringify({from: env.MAIL_FROM, to: [row.recipient], subject: payload.subject, text: payload.text, html: payload.html})
  });
  if (!response.ok) {
    const error = (await response.text()).slice(0, 500);
    await env.DB.prepare('UPDATE outbox SET status=?,last_error=? WHERE id=?').bind('failed', error, outboxId).run();
    throw new Error(`Mail delivery failed: ${response.status}`);
  }
  await env.DB.prepare('UPDATE outbox SET status=?,sent_at=?,last_error=NULL WHERE id=?').bind('sent', nowIso(), outboxId).run();
}
