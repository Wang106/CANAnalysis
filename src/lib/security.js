const encoder = new TextEncoder();

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

export async function sha256(value) {
  return toBase64Url(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
}

export async function passwordDigest(password, salt = randomToken(16), iterations = 210000) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(salt), iterations}, material, 256);
  return {hash: toBase64Url(bits), salt, iterations};
}

export async function verifyPassword(password, expectedHash, salt, iterations) {
  const actual = await passwordDigest(password, salt, iterations);
  const left = fromBase64Url(actual.hash), right = fromBase64Url(expectedHash);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function parseCookies(request) {
  const result = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `can_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return 'can_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export async function requestFingerprint(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const salt = env.LOG_HASH_SALT || 'development-only';
  return {ipHash: ip ? await sha256(`${salt}:ip:${ip}`) : null, userAgentHash: userAgent ? await sha256(`${salt}:ua:${userAgent}`) : null};
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

export function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 ? value : '';
}

export function normalizeName(name) {
  const value = String(name || '').trim().replace(/\s+/g, ' ');
  return value.length >= 2 && value.length <= 32 ? value : '';
}
