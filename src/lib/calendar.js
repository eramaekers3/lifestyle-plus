// Apple Calendar events, read-only.
// Calendar links live in settings (so they sync between devices). Fetched events are cached
// on this device so the timeline still shows them offline.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSettings, saveSettings, get, SETTINGS_ID } from '../store.js';
import { newId } from './ids.js';
import { addDays, iso, todayISO } from './dates.js';

const KEY = 'lifestyleplus.calendar.v1';

/* ---------- Colors ----------
   Each calendar gets its own color. Picked from this list by position until you choose one,
   and kept away from the block-type colors (sky, lilac, coral, mint) so events don't look like blocks. */
// Orange sits late in the list because Canvas items use orange.
export const CAL_COLORS = ['#ff86b8', '#5fd3c6', '#c9d36a', '#a7b4ff', '#d79bff', '#e6e2d8', '#f0a35e', '#ffb3a1'];
export const calColor = (cal, i) => (cal && cal.color) || CAL_COLORS[i % CAL_COLORS.length];

export function setCalendarColor(id, color) {
  const s = get(SETTINGS_ID) || {};
  saveSettings({ calendars: (s.calendars || []).map((c, i) => (c.id === id ? { ...c, color } : { ...c, color: calColor(c, i) })) });
}
const REFRESH_MS = 10 * 60 * 1000;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// { [calendarId]: { name, events, fetchedAt, error, loading } }
let cache = load();
const listeners = new Set();
function set(id, changes) {
  cache = { ...cache, [id]: { ...(cache[id] || {}), ...changes } };
  try {
    const keep = {};
    for (const [k, v] of Object.entries(cache)) keep[k] = { name: v.name, events: v.events, fetchedAt: v.fetchedAt };
    localStorage.setItem(KEY, JSON.stringify(keep));
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

/* ---------- Managing calendars ---------- */

export function addCalendar(url) {
  const s = get(SETTINGS_ID) || {};
  // Lock in colors so removing one calendar never reshuffles the rest.
  const existing = (s.calendars || []).map((c, i) => ({ ...c, color: calColor(c, i) }));
  const used = new Set(existing.map((c) => c.color));
  const color = CAL_COLORS.find((x) => !used.has(x)) || CAL_COLORS[existing.length % CAL_COLORS.length];
  const cal = { id: newId(), url: url.trim(), color };
  saveSettings({ calendars: [...existing, cal] });
  return cal;
}

export function removeCalendar(id) {
  const s = get(SETTINGS_ID) || {};
  saveSettings({ calendars: (s.calendars || []).filter((c) => c.id !== id) });
  const { [id]: _gone, ...rest } = cache;
  cache = rest;
  listeners.forEach((l) => l());
}

export async function refreshCalendar(cal, force = false) {
  const prev = cache[cal.id];
  if (!force && prev && prev.loading) return;
  if (!force && prev && prev.fetchedAt && Date.now() - prev.fetchedAt < REFRESH_MS) return;
  set(cal.id, { loading: true });
  const t = todayISO();
  try {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cal.url, from: addDays(t, -21), to: addDays(t, 90) }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new Error(data.error || 'Couldn’t reach the calendar service. It only works on the deployed app or with npm run dev.');
    set(cal.id, { name: data.name, events: data.events, fetchedAt: Date.now(), error: null, loading: false });
  } catch (e) {
    set(cal.id, { error: e.message, loading: false });
  }
}

/* ---------- Reading ---------- */

export function useCalendarStatus() {
  const { calendars = [] } = useSettings();
  const c = useSyncExternalStore(subscribe, snapshot);
  return calendars.map((cal, i) => ({ ...cal, ...(c[cal.id] || {}), color: calColor(cal, i) }));
}

/** Keeps calendars fresh while the app is open. Mount once. */
export function useCalendarSync() {
  const { calendars = [] } = useSettings();
  const key = calendars.map((c) => c.id + c.url).join('|');
  useEffect(() => {
    const run = (force) => calendars.forEach((c) => refreshCalendar(c, force));
    run(false);
    const onFocus = () => run(false);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(() => run(false), REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

/**
 * All calendar events, split into local days:
 * { [date]: { timed: [{ id, title, start, end, calendar }], allDay: [{ id, title, calendar }] } }
 */
export function useCalendarDays() {
  const { calendars = [] } = useSettings();
  const c = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => {
    const days = {};
    const day = (d) => (days[d] = days[d] || { timed: [], allDay: [] });
    calendars.forEach((cal, i) => {
      const entry = c[cal.id];
      if (!entry || !entry.events) return;
      const calendar = entry.name || 'Apple Calendar';
      const color = calColor(cal, i);
      for (const ev of entry.events) {
        if (ev.allDay) {
          for (let d = ev.start; d < ev.end; d = addDays(d, 1)) day(d).allDay.push({ id: `${cal.id}:${ev.id}`, title: ev.title, calendar, color });
          continue;
        }
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        // Split events that cross midnight into one piece per day.
        for (let d = iso(s); d <= iso(e); d = addDays(d, 1)) {
          const start = d === iso(s) ? minutesOf(s) : 0;
          const end = d === iso(e) ? minutesOf(e) : 1440;
          if (end <= start && !(start === end && d === iso(s))) continue;
          day(d).timed.push({
            id: `${cal.id}:${ev.id}:${d}`,
            title: ev.title,
            start,
            end: Math.max(end, start + 15),
            calendar,
            color,
            cal: true,
            type: 'cal',
          });
        }
      }
    });
    return days;
  }, [calendars, c]);
}
