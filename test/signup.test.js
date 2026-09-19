import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { saveAndTag } from '../lib/systeme.js';
import { issueAccess, hasAccess, COOKIE_NAME, MAX_AGE } from '../lib/access.js';
import { createUnlockHandler } from '../api/unlock.js';
import document from '../api/document.js';
import { renderDocument } from '../lib/document.js';

process.env.SYSTEME_API_KEY = 'local-test-key-never-used-with-systeme';
const tag = { id: 9, name: 'Download' };
const email = 'student@example.com';
const contact = { id: 42, email, tags: [] };
const verified = { ...contact, tags: [tag] };

function fakeClient(steps) {
  return async (path, options = {}) => {
    const next = steps.shift();
    assert.ok(next, `Unexpected API call ${path}`);
    assert.match(path, next.path);
    assert.equal(options.method || 'GET', next.method || 'GET');
    if (next.body) assert.deepEqual(options.body, next.body);
    if (next.error) throw next.error;
    return next.result;
  };
}
const tagLookup = { path: /^\/tags\?/, result: { items: [tag], hasMore: false } };
const getContact = (items) => ({ path: /^\/contacts\?email=student%40example.com/, result: { items } });
const assign = { path: /^\/contacts\/42\/tags$/, method: 'POST', body: { tagId: 9 }, result: null };
const verify = { path: /^\/contacts\/42$/, result: verified };

test('new signup is created, tagged, then independently verified', async () => {
  const steps = [tagLookup, getContact([]), { path: /^\/contacts$/, method: 'POST', body: { email, locale: 'en' }, result: contact }, assign, verify];
  assert.equal(await saveAndTag(email, fakeClient(steps)), true);
  assert.equal(steps.length, 0);
});
test('existing contact receives the tag without creating a duplicate', async () => {
  const steps = [tagLookup, getContact([contact]), assign, verify];
  await saveAndTag(email, fakeClient(steps)); assert.equal(steps.length, 0);
});
test('already-tagged contact is verified without reapplying the tag', async () => {
  const steps = [tagLookup, getContact([verified]), verify];
  await saveAndTag(email, fakeClient(steps)); assert.equal(steps.length, 0);
});
test('concurrent duplicate contact creation recovers and applies tag', async () => {
  const steps = [tagLookup, getContact([]), { path: /^\/contacts$/, method: 'POST', error: { status: 422 } }, getContact([contact]), assign, verify];
  await saveAndTag(email, fakeClient(steps)); assert.equal(steps.length, 0);
});
test('tag lookup follows pagination and requires the exact tag name', async () => {
  const steps = [{ path: /^\/tags\?/, result: { items: [{ id: 2, name: 'Download other' }], hasMore: true } }, { path: /startingAfter=2/, result: { items: [tag], hasMore: false } }, getContact([verified]), verify];
  await saveAndTag(email, fakeClient(steps)); assert.equal(steps.length, 0);
});
test('creates the Download tag when absent', async () => {
  const steps = [{ path: /^\/tags\?/, result: { items: [], hasMore: false } }, { path: /^\/tags$/, method: 'POST', body: { name: 'Download' }, result: tag }, getContact([contact]), assign, verify];
  await saveAndTag(email, fakeClient(steps)); assert.equal(steps.length, 0);
});
test('tagging failure never grants access', async () => {
  await assert.rejects(saveAndTag(email, fakeClient([tagLookup, getContact([contact]), { ...assign, error: new Error('Provider failure') }])));
});
test('missing tag on verification fails closed even after successful assignment', async () => {
  await assert.rejects(saveAndTag(email, fakeClient([tagLookup, getContact([contact]), assign, { ...verify, result: contact }])));
});

function response() {
  return { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(body) { this.body = body; } };
}
function request(overrides = {}) {
  return { method: 'POST', headers: { host: 'example.com', origin: 'https://example.com', 'content-type': 'application/json' }, body: { email }, ...overrides };
}
test('no cookie issued until save/tag promise completes', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const res = response();
  const running = createUnlockHandler(() => pending)(request(), res);
  await Promise.resolve();
  assert.equal(res.headers['set-cookie'], undefined);
  finish(); await running;
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=86400; Secure/);
});
test('failed signup emits no cookie and no provider error details', async () => {
  const res = response();
  await createUnlockHandler(async () => { throw new Error('sensitive upstream details'); })(request(), res);
  assert.equal(res.statusCode, 503); assert.equal(res.headers['set-cookie'], undefined);
  assert.doesNotMatch(res.body, /sensitive/);
});
test('invalid email and cross-site submissions never call contact service', async () => {
  const handler = createUnlockHandler(async () => assert.fail('Must not call provider'));
  for (const body of [{ email: 'not-email' }, { email, website: 'spam' }, { email: ['bad'] }, null]) {
    const res = response(); await handler(request({ body }), res); assert.equal(res.statusCode, 400);
  }
  const res = response();
  await handler(request({ headers: { host: 'example.com', origin: 'https://attacker.example', 'content-type': 'application/json' } }), res);
  assert.equal(res.statusCode, 403);
});
test('cookies reject missing, forged, expired, and rotated-key access', () => {
  const now = Date.now();
  const cookie = `${COOKIE_NAME}=${issueAccess(now)}`;
  assert.equal(hasAccess({ headers: { cookie } }, now), true);
  assert.equal(hasAccess({ headers: {} }, now), false);
  assert.equal(hasAccess({ headers: { cookie: cookie + 'forged' } }, now), false);
  assert.equal(hasAccess({ headers: { cookie } }, now + MAX_AGE * 1000 + 1), false);
  const originalKey = process.env.SYSTEME_API_KEY;
  process.env.SYSTEME_API_KEY = 'rotated';
  assert.equal(hasAccess({ headers: { cookie } }, now), false);
  process.env.SYSTEME_API_KEY = originalKey;
});
test('document and download reject unauthenticated requests', async () => {
  for (const url of ['/api/document', '/api/document?download=1']) {
    const res = response(); await document({ method: 'GET', url, headers: {} }, res);
    assert.equal(res.statusCode, 401); assert.match(res.headers['cache-control'], /no-store/);
    assert.doesNotMatch(res.body, /careeronestop/);
  }
});
test('authenticated document download exactly preserves original file', async () => {
  const res = response();
  await document({ method: 'GET', url: '/api/document?download=1', headers: { cookie: `${COOKIE_NAME}=${issueAccess()}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, await readFile('College Scholarship Resources.md', 'utf8'));
  assert.match(res.headers['content-disposition'], /attachment/);
});
test('document rendering escapes HTML and disallows javascript links', () => {
  const html = renderDocument('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[good](https://example.com/)');
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /href="https:\/\/example.com\//);
});
