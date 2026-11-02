// The journal: one entry per day (kind 'journal', a stable id per date so two devices never make two).
//
//   { id, date, moments: [{ id, text }], ratings: { busy: { v: 1-5 | null, note }, ... } }
//
// The rating keys (busy, attitude, energy, selfless) never change, so the labels below can be
// renamed any time without touching saved entries.

import { get, put, useKind, useRecord } from '../store.js';
import { idFor, newId } from './ids.js';
import { addDays, parse, todayISO } from './dates.js';
import { norm } from './text.js';

export const METRICS = [
  { key: 'busy', label: 'Pace', ask: 'How full was the day?', low: 'Wide open', high: 'Slammed', color: 'var(--sky)', neutral: true },
  { key: 'attitude', label: 'Outlook', ask: 'How was your attitude?', low: 'Sour', high: 'Bright', color: 'var(--sun)' },
  { key: 'energy', label: 'Energy', ask: 'How much did you have in the tank?', low: 'Drained', high: 'Charged', color: 'var(--mint)' },
  { key: 'selfless', label: 'Others first', ask: 'How much did you put others first?', low: 'All about me', high: 'Poured out', color: 'var(--lilac)' },
];
export const metricOf = (key) => METRICS.find((m) => m.key === key);

export const journalId = (date) => idFor(`journal:${date}`);

const blank = (date) => ({ date, moments: [], ratings: {} });

export function useEntry(date) {
  return useRecord(journalId(date)) || null;
}

export function useEntries() {
  return useKind('journal');
}

/** Merges changes into a day's entry, reading the latest copy first so quick edits don't undo each other. */
export function saveEntry(date, change) {
  const id = journalId(date);
  const cur = { ...blank(date), ...(get(id) || {}) };
  const next = typeof change === 'function' ? change(cur) : { ...cur, ...change };
  put('journal', { ...next, id, date, editedAt: new Date().toISOString() });
}

export function setRating(date, key, changes) {
  saveEntry(date, (e) => ({ ...e, ratings: { ...e.ratings, [key]: { v: null, note: '', ...(e.ratings[key] || {}), ...changes } } }));
}

export function addMoment(date, text) {
  const t = text.trim();
  if (!t) return;
  saveEntry(date, (e) => ({ ...e, moments: [...(e.moments || []), { id: newId(), text: t }] }));
}

export function editMoment(date, id, text) {
  saveEntry(date, (e) => ({ ...e, moments: (e.moments || []).map((m) => (m.id === id ? { ...m, text } : m)) }));
}

export function removeMoment(date, id) {
  saveEntry(date, (e) => ({ ...e, moments: (e.moments || []).filter((m) => m.id !== id) }));
}

/* ---------- Reading entries ---------- */

export const valueOf = (e, key) => {
  const v = e && e.ratings && e.ratings[key] && e.ratings[key].v;
  return typeof v === 'number' ? v : null;
};
export const noteOf = (e, key) => (e && e.ratings && e.ratings[key] && e.ratings[key].note) || '';

/** True when an entry has anything in it. */
export const hasContent = (e) =>
  !!e && ((e.moments || []).some((m) => m.text.trim()) || METRICS.some((m) => valueOf(e, m.key) !== null || noteOf(e, m.key).trim()));

/** Entries with something in them, newest first. */
export const filled = (entries) => entries.filter(hasContent).sort((a, b) => b.date.localeCompare(a.date));

/* ---------- Statistics ---------- */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const RANGES = [
  { id: '7', label: '7D', days: 7 },
  { id: '30', label: '30D', days: 30 },
  { id: '90', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: null },
];

/** The entries that fall in a range ending today, plus the same-length stretch just before it. */
export function inRange(entries, range, today = todayISO()) {
  if (!range.days) return { from: entries.length ? entries.reduce((a, e) => (e.date < a ? e.date : a), today) : today, cur: entries, prev: [] };
  const from = addDays(today, -(range.days - 1));
  const prevFrom = addDays(from, -range.days);
  return {
    from,
    cur: entries.filter((e) => e.date >= from && e.date <= today),
    prev: entries.filter((e) => e.date >= prevFrom && e.date < from),
  };
}

