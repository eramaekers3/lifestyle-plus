// Turns what you said to Siri into records. No database here, so it can be tested on its own;
// api/capture.js reads what's already saved and does the writing.
import { idFor } from '../src/lib/ids.js';
import { randomUUID } from 'node:crypto';

export const GROCERY_ID = idFor('list:groceries');

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where it goes: an explicit `to`, or words like "to my grocery list" at the end of what you said. */
export function parseCapture(text, to) {
  let t = clean(text);
  let where = to === 'groceries' || to === 'grocery' ? 'groceries' : to === 'stack' ? 'stack' : null;
  const tail = /\s+(?:to|on|onto)\s+(?:my\s+|the\s+)?(grocery|groceries|shopping)(?:\s+list)?$/i;
  if (tail.test(t)) {
    where = 'groceries';
    t = t.replace(tail, '');
  }
  where = where || 'stack';
  t = t.replace(/^(?:please\s+)?remind me to\s+/i, '');
  if (where === 'groceries') t = t.replace(/^(?:please\s+)?add\s+/i, '');
  return { where, text: t };
}

/** "milk, eggs and bread" → ['Milk', 'Eggs', 'Bread'] */
export const splitItems = (text) =>
  clean(text)
    .split(/\s*(?:,|\band\b|&|\+)\s*/i)
    .map((s) => s.replace(/^(?:some|a|an)\s+/i, '').trim())
    .filter(Boolean)
    .map(cap);

/** A new backlog task at the bottom of the backlog, like adding one in the app. */
export function taskRecord(text, backlogOrders, now = new Date()) {
  const title = cap(clean(text));
  const order = (backlogOrders.length ? Math.max(...backlogOrders) : 0) + 1;
  const id = randomUUID();
  return { id, kind: 'task', data: { id, title, status: 'backlog', order, createdAt: now.toISOString(), via: 'siri' } };
}

/**
 * Grocery items to save. An item already on the list isn't doubled; a checked one is unchecked.
 * existing: [{ id, text, done, ... }]. Returns { records, added: [names], already: [names] }.
 */
export function groceryRecords(names, existing, now = new Date()) {
  const records = [];
  const added = [];
  const already = [];
  const at = now.toISOString();
  const byName = new Map(existing.map((i) => [String(i.text).toLowerCase(), i]));
  for (const name of names) {
    const hit = byName.get(name.toLowerCase());
    if (hit && !hit.done) {
      already.push(name);
      continue;
    }
    const data = hit
      ? { ...hit, done: false, doneAt: null, createdAt: at }
      : { id: randomUUID(), listId: GROCERY_ID, text: name, done: false, doneAt: null, createdAt: at };
    records.push({ id: data.id, kind: 'listitem', data });
    byName.set(name.toLowerCase(), data);
    added.push(name);
  }
  return { records, added, already };
}

const join = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** What Siri says back. */
export function reply(where, { title, added = [], already = [] }) {
  if (where === 'stack') return `Added “${title}” to your stack.`;
  const parts = [];
  if (added.length) parts.push(`Added ${join(added)} to groceries.`);
  if (already.length) parts.push(`${join(already)} ${already.length === 1 ? 'was' : 'were'} already on the list.`);
  return parts.join(' ') || 'Nothing to add.';
}
