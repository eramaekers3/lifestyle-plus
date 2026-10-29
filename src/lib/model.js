// Shared rules for tasks, time blocks and habits.
import { useMemo } from 'react';
import { list, put, patch, remove, useKind } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';

/* ---------- Tasks: a pull-based stack ----------
   status: 'backlog' (waiting) → 'active' (in Now, limited) → 'done'
*/

export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const byPulled = (a, b) => (a.pulledAt || '').localeCompare(b.pulledAt || '');

export function useStack() {
  const tasks = useKind('task');
  return useMemo(() => {
    const active = tasks.filter((t) => t.status === 'active').sort(byPulled);
    const backlog = tasks.filter((t) => t.status === 'backlog').sort(byOrder);
    const done = tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    return { tasks, active, backlog, done };
  }, [tasks]);
}

function backlogOrders() {
  return list('task')
    .filter((t) => t.status === 'backlog')
    .map((t) => t.order ?? 0);
}

export function addTask(title) {
  const orders = backlogOrders();
  return put('task', {
    title: title.trim(),
    status: 'backlog',
    order: (orders.length ? Math.max(...orders) : 0) + 1,
    createdAt: new Date().toISOString(),
  });
}

export const pullTask = (t) => patch(t.id, { status: 'active', pulledAt: new Date().toISOString() });

export function sendBack(t) {
  const orders = backlogOrders();
  patch(t.id, { status: 'backlog', order: (orders.length ? Math.min(...orders) : 1) - 1 });
}

export const moveToTop = sendBack;
export const completeTask = (t) => patch(t.id, { status: 'done', doneAt: new Date().toISOString() });
export const reopenTask = (t) => patch(t.id, { status: 'active', pulledAt: new Date().toISOString(), doneAt: null });

/* ---------- Time blocks ---------- */

export const BLOCK_TYPES = [
  { id: 'deep', label: 'Deep work' },
  { id: 'shallow', label: 'Shallow' },
  { id: 'fixed', label: 'Class / fixed' },
  { id: 'personal', label: 'Personal' },
];
export const typeLabel = (id) => (BLOCK_TYPES.find((t) => t.id === id) || BLOCK_TYPES[0]).label;

