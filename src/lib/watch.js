// The Watch list: movies and shows you've seen, are watching, or want to see, with a rating and notes.
//
//   kind 'watch': { id, ref, type: 'movie'|'show', title, year, poster, overview, genres: [], runtime,
//                   seasons, episodes, credit, people: [], source,
//                   status: 'want'|'watching'|'watched', rating: 0.5–5 | null, notes,
//                   watchedOn: 'YYYY-MM-DD' | null, withLaighla: bool, addedAt, editedAt,
//                   shows only: episodeList: [{ s, e, t, d }] (season, number, title, air date),
//                               episodesAt (when the list was fetched),
//                               eps: { 's1e3': { done: bool, note } } }
//
// A title picked from search gets a stable id from its database ref, so adding it twice (or from two
// devices) opens the same entry instead of making a copy. Titles typed in by hand get a random id.

import { useEffect, useState } from 'react';
import { get, put, remove, useKind } from '../store.js';
import { idFor, newId } from './ids.js';
import { todayISO } from './dates.js';
import { norm } from './text.js';

export const STATUSES = [
  { id: 'watched', label: 'Watched', short: 'Seen' },
  { id: 'watching', label: 'Watching', short: 'Watching' },
  { id: 'want', label: 'Want to watch', short: 'Want' },
];

export const watchId = (ref) => idFor(`watch:${ref}`);

/** Who you watch with (a checkbox on each title). */
export const WATCH_BUDDY = 'Laighla';

export const useWatch = () => useKind('watch');

/** Info kept from a search result (everything but the result's own status fields). */
const INFO = ['ref', 'type', 'title', 'year', 'poster', 'overview', 'genres', 'runtime', 'seasons', 'episodes', 'credit', 'people', 'source', 'ended'];
const pickInfo = (item) => Object.fromEntries(INFO.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));

/** Adds a title (or updates the one already saved) and returns its record. */
export function addTitle(item, status = 'watched') {
  const id = item.ref ? watchId(item.ref) : newId();
  const prev = get(id);
  const now = new Date().toISOString();
  return put('watch', {
    rating: null,
    notes: '',
    ...(prev || {}),
    ...pickInfo(item),
    // Keep what you already wrote; only fill in a status if this is new.
    status: prev ? prev.status : status,
    watchedOn: prev ? prev.watchedOn : status === 'watched' ? todayISO() : null,
    addedAt: (prev && prev.addedAt) || now,
    editedAt: now,
    id,
  });
}

/** Merges changes into an entry, reading the latest copy first. */
export function saveWatch(id, changes) {
  const cur = get(id);
  if (!cur) return;
  const next = { ...cur, ...changes, editedAt: new Date().toISOString() };
  // Marking something watched dates it today unless you've picked a date.
  if (changes.status === 'watched' && !cur.watchedOn) next.watchedOn = todayISO();
  put('watch', next);
}

export function removeWatch(id) {
  const cur = get(id);
  remove(id);
  return cur;
}

/** Puts back an entry removed a moment ago. */
export const restoreWatch = (item) => item && put('watch', item);

/* ---------- Reading ---------- */

const byNewest = (key) => (a, b) => String(b[key] || b.addedAt || '').localeCompare(String(a[key] || a.addedAt || ''));

export function sorted(items, status) {
  const list = items.filter((i) => i.status === status);
  return list.sort(status === 'watched' ? byNewest('watchedOn') : byNewest('addedAt'));
}

export function matches(item, q) {
  const n = norm(q);
  if (!n) return true;
  return [item.title, item.notes, item.withLaighla ? WATCH_BUDDY : '', item.credit, ...(item.genres || []), ...(item.people || [])].some((s) => norm(s).includes(n));
}

export function watchStats(items, today = todayISO()) {
  const seen = items.filter((i) => i.status === 'watched');
  const year = today.slice(0, 4);
  const rated = seen.filter((i) => i.rating);
  const genres = {};
  seen.forEach((i) => (i.genres || []).forEach((g) => (genres[g] = (genres[g] || 0) + 1)));
  return {
    seen: seen.length,
    thisYear: seen.filter((i) => (i.watchedOn || '').startsWith(year)).length,
    movies: seen.filter((i) => i.type === 'movie').length,
    together: seen.filter((i) => i.withLaighla).length,
    shows: seen.filter((i) => i.type === 'show').length,
    avg: rated.length ? rated.reduce((a, i) => a + i.rating, 0) / rated.length : null,
    favorites: [...rated].sort((a, b) => b.rating - a.rating || byNewest('watchedOn')(a, b)).filter((i) => i.rating >= 4).slice(0, 5),
    topGenres: Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g),
    minutes: seen.filter((i) => i.type === 'movie').reduce((a, i) => a + (i.runtime || 0), 0),
  };
}

