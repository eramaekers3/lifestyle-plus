// Local-first data store.
//
// Every change is written to this device right away (localStorage), so the app works
// offline and feels instant. When you're signed in, changed records are pushed to the
// Supabase `records` table and changes from your other devices are pulled back.
// If the same record changed in two places, the newer edit wins.

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase.js';
import { newId, idFor } from './lib/ids.js';

const KEY = 'lifestyleplus.v1';

/* ---------- Local state ---------- */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.records) {
      return {
        records: raw.records,
        dirty: new Set(raw.dirty || []),
        lastPull: raw.lastPull || null,
        owner: raw.owner || null,
      };
    }
  } catch {
    /* storage unavailable */
  }
  return { records: {}, dirty: new Set(), lastPull: null, owner: null };
}

let db = load();
let version = 0;
const listeners = new Set();
const cache = new Map();

// Saving to localStorage means writing out every record, so changes made close together
// (a burst of edits, a sync) are saved once. Anything pending is saved right away when the
// app goes to the background or closes.
let persistTimer = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(flushPersist, 250);
}
function flushPersist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ records: db.records, dirty: [...db.dirty], lastPull: db.lastPull, owner: db.owner })
    );
  } catch {
    /* storage full or blocked; data stays in memory for this session */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPersist);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPersist());
}

/** Tells the app something changed. Pass the kinds that changed so other lists keep their cache. */
function emit(kinds) {
  version++;
  if (kinds) kinds.forEach((k) => cache.delete(k));
  else cache.clear();
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/* ---------- Reading ---------- */

export function list(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const out = [];
  for (const r of Object.values(db.records)) if (r.kind === kind && !r.deleted) out.push(r.data);
  cache.set(kind, out);
  return out;
}

export function get(id) {
  const r = db.records[id];
  return r && !r.deleted ? r.data : undefined;
}

/** True if this id was ever written on this device, even if it was deleted since. */
export const exists = (id) => !!db.records[id];

export const isEmpty = () => Object.keys(db.records).length === 0;

export function useKind(kind) {
  useSyncExternalStore(subscribe, getVersion);
  return list(kind);
}

export function useRecord(id) {
  useSyncExternalStore(subscribe, getVersion);
  return get(id);
}

/* ---------- Writing ---------- */

// Writes one record and adds the kinds whose lists change to `kinds` (two if it changes kind).
function write(kind, data, kinds) {
  const id = data.id || newId();
  const prev = db.records[id];
  kinds.add(kind);
  if (prev) kinds.add(prev.kind);
  db.records[id] = { id, kind, data: { ...data, id }, updated_at: new Date().toISOString(), deleted: false };
  db.dirty.add(id);
  return db.records[id].data;
}

export function put(kind, data) {
  const kinds = new Set();
  const out = write(kind, data, kinds);
  persist();
  emit(kinds);
  scheduleSync();
  return out;
}

export function putMany(items) {
  const kinds = new Set();
  items.forEach(([kind, data]) => write(kind, data, kinds));
  persist();
  emit(kinds);
  scheduleSync();
}

export function patch(id, changes) {
  const r = db.records[id];
  if (!r || r.deleted) return;
  return put(r.kind, { ...r.data, ...changes });
}

export function remove(id) {
  const r = db.records[id];
  if (!r) return;
  db.records[id] = { ...r, deleted: true, updated_at: new Date().toISOString() };
  db.dirty.add(id);
  persist();
  emit([r.kind]);
  scheduleSync();
}

/* ---------- Settings ---------- */

export const SETTINGS_ID = idFor('settings');
const NO_CALENDARS = [];
export const DEFAULT_SETTINGS = { stackLimit: 3, dayStart: 7, dayEnd: 23, sample: false, calendars: NO_CALENDARS, accent: '#ffcf5c', headingFont: 'bricolage' };

// The same settings object is handed out until settings change, so it's safe in effect deps.
let settingsFrom;
let settingsOut = DEFAULT_SETTINGS;
export function useSettings() {
  const s = useRecord(SETTINGS_ID);
  if (s !== settingsFrom) {
    settingsFrom = s;
    settingsOut = { ...DEFAULT_SETTINGS, ...(s || {}) };
  }
  return settingsOut;
}

export function saveSettings(changes) {
  put('settings', { ...DEFAULT_SETTINGS, ...(get(SETTINGS_ID) || {}), ...changes, id: SETTINGS_ID });
}

/** Removes sample records from this device only. They were never synced. */
export function clearSample() {
  for (const [id, r] of Object.entries(db.records)) {
    if (id !== SETTINGS_ID && r.data && r.data.sample) {
      delete db.records[id];
      db.dirty.delete(id);
    }
  }
  emit();
  saveSettings({ sample: false });
}

/** Deletes everything, everywhere (soft delete so other devices hear about it). */
export function eraseAll() {
  const now = new Date().toISOString();
  for (const [id, r] of Object.entries(db.records)) {
    if (!r.deleted && id !== SETTINGS_ID) {
      db.records[id] = { ...r, deleted: true, updated_at: now };
      db.dirty.add(id);
    }
  }
  emit();
  saveSettings({ sample: false });
}

/* ---------- Sync status ---------- */

let status = { state: supabase ? 'signed-out' : 'local', email: null, lastSynced: null, error: null };
const statusListeners = new Set();
function setStatus(changes) {
  status = { ...status, ...changes };
  statusListeners.forEach((l) => l());
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status
  );
}

