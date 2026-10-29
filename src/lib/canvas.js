// Canvas homework and tests, read from your Canvas calendar feed (read-only).
//
// The feed link lives in settings (so it syncs between devices). Fetched items are cached on this
// device so they still show offline. Checking an item off is saved as a 'schooldone' record, so it
// syncs too. Canvas itself is never changed.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSettings, saveSettings, put, putMany, remove, useKind, useRecord, list, get, SETTINGS_ID } from '../store.js';
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

// { url, name, events, fetchedAt, error, loading,
//   submitted: { [assignmentId]: true|false }, account, statusAt, statusError, statusLoading }
let cache = load();
const listeners = new Set();
function set(changes) {
  cache = { ...cache, ...changes };
  try {
    const { url, name, events, fetchedAt, submitted, account, statusAt } = cache;
    localStorage.setItem(KEY, JSON.stringify({ url, name, events, fetchedAt, submitted, account, statusAt }));
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

// The Canvas feed has due dates but not whether you've submitted, so anything due before you
// connected Canvas counts as done. Only work due from that day on starts unchecked.
export function connectCanvas(url) {
  const canvas = { url: url.trim(), color: CANVAS_COLOR, since: todayISO() };
  saveSettings({ canvas });
  set({ url: canvas.url, events: null, fetchedAt: null, error: null, name: null });
  refreshCanvas(canvas, true);
}

export function disconnectCanvas() {
  removeCanvasToken();
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
  // Connections made before `since` existed start counting from today.
  useEffect(() => {
    if (url && !canvas.since) saveSettings({ canvas: { ...canvas, since: todayISO() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => {
    if (!url) return;
    const run = () => {
      refreshCanvas(canvas, false);
      refreshSubmissions(false);
    };
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
    hasToken: !!(get(TOKEN_ID) || {}).token,
    account: c.account,
    statusAt: c.statusAt,
    statusError: c.statusError,
    statusLoading: c.statusLoading,
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

const doneRecord = (item, done) => ({ id: schoolDoneId(item.id), uid: item.id, date: item.date, done, at: new Date().toISOString() });

/** Checks an item off (or back on). Stored either way, so you can also un-check old work. */
export function setSchoolDone(item, done) {
  put('schooldone', doneRecord(item, done));
}

/** Marks every unchecked item due before today as done. */
export function markPastDone(items, today = todayISO()) {
  const past = items.filter((i) => !i.done && i.date < today);
  putMany(past.map((i) => ['schooldone', doneRecord(i, true)]));
  return past.length;
}

/** Done if you said so; otherwise done when it was due before Canvas was connected. */
/**
 * Done if you said so. Otherwise, with a Canvas token, done when Canvas says it's submitted;
 * without one, done when it was due before Canvas was connected.
 */
export function isSchoolDone(item, rec, since, submitted) {
  if (rec) return rec.done !== false;
  const aid = assignmentIdOf(item.id);
  if (submitted && aid && aid in submitted) return submitted[aid];
  return !!since && item.date < since;
}

const assignmentIdOf = (uid) => (/^event-assignment-(\d+)$/.exec(uid || '') || [])[1] || null;

/* ---------- Submission status (optional access token) ----------
   The token is saved to your account like your calendar links, so every device you sign in on
   uses it. It's stored in your own records (only your account can read them) and is only ever
   sent to your school's Canvas, through /api/canvas. */

const TOKEN_ID = idFor('canvas-token');
export const getToken = () => (get(TOKEN_ID) || {}).token || '';
export const useHasToken = () => !!(useRecord(TOKEN_ID) || {}).token;
const hostOf = (feedUrl) => {
  try {
    return new URL(String(feedUrl).replace(/^webcals?:\/\//i, 'https://')).host;
  } catch {
    return '';
  }
};

/** Saves the token on this device and checks it right away. Resolves with an error message or null. */
export async function saveCanvasToken(token) {
  put('secret', { id: TOKEN_ID, token: token.trim() });
  await refreshSubmissions(true);
  if (cache.statusError) {
    const msg = cache.statusError;
    removeCanvasToken();
    return msg;
  }
  return null;
}

export function removeCanvasToken() {
  if (get(TOKEN_ID)) remove(TOKEN_ID);
  set({ submitted: null, account: null, statusAt: null, statusError: null, statusLoading: false });
}

/**
 * Asks Canvas (through /api/canvas) what you've submitted, then checks those items off. The
 * check-offs are ordinary synced records, so your other devices and reminders see them too.
 */
export async function refreshSubmissions(force = false) {
  const token = getToken();
  const s = get(SETTINGS_ID) || {};
  const host = s.canvas && hostOf(s.canvas.url);
  if (!token || !host) return;
  if (!force && (cache.statusLoading || (cache.statusAt && Date.now() - cache.statusAt < REFRESH_MS))) return;
  set({ statusLoading: true });
  const t = todayISO();
  try {
    const res = await fetch('/api/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, host, from: addDays(t, -45), to: addDays(t, 120) }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new Error(data.error || 'Couldn’t reach Canvas. It only works on the deployed app.');
    const submitted = {};
    for (const it of data.items || []) submitted[it.assignmentId] = submitted[it.assignmentId] || it.submitted;
    set({ submitted, account: data.name || null, statusAt: Date.now(), statusError: null, statusLoading: false });

    // Check off what's been turned in, leaving anything you've checked or unchecked yourself alone.
    const have = new Set(list('schooldone').map((r) => r.uid));
    const fresh = (data.items || [])
      .filter((it) => it.submitted && !have.has(`event-assignment-${it.assignmentId}`))
      .map((it) => {
        const uid = `event-assignment-${it.assignmentId}`;
        return ['schooldone', { id: schoolDoneId(uid), uid, date: (it.due || '').slice(0, 10), done: true, by: 'canvas', at: new Date().toISOString() }];
      });
    if (fresh.length) putMany(fresh);
  } catch (e) {
    set({ statusError: e.message, statusLoading: false });
  }
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
    const recs = new Map(doneRecs.map((r) => [r.uid, r]));
    const seen = new Set();
    const out = [];
    for (const ev of c.events) {
      const item = toItem(ev);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ ...item, done: isSchoolDone(item, recs.get(item.id), canvas.since, c.submitted) });
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
