import {fromBase64Url} from './security.js';

let cachedKeys = null;
let cachedAt = 0;

async function accessKeys(domain) {
  if (cachedKeys && Date.now() - cachedAt < 60 * 60 * 1000) return cachedKeys;
  const response = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error('Unable to load Access signing keys');
  cachedKeys = await response.json();
  cachedAt = Date.now();
  return cachedKeys;
}

export async function requireAdmin(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) throw new Response('Admin access required', {status: 401});
  const parts = token.split('.');
  if (parts.length !== 3) throw new Response('Invalid Access token', {status: 401});
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  if (header.alg !== 'RS256') throw new Response('Invalid Access algorithm', {status: 401});
  const keys = await accessKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = [...(keys.keys || []), ...(keys.public_certs || [])].find(candidate => candidate.kid === header.kid);
  if (!jwk) throw new Response('Unknown Access key', {status: 401});
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const expectedIssuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!valid || payload.exp * 1000 <= Date.now() || (payload.nbf && payload.nbf * 1000 > Date.now()) || payload.iss !== expectedIssuer || !audience.includes(env.ACCESS_AUD) || String(payload.email || '').toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    throw new Response('Admin access denied', {status: 403});
  }
  return {email: payload.email, subject: payload.sub};
}
