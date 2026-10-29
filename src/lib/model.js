// Shared rules for tasks, time blocks and habits.
import { useMemo } from 'react';
import { list, put, patch, useKind } from '../store.js';
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

/* ---------- Habits ---------- */

export const logId = (habitId, date) => idFor(`hl:${habitId}:${date}`);

export function useHabits() {
  const habits = useKind('habit');
  const logs = useKind('habitlog');
  return useMemo(() => {
    const done = new Set();
    for (const l of logs) if (l.done) done.add(`${l.habitId}|${l.date}`);
    const isDone = (h, d) => done.has(`${h.id}|${d}`);
    return { habits: [...habits].sort(byOrder), isDone, logs };
  }, [habits, logs]);
}

export function toggleHabit(h, date, current) {
  put('habitlog', { id: logId(h.id, date), habitId: h.id, date, done: !current });
}

export function habitStats(h, isDone, logs) {
  const t = todayISO();
  let streak = 0;
  let d = isDone(h, t) ? t : addDays(t, -1);
  while (isDone(h, d)) {
    streak++;
    d = addDays(d, -1);
  }
  const days = logs.filter((l) => l.habitId === h.id && l.done).map((l) => l.date).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const x of days) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  let hits = 0;
  for (let i = 0; i < 30; i++) if (isDone(h, addDays(t, -i))) hits++;
  return { streak, best, rate: Math.round((hits / 30) * 100) };
}
