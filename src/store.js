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

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ records: db.records, dirty: [...db.dirty], lastPull: db.lastPull, owner: db.owner })
    );
  } catch {
    /* storage full or blocked; data stays in memory for this session */
  }
}

function emit() {
  version++;
  cache.clear();
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

function write(kind, data) {
  const id = data.id || newId();
  db.records[id] = { id, kind, data: { ...data, id }, updated_at: new Date().toISOString(), deleted: false };
  db.dirty.add(id);
  return db.records[id].data;
}

export function put(kind, data) {
  const out = write(kind, data);
  persist();
  emit();
  scheduleSync();
  return out;
}

export function putMany(items) {
  items.forEach(([kind, data]) => write(kind, data));
  persist();
  emit();
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
  emit();
  scheduleSync();
}

/* ---------- Settings ---------- */

export const SETTINGS_ID = idFor('settings');
const NO_CALENDARS = [];
export const DEFAULT_SETTINGS = { stackLimit: 3, dayStart: 7, dayEnd: 23, sample: false, calendars: NO_CALENDARS };

export function useSettings() {
  const s = useRecord(SETTINGS_ID);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
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
    let maxSeen = db.lastPull ? Date.parse(db.lastPull) : 0;
    const since = db.lastPull ? new Date(Date.parse(db.lastPull) - 5000).toISOString() : null;
    let changed = false;
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
        if (!local || (!db.dirty.has(row.id) && remoteT > Date.parse(local.updated_at))) {
          db.records[row.id] = {
            id: row.id,
            kind: row.kind,
            data: row.data,
            updated_at: new Date(remoteT).toISOString(),
            deleted: row.deleted,
          };
          changed = true;
        }
        maxSeen = Math.max(maxSeen, Date.parse(row.synced_at));
      }
      if (data.length < page) break;
    }
    if (maxSeen) db.lastPull = new Date(maxSeen).toISOString();
    persist();
    if (changed) emit();
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
    if (get(SETTINGS_ID) && get(SETTINGS_ID).sample) clearSample();
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
