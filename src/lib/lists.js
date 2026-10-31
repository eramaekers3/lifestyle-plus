// Checklists: one running grocery list, plus any number of packing lists.
//
//   list      { id, name, type: 'grocery' | 'packing', recent: [names], createdAt }
//   listitem  { id, listId, text, done, doneAt, createdAt }
//
// Groceries: keep adding through the week, check things off in the store, then "Clear checked".
// Cleared names are remembered as one-tap chips for next time.
// Packing: check things off as they go in the bag, then "Uncheck all" to reuse the list next trip.

import { useKind, put, putMany, patch, remove, get } from '../store.js';
import { idFor, newId } from './ids.js';

export const GROCERY_ID = idFor('list:groceries');
const RECENT_MAX = 24;

const norm = (s) => s.trim().replace(/\s+/g, ' ');
const same = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();

function ensureGroceries() {
  return get(GROCERY_ID) || put('list', { id: GROCERY_ID, name: 'Groceries', type: 'grocery', recent: [], createdAt: new Date().toISOString() });
}

/** All lists, groceries first, then packing lists newest first. */
export function useLists() {
  const lists = useKind('list');
  const grocery = lists.find((l) => l.id === GROCERY_ID) || { id: GROCERY_ID, name: 'Groceries', type: 'grocery', recent: [] };
  const packing = lists
    .filter((l) => l.type === 'packing')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { grocery, packing };
}

/** A list's items: still to get on top (oldest first), checked below (most recent check first). */
export function useItems(listId) {
  const all = useKind('listitem').filter((i) => i.listId === listId);
  const todo = all.filter((i) => !i.done).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const done = all.filter((i) => i.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return { todo, done, all };
}

/**
 * Adds an item. If it's already on the list it isn't doubled: a checked copy is unchecked instead.
 * Returns { item, status: 'added' | 'already' | 'unchecked' }.
 */
export function addItem(listId, text, items) {
  const t = norm(text);
  if (!t) return null;
  if (listId === GROCERY_ID) ensureGroceries();
  const hit = items.find((i) => same(i.text, t));
  if (hit && !hit.done) return { item: hit, status: 'already' };
  if (hit) return { item: patch(hit.id, { done: false, doneAt: null, createdAt: new Date().toISOString() }), status: 'unchecked' };
  const item = put('listitem', { listId, text: t, done: false, doneAt: null, createdAt: new Date().toISOString() });
  return { item, status: 'added' };
}

export const toggleItem = (item) =>
  patch(item.id, item.done ? { done: false, doneAt: null } : { done: true, doneAt: new Date().toISOString() });

export const removeItem = (item) => remove(item.id);

/** Brings back items removed by clearItems (for Undo). */
export function restoreItems(items, listSnapshot) {
  putMany(items.map((i) => ['listitem', i]));
  if (listSnapshot) put('list', listSnapshot);
}

/** Removes the given items. On the grocery list their names go into "recent" for quick re-adding. */
export function clearItems(list, items) {
  const before = get(list.id);
  if (list.id === GROCERY_ID) {
    const l = ensureGroceries();
    const names = items.map((i) => i.text);
    const recent = [...names, ...(l.recent || []).filter((r) => !names.some((n) => same(n, r)))].slice(0, RECENT_MAX);
    put('list', { ...l, recent });
  }
  items.forEach((i) => remove(i.id));
  return before;
}

/** Unchecks everything on a list (packing lists, ready for the next trip). */
export function uncheckAll(items) {
  putMany(items.filter((i) => i.done).map((i) => ['listitem', { ...i, done: false, doneAt: null }]));
}

export function addPackingList(name, copyFrom = []) {
  const list = put('list', { id: newId(), name: norm(name) || 'Trip', type: 'packing', createdAt: new Date().toISOString() });
  const now = Date.now();
  if (copyFrom.length) {
    putMany(
      copyFrom.map((i, n) => ['listitem', { listId: list.id, text: i.text, done: false, doneAt: null, createdAt: new Date(now + n).toISOString() }])
    );
  }
  return list;
}

export const renameList = (list, name) => norm(name) && patch(list.id, { name: norm(name) });

export function deleteList(list, items) {
  items.forEach((i) => remove(i.id));
  remove(list.id);
}
