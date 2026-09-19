import http from 'node:http';
import { readFile } from 'node:fs/promises';
import unlock from '../api/unlock.js';
import document from '../api/document.js';

// Explicit public allowlist: never serve the repository root or private document.
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']], ['/type.css', ['type.css', 'text/css']],
  ['/app.js', ['app.js', 'application/javascript']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/privacy.html', ['privacy.html', 'text/html']],
]);
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const server = http.createServer(async (req, res) => {
  for (const header of config.headers[0].headers) res.setHeader(header.key, header.value);
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/unlock') return await unlock(req, res);
    if (pathname === '/api/document') return await document(req, res);
    const entry = files.get(pathname);
    if (!entry || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', `${entry[1]}; charset=utf-8`);
    const contents = await readFile(new URL(`../public/${entry[0]}`, import.meta.url));
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch { res.writeHead(500); res.end('Temporarily unavailable'); }
});
server.listen(3000, '127.0.0.1', () => console.log('College Awareness preview: http://127.0.0.1:3000'));