/** Side-by-side columns for overlapping blocks. */
export function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let cols = [];
  let clusterEnd = -1;
  const flush = () => {
    cluster.forEach((o) => (o.n = cols.length));
    cluster = [];
    cols = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let c = cols.findIndex((end) => end <= b.start);
    if (c === -1) {
      c = cols.length;
      cols.push(b.end);
    } else cols[c] = b.end;
    const o = { b, col: c, n: 1 };
    cluster.push(o);
    out.push(o);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

/* ---------- Habits ----------
   Each day has a status: 'd' done, 'p' partly done, 's' skipped (doesn't break a streak), 'm' missed.
   Build habits are missed unless you check them off. Avoid habits ("Don't fail", "Coffee") count as
   done unless you mark a slip.
   Imported history is stored as one record per habit per month (kind 'habitmonth': a string with one
   letter per day). A check-off made in the app (kind 'habitlog') always wins over imported history.
   Paused stretches (habit.pauses: [[from, to|null]]) count as skipped.
*/

export const logId = (habitId, date) => idFor(`hl:${habitId}:${date}`);
export const monthId = (habitId, month) => idFor(`hm:${habitId}:${month}`);
const MAX_DAYS = 4000;

export function useHabits() {
  const habits = useKind('habit');
  const logs = useKind('habitlog');
  const months = useKind('habitmonth');
  return useMemo(() => buildHabitIndex(habits, logs, months), [habits, logs, months]);
}

/** Pure version of useHabits, so it can be tested outside React. */
export function buildHabitIndex(habits, logs, months, today = todayISO()) {
  const explicit = new Map();
  const firstLog = new Map();
  for (const l of logs) {
    explicit.set(`${l.habitId}|${l.date}`, l.done ? 'd' : 'm');
    if (!firstLog.has(l.habitId) || l.date < firstLog.get(l.habitId)) firstLog.set(l.habitId, l.date);
  }
  const hist = new Map();
  for (const m of months) hist.set(`${m.habitId}|${m.month}`, m.s || '');

  const startOf = (h) => h.startDate || firstLog.get(h.id) || today;
  const lookup = (h, d) => {
    const e = explicit.get(`${h.id}|${d}`);
    if (e) return { code: e, set: true };
    const str = hist.get(`${h.id}|${d.slice(0, 7)}`);
    const c = str ? str[+d.slice(8, 10) - 1] : undefined;
    if (c && c !== '.') return { code: c, set: true };
    if (h.pauses && h.pauses.some(([a, b]) => d >= a && (!b || d <= b))) return { code: 's', set: false };
    if (h.mode === 'avoid' && d <= today && d >= startOf(h)) return { code: 'd', set: false };
    return { code: 'm', set: false };
  };
  const status = (h, d) => lookup(h, d).code;
  const isDone = (h, d) => status(h, d) === 'd';
  const sorted = [...habits].sort(byOrder);
  return {
    all: sorted,
    habits: sorted.filter((h) => !h.paused),
    paused: sorted.filter((h) => h.paused),
    lookup,
    status,
    isDone,
    startOf,
    today,
  };
}

/** CSS class for a day square: done, partly done, skipped, or a slip on an avoid habit. */
export function dayClass(h, code) {
  if (code === 'd') return ' on';
  if (code === 'p') return ' part';
  if (code === 's') return ' skip';
  return h.mode === 'avoid' ? ' slip' : '';
}

/** Deletes a habit with all of its history. */
export function deleteHabit(h) {
  for (const kind of ['habitlog', 'habitmonth']) {
    for (const r of list(kind)) if (r.habitId === h.id) remove(r.id);
  }
  remove(h.id);
}

export function toggleHabit(h, date, current) {
  put('habitlog', { id: logId(h.id, date), habitId: h.id, date, done: !current });
}

export function addHabit(name, mode, order) {
  return put('habit', { name: name.trim(), mode, order, startDate: todayISO() });
}

export function pauseHabit(h) {
  patch(h.id, { paused: true, pauses: [...(h.pauses || []), [todayISO(), null]] });
}

export function resumeHabit(h) {
  const yesterday = addDays(todayISO(), -1);
  const pauses = (h.pauses || []).map(([a, b]) => [a, b || (yesterday < a ? a : yesterday)]);
  patch(h.id, { paused: false, pauses });
}

/** Streaks, best streak, totals and success rates. Today only counts once it's checked off. */
export function habitStats(h, { lookup, startOf, today = todayISO() }) {
  const first = startOf(h);
  const t = lookup(h, today);
  // Today only adds to the streak once it's done (or skipped). Until then the streak runs through
  // yesterday, even if today was checked and then unchecked. On an avoid habit, a slip today
  // resets the streak right away.
  const countsToday = h.mode === 'avoid' ? t.set : t.code === 'd' || t.code === 's';
  const end = countsToday ? today : addDays(today, -1);

  let streak = 0;
  for (let d = end, i = 0; d >= first && i < MAX_DAYS; d = addDays(d, -1), i++) {
    const c = lookup(h, d).code;
    if (c === 'd') streak++;
    else if (c !== 's') break;
  }

  let best = 0;
  let run = 0;
  let done = 0;
  let partial = 0;
  let tracked = 0;
  let recentDone = 0;
  let recentTracked = 0;
  const recentFrom = addDays(end, -29);
  for (let d = first, i = 0; d <= end && i < MAX_DAYS; d = addDays(d, 1), i++) {
    const c = lookup(h, d).code;
    if (c === 's') continue;
    tracked++;
    if (d >= recentFrom) recentTracked++;
    if (c === 'd') {
      done++;
      run++;
      best = Math.max(best, run);
      if (d >= recentFrom) recentDone++;
    } else {
      if (c === 'p') partial++;
      run = 0;
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return { streak, best, done, partial, tracked, first, rate: pct(recentDone, recentTracked), rateAll: pct(done, tracked) };
}

/** Done-rate per calendar month, oldest first. */
export function monthlyRates(h, { lookup, startOf, today = todayISO() }, count = 12) {
  const out = [];
  const [y, m] = today.split('-').map(Number);
  for (let k = count - 1; k >= 0; k--) {
    const dt = new Date(y, m - 1 - k, 1);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const daysIn = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    let done = 0;
    let tracked = 0;
    for (let day = 1; day <= daysIn; day++) {
      const d = `${month}-${String(day).padStart(2, '0')}`;
      if (d < startOf(h) || d >= today) continue;
      const c = lookup(h, d).code;
      if (c === 's') continue;
      tracked++;
      if (c === 'd') done++;
    }
    out.push({ month, done, tracked, rate: tracked ? Math.round((done / tracked) * 100) : null });
  }
  return out;
}
