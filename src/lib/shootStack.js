// shoot+ galleries in your stack. Every shoot whose gallery still needs editing and delivering becomes a
// backlog task (in a "Photo" category), due when shoot+ says the gallery is due. They stay in step:
//   - finishing the task marks the gallery delivered in shoot+
//   - marking it delivered in shoot+ finishes the task
//   - a new due date in shoot+ moves the task's due date
// Each shoot makes its task once (a stable id), so deleting a task you don't want keeps it gone.
//
// shoot+ keeps its data in its own tables (shoot_records) in the same Supabase project, and you're signed
// in to both with the same account, so this reads and writes your own shoot+ rows directly.
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabase.js';
import { exists, get, list, patch, put, useKind, useSettings, useSyncStatus } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';
import { addCategory } from './model.js';

const TABLE = 'shoot_records';
const EVERY = 10 * 60 * 1000;
// shoot+ treats shoots before this as delivered unless they have their own due date (keep in step with shoot+).
const QUEUE_START = '2026-10-01';

export const shootTaskId = (bookingId) => idFor(`shoot-task:${bookingId}`);

let state = { galleries: [], loaded: false, error: '', at: 0 };
const listeners = new Set();
const set = (c) => {
  state = { ...state, ...c };
  listeners.forEach((l) => l());
};
export const useShootStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Reads shoot+ and works out which galleries are waiting, the same way shoot+'s "To edit" card does. */
export async function loadGalleries(force = false) {
  if (!supabase) return;
  if (!force && Date.now() - state.at < EVERY) return;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return;
  state.at = Date.now();
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, kind, data, deleted')
    .in('kind', ['booking', 'service', 'client', 'settings'])
    .eq('deleted', false);
  if (error) {
    // No shoot+ tables yet (or no access): stay quiet in the stack, say why in Settings.
    set({ loaded: true, error: error.message });
    return;
  }
  const rows = data || [];
  const by = (k) => rows.filter((r) => r.kind === k).map((r) => r.data);
  const services = Object.fromEntries(by('service').map((x) => [x.id, x]));
  const clients = Object.fromEntries(by('client').map((x) => [x.id, x]));
  const settings = by('settings')[0] || {};
  const today = todayISO();
  const galleries = by('booking')
    .filter((b) => !b.sample && !b.cancelled && b.date && b.date <= today && (b.date >= QUEUE_START || b.due))
    .map((b) => {
      const sv = services[b.serviceId];
      const days = num(sv && sv.turnaround) || num(settings.turnaround) || 7;
      const client = clients[b.clientId];
      const what = b.title || [sv && sv.name, b.pkg].filter(Boolean).join(' — ') || 'Shoot';
      return {
        id: b.id,
        title: client ? `Edit & deliver: ${client.name} (${what})` : `Edit & deliver: ${what}`,
        due: b.due || addDays(b.date, days),
        delivered: !!b.delivered,
        hours: num(b.hours),
        gallery: b.gallery || '',
        row: b,
      };
    });
  set({ galleries, loaded: true, error: '' });
}

/** Marks a gallery delivered (or not) in shoot+. */
async function setDelivered(g, delivered) {
  if (!supabase) return;
  // Start from the booking as it is now in shoot+, so an edit made there since the last check isn't lost.
  const { data: fresh } = await supabase.from(TABLE).select('data').eq('id', g.id).maybeSingle();
  const data = { ...((fresh && fresh.data) || g.row), delivered: delivered ? todayISO() : '', updatedAt: Date.now() };
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: g.id, kind: 'booking', data, updated_at: new Date().toISOString(), deleted: false });
  if (!error) g.row = data;
}

function photoCategory() {
  const cats = list('category');
  const found = cats.find((c) => ['photo', 'photography', 'business'].includes(c.name.trim().toLowerCase()));
  return (found || addCategory('Photo')).id;
}

// Rough editing time: about two hours per hour of shooting, at least an hour (change it on the task).
const estimateFor = (g) => Math.max(60, Math.round((g.hours || 1) * 120 / 15) * 15);

export function syncShootTasks(galleries) {
  const backlog = list('task').filter((t) => t.status === 'backlog').map((t) => t.order ?? 0);
  let top = (backlog.length ? Math.min(...backlog) : 1) - 1;
  let cat = null;

  for (const g of galleries) {
    const id = shootTaskId(g.id);
    const task = get(id);

    if (!task) {
      // New: only galleries still waiting, and never one whose task you deleted.
      if (g.delivered || exists(id)) continue;
      cat = cat || photoCategory();
      put('task', {
        id,
        title: g.title,
        status: 'backlog',
        order: top--,
        due: g.due,
        estimate: estimateFor(g),
        category: cat,
        shootId: g.id,
        link: g.gallery,
        shootDelivered: false,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const taskDone = task.status === 'done';
    const changes = {};
    if (g.delivered !== !!task.shootDelivered) {
      // shoot+ changed since we last looked: follow it.
      changes.shootDelivered = g.delivered;
      if (g.delivered && !taskDone) Object.assign(changes, { status: 'done', doneAt: new Date().toISOString() });
      if (!g.delivered && taskDone) Object.assign(changes, { status: 'backlog', doneAt: null });
    } else if (taskDone !== g.delivered) {
      // You finished (or reopened) the task: mark the gallery in shoot+ to match.
      setDelivered(g, taskDone);
      g.delivered = taskDone;
      changes.shootDelivered = taskDone;
    }
    if (task.due !== g.due) changes.due = g.due;
    if (g.gallery && task.link !== g.gallery) changes.link = g.gallery;
    if (Object.keys(changes).length) patch(id, changes);
  }
}

/** Keeps shoot+ galleries and your stack in step. Mount once; waits for sync so other devices' deletes count. */
export function useShootTasks() {
  const { shootToStack } = useSettings();
  const sync = useSyncStatus();
  const tasks = useKind('task');
  const { galleries, loaded } = useShootStatus();
  const signedIn = !!sync.email;
  const settled = ['synced', 'error', 'offline'].includes(sync.state);
  const on = shootToStack !== false && signedIn;

  useEffect(() => {
    if (!on) return;
    loadGalleries();
    const onVis = () => document.visibilityState === 'visible' && loadGalleries();
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => loadGalleries(), EVERY);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [on]);

  useEffect(() => {
    if (on && settled && loaded && galleries.length) syncShootTasks(galleries);
  }, [on, settled, loaded, galleries, tasks]);
}
