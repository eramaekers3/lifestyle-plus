// Canvas homework and tests, read from your Canvas calendar feed (read-only).
//
// The feed link lives in settings (so it syncs between devices). Fetched items are cached on this
// device so they still show offline. Checking an item off is saved as a 'schooldone' record, so it
// syncs too. Canvas itself is never changed.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSettings, saveSettings, put, remove, useKind } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';

const KEY = 'lifestyleplus.canvas.v1';
const REFRESH_MS = 30 * 60 * 1000;
export const CANVAS_COLOR = '#ff9a5c';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// { url, name, events, fetchedAt, error, loading }
let cache = load();
const listeners = new Set();
function set(changes) {
  cache = { ...cache, ...changes };
  try {
    const { url, name, events, fetchedAt } = cache;
    localStorage.setItem(KEY, JSON.stringify({ url, name, events, fetchedAt }));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => cache;

/* ---------- Connecting ---------- */

export const looksLikeCanvasFeed = (v) =>
  /^(webcals?|https):\/\/[^/]+\/feeds\/calendars\/[\w.-]+\.ics(\?.*)?$/i.test(String(v || '').trim());

export function connectCanvas(url) {
  const canvas = { url: url.trim(), color: CANVAS_COLOR };
  saveSettings({ canvas });
  set({ url: canvas.url, events: null, fetchedAt: null, error: null, name: null });
  refreshCanvas(canvas, true);
}

export function disconnectCanvas() {
  saveSettings({ canvas: null });
  set({ url: null, events: null, fetchedAt: null, error: null, name: null, loading: false });
}

export const setCanvasColor = (canvas, color) => saveSettings({ canvas: { ...canvas, color } });

export async function refreshCanvas(canvas, force = false) {
  if (!canvas || !canvas.url) return;
  const fresh = cache.url === canvas.url && cache.fetchedAt && Date.now() - cache.fetchedAt < REFRESH_MS;
  if (!force && (cache.loading || fresh)) return;
  set({ loading: true });
  const t = todayISO();
  try {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: canvas.url, source: 'canvas', from: addDays(t, -21), to: addDays(t, 120) }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new Error(data.error || 'Couldn’t reach Canvas. It only works on the deployed app or with npm run dev.');
    set({ url: canvas.url, name: data.name, events: data.events, fetchedAt: Date.now(), error: null, loading: false });
  } catch (e) {
    set({ error: e.message, loading: false });
  }
}

/** Keeps Canvas fresh while the app is open. Mount once. */
export function useCanvasSync() {
  const { canvas } = useSettings();
  const url = canvas && canvas.url;
  const color = (canvas && canvas.color) || CANVAS_COLOR;
  useEffect(() => {
    document.documentElement.style.setProperty('--canvas', color);
  }, [color]);
  useEffect(() => {
    if (!url) return;
    const run = () => refreshCanvas(canvas, false);
    run();
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    const t = setInterval(run, REFRESH_MS);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
}

export function useCanvasStatus() {
  const { canvas } = useSettings();
  const c = useSyncExternalStore(subscribe, snapshot);
  if (!canvas || !canvas.url) return null;
  const mine = c.url === canvas.url;
  return {
    ...canvas,
    color: canvas.color || CANVAS_COLOR,
    name: mine ? c.name : null,
    count: mine && c.events ? c.events.length : 0,
    fetchedAt: mine ? c.fetchedAt : null,
    error: c.error,
    loading: c.loading,
  };
}

/* ---------- Reading ---------- */

export { toItem } from './school.js';
import { toItem } from './school.js';

export const schoolDoneId = (uid) => idFor(`sd:${uid}`);

export function setSchoolDone(item, done) {
  const id = schoolDoneId(item.id);
  if (done) put('schooldone', { id, uid: item.id, date: item.date, doneAt: new Date().toISOString() });
  else remove(id);
}

/**
 * All homework and tests, oldest first:
 * [{ id, title, course, kind: 'homework'|'test', date, time, link, done }]
 */
export function useSchool() {
  const { canvas } = useSettings();
  const c = useSyncExternalStore(subscribe, snapshot);
  const doneRecs = useKind('schooldone');
  return useMemo(() => {
    if (!canvas || !canvas.url || c.url !== canvas.url || !c.events) return [];
    const done = new Set(doneRecs.map((r) => r.uid));
    const seen = new Set();
    const out = [];
    for (const ev of c.events) {
      const item = toItem(ev);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ ...item, done: done.has(item.id) });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? 1440) - (b.time ?? 1440));
  }, [canvas, c, doneRecs]);
}

/** Items due on one day. */
export function itemsOn(items, date) {
  return items.filter((i) => i.date === date);
}

/** Homework that's past due and not checked off (last two weeks only). */
export function overdue(items, today = todayISO()) {
  const from = addDays(today, -14);
  return items.filter((i) => i.kind === 'homework' && !i.done && i.date < today && i.date >= from);
}
