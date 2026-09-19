import { accessCookie, apiKey, json, noStore } from '../lib/access.js';
import { saveAndTag } from '../lib/systeme.js';

// Best-effort warm-instance throttling, supplemented by Vercel's platform protection.
const attempts = new Map();
function rateLimited(req) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const state = attempts.get(ip) || { count: 0, expires: now + 60000 };
  state.count++;
  if (attempts.size < 5000 || attempts.has(ip)) attempts.set(ip, state);
  return state.count > 10;
}

export function createUnlockHandler(save = saveAndTag) {
  return async function unlock(req, res) {
    noStore(res);
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed.' }); }
    try {
      const origin = new URL(req.headers.origin || '');
      const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
      if (origin.host !== req.headers.host || (!local && origin.protocol !== 'https:') || req.headers['sec-fetch-site'] === 'cross-site') throw new Error();
    } catch { return json(res, 403, { error: 'Please submit the form from this website.' }); }
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Please use the signup form.' });
    if (rateLimited(req)) { res.setHeader('Retry-After', '60'); return json(res, 429, { error: 'Please wait a minute before trying again.' }); }
    let body;
    try {
      if (Number(req.headers['content-length']) > 4096) throw new Error();
      if (req.body !== undefined) {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > 4096) throw new Error();
        body = JSON.parse(raw);
      } else {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4096) throw new Error(); }
        body = JSON.parse(raw);
      }
    } catch { return json(res, 400, { error: 'Please enter a valid email address.' }); }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (body?.website || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });
    try {
      apiKey();
      await save(email);
      res.setHeader('Set-Cookie', accessCookie(req));
      return json(res, 200, { success: true });
    } catch {
      // Never return provider errors, contact details, or secrets to visitors/logs.
      return json(res, 503, { error: 'We couldn’t confirm your signup right now. Your guide is still locked. Please try again shortly.' });
    }
  };
}

export default createUnlockHandler();
