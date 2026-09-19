import { apiKey } from './access.js';

class SystemeError extends Error {
  constructor(status) { super('Contact service unavailable'); this.status = status; }
}

export function createSystemeClient(fetcher = fetch) {
  return async (path, { method = 'GET', body } = {}) => {
    const response = await fetcher(`https://api.systeme.io/api${path}`, {
      method,
      headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(7000),
      redirect: 'error',
    });
    if (!response.ok) throw new SystemeError(response.status);
    if (response.status === 204) return null;
    return response.json();
  };
}

function validId(value) { return Number.isSafeInteger(value) && value > 0; }
function duplicatePossible(error) { return [400, 409, 422].includes(error.status); }

async function findTag(call) {
  let cursor;
  // Follow the documented cursor pagination instead of assuming the first page.
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ query: 'Download', limit: '100', order: 'asc' });
    if (cursor) query.set('startingAfter', String(cursor));
    const result = await call(`/tags?${query}`);
    if (!Array.isArray(result.items)) throw new Error('Invalid tag response');
    const match = result.items.find(tag => tag.name === 'Download' && validId(tag.id));
    if (match) return match;
    if (!result.hasMore) return null;
    const next = result.items.at(-1)?.id;
    if (!validId(next) || (cursor && next <= cursor)) throw new Error('Invalid tag pagination');
    cursor = next;
  }
  throw new Error('Tag lookup limit reached');
}

async function ensureTag(call) {
  let tag = await findTag(call);
  if (tag) return tag;
  try {
    tag = await call('/tags', { method: 'POST', body: { name: 'Download' } });
  } catch (error) {
    if (!duplicatePossible(error)) throw error;
    tag = await findTag(call); // Recover a concurrent tag creation.
  }
  if (!tag || tag.name !== 'Download' || !validId(tag.id)) throw new Error('Download tag unavailable');
  return tag;
}

async function findContact(email, call) {
  const result = await call(`/contacts?${new URLSearchParams({ email, limit: '10' })}`);
  if (!Array.isArray(result.items)) throw new Error('Invalid contact response');
  return result.items.find(contact => contact.email?.toLowerCase() === email && validId(contact.id));
}

export async function saveAndTag(email, call = createSystemeClient()) {
  const tag = await ensureTag(call);
  let contact = await findContact(email, call);
  if (!contact) {
    try {
      contact = await call('/contacts', { method: 'POST', body: { email, locale: 'en' } });
    } catch (error) {
      if (!duplicatePossible(error)) throw error;
      contact = await findContact(email, call); // Existing or concurrently created contact.
    }
  }
  if (!contact || !validId(contact.id) || contact.email?.toLowerCase() !== email) throw new Error('Contact not saved');
  if (!contact.tags?.some(item => item.id === tag.id)) {
    try {
      await call(`/contacts/${contact.id}/tags`, { method: 'POST', body: { tagId: tag.id } });
    } catch (error) {
      if (!duplicatePossible(error)) throw error;
      // A duplicate assignment can succeed concurrently; always verify below.
    }
  }
  const saved = await call(`/contacts/${contact.id}`);
  if (saved.email?.toLowerCase() !== email || !saved.tags?.some(item => item.id === tag.id && item.name === 'Download')) {
    throw new Error('Tag not confirmed');
  }
  return true;
}
