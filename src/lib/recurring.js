// Repeating tasks. A template (kind 'recur') makes a normal task on each day it's scheduled:
//   { title, every: 'day' | 'weekdays' | 'week', days: [0–6, Sunday = 0], to: 'backlog' | 'now', category }
// Each day's task has a stable id (recur + date), so two devices never make it twice, and a
// task you delete stays deleted. If the last one is still open, no new one is made, so a
// missed chore doesn't pile up into copies.
import { useEffect, useMemo } from 'react';
import { list, put, remove, exists, useKind, useSettings, useSyncStatus } from '../store.js';
import { idFor } from './ids.js';
import { parse, todayISO } from './dates.js';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function useRecurs() {
  const r = useKind('recur');
  return useMemo(() => [...r].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')), [r]);
}

export function scheduledOn(r, date) {
  const dow = parse(date).getDay();
  if (r.every === 'day') return true;
  if (r.every === 'weekdays') return dow >= 1 && dow <= 5;
  return (r.days || []).includes(dow);
}

/** "Every day", "Weekdays", "Sundays", "Mon, Wed, Fri" */
export function scheduleLabel(r) {
  if (r.every === 'day') return 'Every day';
  if (r.every === 'weekdays') return 'Weekdays';
  const d = [...(r.days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!d.length) return 'No days picked';
  if (d.length === 1) return LONG[d[0]];
  if (d.length === 7) return 'Every day';
  return d.map((x) => DAY_NAMES[x]).join(', ');
}

export const instanceId = (r, date) => idFor(`recur:${r.id}:${date}`);

/** Makes today's task for each template that's due. Safe to call often. */
export function makeDueTasks(stackLimit = 3, today = todayISO()) {
  const tasks = list('task');
  let active = tasks.filter((t) => t.status === 'active').length;
  const backlogOrders = tasks.filter((t) => t.status === 'backlog').map((t) => t.order ?? 0);
  let top = (backlogOrders.length ? Math.min(...backlogOrders) : 1) - 1;
  for (const r of list('recur')) {
    if (r.paused || !scheduledOn(r, today)) continue;
    const id = instanceId(r, today);
    if (exists(id)) continue; // made already (maybe on another device), or made and deleted
    if (tasks.some((t) => t.recurId === r.id && t.status !== 'done')) continue; // last one still open
    const now = r.to === 'now' && active < stackLimit;
    if (now) active++;
    put('task', {
      id,
      title: r.title,
      recurId: r.id,
      due: today,
      ...(r.category ? { category: r.category } : {}),
      createdAt: new Date().toISOString(),
      ...(now ? { status: 'active', pulledAt: new Date().toISOString() } : { status: 'backlog', order: top-- }),
    });
  }
}

/** Runs makeDueTasks when the app opens, comes back to the front, and when the day changes. */
export function useRecurring() {
  const { stackLimit } = useSettings();
  const sync = useSyncStatus();
  const settled = ['synced', 'local', 'signed-out', 'error', 'offline'].includes(sync.state);
  const recurs = useKind('recur');
  useEffect(() => {
    if (!settled) return;
    const run = () => document.visibilityState === 'visible' && makeDueTasks(stackLimit);
    run();
    let day = todayISO();
    const t = setInterval(() => {
      if (todayISO() !== day) {
        day = todayISO();
        run();
      }
    }, 60000);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', run);
    };
  }, [settled, stackLimit, recurs]);
}

export function saveRecur(r) {
  return put('recur', { every: 'week', days: [], to: 'backlog', createdAt: new Date().toISOString(), ...r, title: r.title.trim() });
}

/** Stops repeating. Tasks it already made stay, as normal tasks. */
export const deleteRecur = (r) => remove(r.id);