/* ---------- Looking titles up ---------- */

/** Searches the movie database as you type (waits for a pause, drops stale answers). */
export function useTitleSearch(q, type) {
  const [state, setState] = useState({ results: [], loading: false, error: '', q: '' });
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setState({ results: [], loading: false, error: '', q: '' });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/media?q=${encodeURIComponent(query)}&type=${type}`);
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(data.error || 'Search isn’t working right now.');
        setState({ results: data.results || [], loading: false, error: '', q: query });
      } catch (e) {
        if (!live) return;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setState({ results: [], loading: false, error: offline ? 'You’re offline, so search is off.' : e.message || 'Search isn’t working right now.', q: query });
      }
    }, 320);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, type]);
  return state;
}

/** Full details for a title (runtime, seasons, cast). Returns null if it can't be fetched. */
export async function fetchDetails(ref) {
  try {
    const res = await fetch(`/api/media?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) return null;
    const { item } = await res.json();
    return item || null;
  } catch {
    return null;
  }
}

/* ---------- Episodes (shows) ---------- */

export const epKey = (s, e) => `s${s}e${e}`;
const aired = (x, today) => !x.d || x.d <= today;

/** Fetches a show's episodes and saves them on its entry. Returns an error message, or ''. */
export async function loadEpisodes(id) {
  const cur = get(id);
  if (!cur || !cur.ref) return 'Episodes are only available for shows picked from search.';
  try {
    const res = await fetch(`/api/media?episodes=${encodeURIComponent(cur.ref)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || 'Couldn’t load the episodes.';
    saveWatch(id, { episodeList: data.episodes || [], episodesAt: new Date().toISOString() });
    return '';
  } catch {
    return navigator.onLine === false ? 'You’re offline. Episodes will load when you’re back online.' : 'Couldn’t load the episodes.';
  }
}

/** True when a running show's episode list is over a day old (new episodes may be out). */
export const episodesStale = (i) => !i.ended && (!i.episodesAt || Date.now() - Date.parse(i.episodesAt) > 864e5);

export function progress(i, today = todayISO()) {
  const list = (i.episodeList || []).filter((x) => aired(x, today));
  const eps = i.eps || {};
  const done = list.filter((x) => eps[epKey(x.s, x.e)] && eps[epKey(x.s, x.e)].done).length;
  const next = list.find((x) => !(eps[epKey(x.s, x.e)] && eps[epKey(x.s, x.e)].done)) || null;
  return { done, total: list.length, next };
}

/**
 * Checks episodes on or off, and moves the show along: the first check puts a want-to-watch show in
 * Watching, and checking every aired episode marks it Watched. Returns the new status if it changed.
 */
export function setEpisodes(id, keys, done) {
  const cur = get(id);
  if (!cur) return null;
  const eps = { ...(cur.eps || {}) };
  keys.forEach((k) => (eps[k] = { note: '', ...(eps[k] || {}), done }));
  const next = { ...cur, eps };
  const p = progress(next);
  let status = cur.status;
  // Unchecking never moves a show; checking can.
  if (done && p.total && p.done === p.total) status = 'watched';
  else if (done && p.done > 0 && cur.status !== 'watching') status = 'watching';
  saveWatch(id, { eps, status });
  return status !== cur.status ? status : null;
}

export function setEpisodeNote(id, key, note) {
  const cur = get(id);
  if (!cur) return;
  const eps = { ...(cur.eps || {}) };
  eps[key] = { done: false, ...(eps[key] || {}), note };
  saveWatch(id, { eps });
}

/* ---------- Labels ---------- */

export function lengthLabel(i) {
  if (i.type === 'show') {
    const s = i.seasons ? `${i.seasons} season${i.seasons === 1 ? '' : 's'}` : '';
    return [s, i.ended ? 'ended' : ''].filter(Boolean).join(', ');
  }
  if (!i.runtime) return '';
  const h = Math.floor(i.runtime / 60);
  const m = i.runtime % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export const typeLabel = (t) => (t === 'show' ? 'Show' : 'Movie');

export const starsText = (r) => (r ? `${'★'.repeat(Math.floor(r))}${r % 1 ? '½' : ''}` : '');
