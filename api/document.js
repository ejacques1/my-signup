import { hasAccess, json, noStore } from '../lib/access.js';
import { readDocument, renderDocument } from '../lib/document.js';

export default async function document(req, res) {
  noStore(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Method not allowed.' }); }
  if (!hasAccess(req)) return json(res, 401, { error: 'Enter your email to unlock the guide.' });
  try {
    const markdown = await readDocument();
    if (new URL(req.url, 'http://localhost').searchParams.get('download') === '1') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="College Scholarship Resources.md"');
      return res.end(markdown);
    }
    return json(res, 200, { html: renderDocument(markdown) });
  } catch { return json(res, 503, { error: 'Your guide is temporarily unavailable. Please try again.' }); }
}