/* ---------- Sync ---------- */

let session = null;
let timer = null;
let syncing = false;
let again = false;

function scheduleSync(delay = 1200) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

/**
 * Pulls rows changed since `since` (everything when null). A remote row replaces the local one
 * when it's newer and not edited here since, or always when `remoteWins` (first sync).
 */
async function pull(since, remoteWins) {
  let maxSeen = 0;
  const changed = new Set(); // kinds that changed
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase
      .from('records')
      .select('id, kind, data, updated_at, deleted, synced_at')
      .order('synced_at', { ascending: true })
      .range(from, from + page - 1);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data) {
      const local = db.records[row.id];
      const remoteT = Date.parse(row.updated_at);
      if (remoteWins || !local || (!db.dirty.has(row.id) && remoteT > Date.parse(local.updated_at))) {
        db.records[row.id] = {
          id: row.id,
          kind: row.kind,
          data: row.data,
          updated_at: new Date(remoteT).toISOString(),
          deleted: row.deleted,
        };
        db.dirty.delete(row.id);
        changed.add(row.kind);
        if (local && local.kind !== row.kind) changed.add(local.kind);
      }
      maxSeen = Math.max(maxSeen, Date.parse(row.synced_at));
    }
    if (data.length < page) break;
  }
  return { changed, maxSeen };
}

export async function sync() {
  if (!supabase || !session) return;
  if (syncing) {
    again = true;
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline' });
    return;
  }
  syncing = true;
  setStatus({ state: 'syncing', error: null });
  try {
    // 0. First sync of this account on this device: take your account's copy of everything
    //    before sending anything up. Records this device made before it had ever synced (fresh
    //    install, re-added to the Home Screen) must never overwrite the real ones.
    const firstSync = !db.lastPull;
    const changed = new Set();
    let maxSeen = 0;
    if (firstSync) {
      const r = await pull(null, true);
      r.changed.forEach((k) => changed.add(k));
      maxSeen = r.maxSeen;
    }

    // 1. Push what changed here.
    const ids = [...db.dirty];
    const rows = ids
      .map((id) => db.records[id])
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        user_id: session.user.id,
        kind: r.kind,
        data: r.data,
        updated_at: r.updated_at,
        deleted: r.deleted,
      }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from('records').upsert(chunk);
      if (error) throw error;
      for (const row of chunk) {
        if (db.records[row.id] && db.records[row.id].updated_at === row.updated_at) db.dirty.delete(row.id);
      }
    }

    // 2. Pull what changed elsewhere since last time.
    const after = maxSeen ? new Date(maxSeen) : db.lastPull ? new Date(Date.parse(db.lastPull)) : null;
    const since = after ? new Date(after.getTime() - 5000).toISOString() : null;
    const r = await pull(since, false);
    r.changed.forEach((k) => changed.add(k));
    maxSeen = Math.max(maxSeen, r.maxSeen, db.lastPull ? Date.parse(db.lastPull) : 0);
    if (maxSeen) db.lastPull = new Date(maxSeen).toISOString();
    persist();
    if (changed.size) emit(changed);
    setStatus({ state: 'synced', lastSynced: new Date().toISOString() });
  } catch (e) {
    setStatus({ state: 'error', error: e.message || String(e) });
  } finally {
    syncing = false;
    if (again) {
      again = false;
      sync();
    }
  }
}

function onSession(s) {
  const prevUser = session && session.user.id;
  session = s;
  if (!s) {
    setStatus({ state: 'signed-out', email: null });
    return;
  }
  setStatus({ email: s.user.email });
  if (s.user.id !== prevUser) {
    // Sample data stays on this device; it never goes into your account.
    if (get(SETTINGS_ID) && get(SETTINGS_ID).sample) {
      clearSample();
      // Drop this device's stand-in settings so your account's settings come down untouched.
      delete db.records[SETTINGS_ID];
      db.dirty.delete(SETTINGS_ID);
      emit();
    }
    if (db.owner && db.owner !== s.user.id) {
      // A different account signed in on this device: start from that account's data.
      db.records = {};
      db.dirty = new Set();
      db.lastPull = null;
      emit();
    }
    db.owner = s.user.id;
    persist();
  }
  sync();
}

export async function initSync() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  onSession(data.session);
  supabase.auth.onAuthStateChange((_event, s) => {
    const changedUser = (s && s.user.id) !== (session && session.user.id);
    if (changedUser) setTimeout(() => onSession(s), 0);
    else session = s;
  });
  window.addEventListener('focus', () => sync());
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  setInterval(sync, 60000);
}

/* ---------- Account ---------- */

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns true when Supabase wants the email confirmed before sign-in. */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return !data.session;
}

export async function signOut() {
  await sync();
  await supabase.auth.signOut();
}
