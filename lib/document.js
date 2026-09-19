import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readDocument() {
  return readFile(path.join(process.cwd(), 'College Scholarship Resources.md'), 'utf8');
}

function escape(text) { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function inline(text) {
  return escape(text).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Render only the trusted document's small Markdown subset. Raw HTML is escaped.
export function renderDocument(markdown) {
  return markdown.trim().split(/\n\s*\n/).map(block => {
    if (/^---+$/.test(block)) return '<hr>';
    const heading = block.match(/^(#{1,3}) (.+)$/);
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    const lines = block.split('\n');
    if (lines.every(line => /^\d+\. /.test(line))) return `<ol>${lines.map(line => `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    if (lines.every(line => /^- /.test(line))) return `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${inline(block).replaceAll('\n', '<br>')}</p>`;
  }).join('\n');
}
