import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail, normalizeName, passwordDigest, validatePassword, verifyPassword} from '../src/lib/security.js';
import {assertSameOrigin, securityHeaders} from '../src/lib/http.js';

test('passwords use a salted PBKDF2 digest and constant-time comparison', async () => {
  const first = await passwordDigest('a-long-and-unique-password');
  const second = await passwordDigest('a-long-and-unique-password');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword('a-long-and-unique-password', first.hash, first.salt, first.iterations), true);
  assert.equal(await verifyPassword('wrong-password', first.hash, first.salt, first.iterations), false);
});

test('registration fields are normalized and bounded', () => {
  assert.equal(normalizeEmail(' User@Example.COM '), 'user@example.com');
  assert.equal(normalizeEmail('not-an-email'), '');
  assert.equal(normalizeName('  CAN   工程师  '), 'CAN 工程师');
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('correct-horse-battery-staple'), true);
});

test('state-changing requests require the configured same origin', () => {
  const env = {APP_ORIGIN: 'https://can.whf969.com'};
  assert.doesNotThrow(() => assertSameOrigin(new Request('https://can.whf969.com/api/me', {method: 'POST', headers: {Origin: 'https://can.whf969.com'}}), env));
  assert.throws(() => assertSameOrigin(new Request('https://can.whf969.com/api/me', {method: 'POST'}), env), Response);
  assert.throws(() => assertSameOrigin(new Request('https://can.whf969.com/api/me', {method: 'POST', headers: {Origin: 'https://evil.example'}}), env), Response);
});

test('responses receive browser hardening headers', () => {
  const response = securityHeaders(new Response('ok'));
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
});
