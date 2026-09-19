import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'ca_guide_access';
export const MAX_AGE = 24 * 60 * 60;

export function apiKey() {
  const key = process.env.SYSTEME_API_KEY?.trim();
  if (!key || key === '[SENSITIVE]') throw new Error('Server configuration unavailable');
  return key;
}

function signature(payload) {
  // Purpose-separated derivation; the API credential never leaves the server.
  const signingKey = createHmac('sha256', apiKey()).update('college-awareness:document-access:v1').digest();
  return createHmac('sha256', signingKey).update(payload).digest('base64url');
}

export function issueAccess(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + MAX_AGE, scope: 'scholarship-guide-v1', nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function hasAccess(req, now = Date.now()) {
  try {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (!token || token.length > 2048) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, mac] = parts;
    const expected = Buffer.from(signature(payload));
    const provided = Buffer.from(mac);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    return data.scope === 'scholarship-guide-v1' && Number.isInteger(data.exp) && data.exp > seconds && data.exp <= seconds + MAX_AGE;
  } catch {
    return false;
  }
}

export function accessCookie(req) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
  return `${COOKIE_NAME}=${issueAccess()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}${local && !process.env.VERCEL ? '' : '; Secure'}`;
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