/** Average, change from the stretch before, how many days were rated, and the points for a sparkline. */
export function metricSummary(cur, prev, key) {
  const pts = cur
    .map((e) => ({ date: e.date, v: valueOf(e, key) }))
    .filter((p) => p.v !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const avg = mean(pts.map((p) => p.v));
  const before = mean(prev.map((e) => valueOf(e, key)).filter((v) => v !== null));
  return { avg, n: pts.length, delta: avg !== null && before !== null ? avg - before : null, pts };
}

/** How often each score (1–5) was given. */
export function distribution(cur, key) {
  const out = [0, 0, 0, 0, 0];
  for (const e of cur) {
    const v = valueOf(e, key);
    if (v) out[v - 1]++;
  }
  return out;
}

/** Average by weekday, Monday first. */
export function byWeekday(cur, key) {
  const sums = Array.from({ length: 7 }, () => []);
  for (const e of cur) {
    const v = valueOf(e, key);
    if (v === null) continue;
    sums[(parse(e.date).getDay() + 6) % 7].push(v);
  }
  return sums.map((xs) => ({ avg: mean(xs), n: xs.length }));
}

function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export const MIN_PAIRS = 7;

/**
 * Which ratings move together. Each pair of ratings, with the correlation across days that have both,
 * strongest first. Weak links (|r| under 0.3) and pairs with fewer than MIN_PAIRS days are left out.
 */
export function links(cur) {
  const out = [];
  for (let i = 0; i < METRICS.length; i++) {
    for (let j = i + 1; j < METRICS.length; j++) {
      const a = METRICS[i];
      const b = METRICS[j];
      const pairs = cur.map((e) => [valueOf(e, a.key), valueOf(e, b.key)]).filter(([x, y]) => x !== null && y !== null);
      if (pairs.length < MIN_PAIRS) continue;
      const r = pearson(pairs);
      if (r === null || Math.abs(r) < 0.3) continue;
      out.push({ a, b, r, n: pairs.length });
    }
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
}

export const strength = (r) => (Math.abs(r) >= 0.6 ? 'Strong' : Math.abs(r) >= 0.45 ? 'Clear' : 'Loose');

/** Days in a row with an entry, counting back from today (or yesterday, if today isn't written yet). */
export function journalStreak(entries, today = todayISO()) {
  const days = new Set(entries.filter(hasContent).map((e) => e.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Your best days in a range: highest Outlook + Energy together. */
export function bestDays(cur, count = 3) {
  return cur
    .map((e) => ({ e, a: valueOf(e, 'attitude'), b: valueOf(e, 'energy') }))
    .filter((x) => x.a !== null && x.b !== null)
    .sort((x, y) => y.a + y.b - (x.a + x.b) || y.e.date.localeCompare(x.e.date))
    .slice(0, count)
    .map((x) => x.e);
}

/* ---------- Search ---------- */

/** Every piece of text in an entry, labelled by where it came from. */
function textsOf(e) {
  const out = (e.moments || []).filter((m) => m.text.trim()).map((m) => ({ where: 'Moment', text: m.text }));
  for (const m of METRICS) {
    const n = noteOf(e, m.key).trim();
    if (n) out.push({ where: m.label, text: n });
  }
  return out;
}

/**
 * Entries that contain every word you typed (anywhere in the entry), newest first, with the
 * pieces of text that matched.
 */
export function search(entries, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const e of entries) {
    const texts = textsOf(e);
    const all = norm(texts.map((t) => t.text).join(' \n '));
    if (!words.every((w) => all.includes(w))) continue;
    const hits = texts.filter((t) => words.some((w) => norm(t.text).includes(w)));
    out.push({ entry: e, hits });
  }
  return out.sort((a, b) => b.entry.date.localeCompare(a.entry.date));
}

/** Splits text into plain and matching pieces, for highlighting. */
export function highlight(text, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text, hit: false }];
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'gi');
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}
