import { readFile, readdir } from 'node:fs/promises';
import { readDocument } from '../lib/document.js';

const document = await readDocument();
if (!document.includes('College Scholarship Resources')) throw new Error('Private document missing');
const allowed = new Set(['index.html', 'styles.css', 'type.css', 'app.js', 'favicon.svg', 'privacy.html']);
for (const file of await readdir('public')) {
  if (!allowed.has(file)) throw new Error(`Unexpected public asset: ${file}`);
  const text = await readFile(`public/${file}`, 'utf8');
  if (text.includes('careeronestop.org') || text.includes('SYSTEME_API_KEY')) throw new Error('Private content found in public assets');
}
console.log('Public assets checked. Private resource is available only through the authenticated API.');
