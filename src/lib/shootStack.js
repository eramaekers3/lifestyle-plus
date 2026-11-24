// shoot+ shoots in your stack, one step at a time. Each shoot+ booking has its own checklist of steps
// (edit photos, build poster, buttons made, gallery delivered, post to socials, everything finished…).
// Here a shoot is a layered card: only its next unchecked step is a real task you can pull, and the
// rest wait underneath it. So a shoot can never take more than one slot in Now.
//   - finishing the step's task checks that step off in shoot+, and the shoot's next step comes up
//     at the top of your backlog
//   - checking a step off in shoot+ finishes its task here (and brings up the next one)
//   - unchecking a step in shoot+ reopens it here; a later step that was waiting is put back underneath
//   - shoot+'s due date (when the gallery is due) is the due date for every step up to delivery
// A shoot shows up as soon as it's booked: its first step is "Shoot", due on the shoot date, and it
// checks itself off once that date has passed.
// Each step makes its task once (a stable id), so deleting a step's task keeps that shoot out of your
// stack until you check the step off in shoot+.
//
// shoot+ keeps its data in its own table (shoot_records) in the same Supabase project, and you're signed
// in to both with the same account, so this reads and writes your own shoot+ rows directly.
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabase.js';
import { exists, get, list, patch, put, useKind, useSettings, useSyncStatus } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';
import { addCategory } from './model.js';

const TABLE = 'shoot_records';
const EVERY = 2 * 60 * 1000; // re-read shoot+ this often while the app is open
const GAP = 15 * 1000; // and on coming back to the app, at most this often
// shoot+ treats shoots before this as delivered unless they have their own due date (keep in step with shoot+).
const QUEUE_START = '2026-10-01';

/** The old one-task-per-gallery id (before steps). Kept so those tasks can be swapped for step tasks. */
export const shootTaskId = (bookingId) => idFor(`shoot-task:${bookingId}`);
export const stepTaskId = (bookingId, stepId) => idFor(`shoot-step:${bookingId}:${stepId}`);

// Tasks parked out of sight. Nothing in the app lists these statuses.
const WAITING = 'waiting'; // a step that's no longer next (an earlier step was unchecked in shoot+)
const REPLACED = 'replaced'; // an old gallery task, now covered by step tasks

let state = { shoots: [], loaded: false, error: '', at: 0 };
// Writes to shoot+ still on their way. A read that overlaps one could bring back the old step and
// flip your check back, so such a read is thrown away and done again.
let writing = 0;
let writeSeq = 0;
const inFlight = new Set(); // `${shootId}:${stepId}` being saved to shoot+ right now
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

/* ---------- shoot+'s step rules (keep in step with shoot+ src/lib/steps.js) ---------- */

const has = (text, re) => re.test(text);

function stepLabels(service, pkgName) {
  const sv = service || {};
  const pkg = (sv.packages || []).find((p) => p.name === pkgName);
  const text = (pkg ? `${pkg.name} ${pkg.includes || ''}` : `${sv.name || ''} ${sv.includes || ''}`).toLowerCase();
  const all = `${text} ${(sv.includes || '').toLowerCase()} ${(sv.name || '').toLowerCase()}`;
  const video = sv.kind === 'video';
  const out = [{ label: 'Shoot', tag: 'shoot' }];
  if (!video && has(all, /preview/)) out.push({ label: 'Send preview photos' });
  if (video) out.push({ label: 'Edit video' });
  else out.push({ label: has(text, /\bhdr\b/) ? 'Edit HDR photos' : 'Edit photos' });
  if (has(text, /poster/)) out.push({ label: 'Build poster' });
  if (has(text, /button/)) out.push({ label: 'Build button template' }, { label: 'Buttons designed' }, { label: 'Buttons made' });
  if (!video && has(text, /video|film|reel|media day/)) out.push({ label: 'Videos made' });
  out.push({ label: video ? 'Video delivered' : 'Gallery delivered', tag: 'deliver' });
  out.push({ label: 'Post to socials' });
  out.push({ label: 'Everything finished', tag: 'final' });
  return out;
}

/** A booking's steps as shoot+ sees them (bookings from before steps get a list worked out from the service). */
function bookingSteps(b, sv) {
  if (b.steps && b.steps.length) return b.steps;
  const today = todayISO();
  const steps = stepLabels(sv, b.pkg).map((x, i) => ({
    id: `${b.id}-step${i}`,
    label: x.label,
    tag: x.tag || '',
    done: x.tag === 'shoot' && !!b.date && b.date <= today,
  }));
  return b.delivered ? steps.map((x) => ({ ...x, done: true })) : steps;
}

/** shoot+'s saveSteps rules: "Everything finished" checks everything; delivered/finished follow the steps. */
function settle(b, steps) {
  const today = todayISO();
  let next = steps;
  const final = next.find((x) => x.tag === 'final');
  if (final && final.done && next.some((x) => !x.done)) next = next.map((x) => ({ ...x, done: true }));
  const allDone = next.length > 0 && next.every((x) => x.done);
  if (!allDone && final && final.done) next = next.map((x) => (x.tag === 'final' ? { ...x, done: false } : x));
  const deliver = next.find((x) => x.tag === 'deliver');
  let delivered = b.delivered || '';
  if (deliver) delivered = deliver.done ? delivered || today : '';
  else if (allDone) delivered = delivered || today;
  return { ...b, steps: next, delivered, finished: allDone ? b.finished || today : '', updatedAt: Date.now() };
}

/** The steps that are stack work: all of them ("Shoot" checks itself once the date has passed). */
const workSteps = (steps) => steps;

/** Where a step task stands in its shoot, for the layered look: { n, total, rest: [upcoming labels] }. */
export function stepPlace(shoot, stepId) {
  if (!shoot) return null;
  const work = workSteps(shoot.steps);
  const i = work.findIndex((x) => x.id === stepId);
  if (i < 0) return null;
  return { n: i + 1, total: work.length, rest: work.slice(i + 1).filter((x) => !x.done), steps: work };
}

/* ---------- Reading and writing shoot+ ---------- */

/** Reads shoot+ and works out each recent shoot's steps. */
export async function loadShoots(force = false) {
  if (!supabase) return;
  if (Date.now() - state.at < (force ? GAP : EVERY)) return;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return;
  state.at = Date.now();
  const seq = writeSeq;
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
  if (writing || seq !== writeSeq) {
    // A step was checked here while this read was out: read again once it's saved.
    state.at = 0;
    setTimeout(() => loadShoots(true), 1500);
    return;
  }
  const rows = data || [];
  const by = (k) => rows.filter((r) => r.kind === k).map((r) => r.data);
  const services = Object.fromEntries(by('service').map((x) => [x.id, x]));
  const clients = Object.fromEntries(by('client').map((x) => [x.id, x]));
  const settings = by('settings')[0] || {};
  const today = todayISO();
  const shoots = by('booking')
    .filter((b) => !b.sample && !b.cancelled && b.date && (b.date >= QUEUE_START || b.due))
    .map((b) => {
      const sv = services[b.serviceId];
      const days = num(sv && sv.turnaround) || num(settings.turnaround) || 7;
      const client = clients[b.clientId];
      const what = b.title || [sv && sv.name, b.pkg].filter(Boolean).join(' — ') || 'Shoot';
      const past = b.date <= today;
      const steps = bookingSteps(b, sv).map((x) => (x.tag === 'shoot' && past && !x.done ? { ...x, done: true } : x));
      return {
        id: b.id,
        who: client ? client.name : what,
        what,
        date: b.date,
        due: b.due || addDays(b.date, days),
        hours: num(b.hours),
        gallery: b.gallery || '',
        steps,
        sv,
      };
    });
  set({ shoots, loaded: true, error: '' });
}

/** Checks steps on or off in shoot+. marks: { stepId: true/false }. onSaved runs once shoot+ has it. */
async function markSteps(shoot, marks, onSaved) {
  if (!supabase) return;
  writing++;
  writeSeq++;
  try {
    if (await saveMarks(shoot, marks)) {
      if (onSaved) onSaved();
      set({ shoots: [...state.shoots], error: '' });
    }
  } catch (e) {
    set({ error: (e && e.message) || 'Couldn’t reach shoot+' });
  } finally {
    writing--;
  }
}

async function saveMarks(shoot, marks) {
  // Start from the booking as it is now in shoot+, so an edit made there since the last check isn't lost.
  const { data: fresh, error: readErr } = await supabase.from(TABLE).select('data').eq('id', shoot.id).maybeSingle();
  if (readErr) throw readErr;
  if (!fresh || !fresh.data) return false;
  const b = fresh.data;
  const today = todayISO();
  const steps = bookingSteps(b, shoot.sv).map((x) => {
    if (x.id in marks) return { ...x, done: marks[x.id] };
    if (x.tag === 'shoot' && b.date && b.date <= today) return { ...x, done: true };
    return x;
  });
  const data = settle(b, steps);
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: shoot.id, kind: 'booking', data, updated_at: new Date().toISOString(), deleted: false });
  if (error) throw error;
  // Keep our copy in line so the stack doesn't flip back before the next read.
  const done = Object.fromEntries(data.steps.map((x) => [x.id, x.done]));
  const past = !!b.date && b.date <= today;
  shoot.steps = shoot.steps.map((x) => (x.id in done ? { ...x, done: done[x.id] || (x.tag === 'shoot' && past) } : x));
  return true;
}

/* ---------- Keeping the stack in step ---------- */

function photoCategory() {
  const cats = list('category');
  const found = cats.find((c) => ['photo', 'photography', 'business'].includes(c.name.trim().toLowerCase()));
  return (found || addCategory('Photo')).id;
}

// Rough editing time: about two hours per hour of shooting, at least an hour (change it on the task).
const editEstimate = (s) => Math.max(60, Math.round(((s.hours || 1) * 120) / 15) * 15);

/** Steps up to and including delivery are due when the gallery is due; after that, no due date. */
function dueFor(s, step) {
  if (step.tag === 'shoot') return s.date;
  const work = workSteps(s.steps);
  const d = work.findIndex((x) => x.tag === 'deliver');
  return d < 0 || work.indexOf(step) <= d ? s.due : null;
}

const titleFor = (s, step) => `${step.label} — ${s.who}`;

export function syncShootTasks(shoots) {
  const now = new Date().toISOString();
  const all = list('task');
  const backlog = all.filter((t) => t.status === 'backlog').map((t) => t.order ?? 0);
  let top = (backlog.length ? Math.min(...backlog) : 1) - 1;
  let cat = null;

  for (const s of shoots) {
    const work = workSteps(s.steps);
    const mine = all.filter((t) => t.shootId === s.id && t.shootStepId);
    const oldId = shootTaskId(s.id);
    const old = get(oldId);
    // You deleted this shoot's gallery task before steps came along: keep it out.
    if (!mine.length && exists(oldId) && !old) continue;

    // 1. Bring each step's task in line with shoot+.
    const marks = {};
    const saved = {}; // task id → step done, recorded once shoot+ has the change
    for (const t of mine) {
      const step = s.steps.find((x) => x.id === t.shootStepId);
      if (!step) {
        // The step was taken off the list in shoot+.
        if (t.status !== 'done' && t.status !== REPLACED) patch(t.id, { status: REPLACED, due: null, dueTime: null });
        continue;
      }
      const taskDone = t.status === 'done';
      if (step.done !== !!t.shootStepDone) {
        // shoot+ changed since we last looked: follow it.
        const ch = { shootStepDone: step.done };
        if (step.done && !taskDone) Object.assign(ch, { status: 'done', doneAt: now });
        if (!step.done && taskDone) Object.assign(ch, { status: 'backlog', order: top--, doneAt: null });
        patch(t.id, ch);
      } else if (taskDone !== step.done && !inFlight.has(`${s.id}:${step.id}`)) {
        // You finished (or reopened) the step here: check it off in shoot+ to match. The task only
        // counts as matched once shoot+ has it, so if saving fails the next pass tries again.
        marks[step.id] = taskDone;
        saved[t.id] = taskDone;
      }
    }
    if (Object.keys(marks).length) {
      const keys = Object.keys(marks).map((id) => `${s.id}:${id}`);
      keys.forEach((k) => inFlight.add(k));
      markSteps(s, marks, () => {
        for (const [id, done] of Object.entries(saved)) if (get(id)) patch(id, { shootStepDone: done });
      }).finally(() => keys.forEach((k) => inFlight.delete(k)));
    }

    // 2. Only the next unchecked step is out in your stack; any other open step goes back underneath.
    const next = work.find((x) => !x.done);
    const nextId = next ? stepTaskId(s.id, next.id) : '';
    for (const t of mine) {
      const cur = get(t.id);
      if (cur && cur.id !== nextId && (cur.status === 'backlog' || cur.status === 'active')) {
        const step = s.steps.find((x) => x.id === cur.shootStepId);
        if (step && step.done) patch(cur.id, { status: 'done', doneAt: now, shootStepDone: true });
        else patch(cur.id, { status: WAITING, due: null, dueTime: null });
      }
    }

    // 3. The step that's up next.
    if (next) {
      const task = get(nextId);
      const due = dueFor(s, next);
      if (task) {
        const ch = {};
        if (task.status === WAITING) Object.assign(ch, { status: 'backlog', order: top-- });
        if ((task.due || null) !== (due || null)) ch.due = due;
        if (task.title !== titleFor(s, next) && task.title === task.shootTitle) ch.title = ch.shootTitle = titleFor(s, next);
        if (s.gallery && task.link !== s.gallery) ch.link = s.gallery;
        if (Object.keys(ch).length) patch(nextId, ch);
      } else if (!exists(nextId)) {
        cat = cat || photoCategory();
        // Swapping out an old gallery task you'd already pulled into Now: the step takes its place there.
        const wasActive = old && old.status === 'active';
        const title = titleFor(s, next);
        put('task', {
          id: nextId,
          title,
          shootTitle: title,
          ...(wasActive ? { status: 'active', pulledAt: old.pulledAt || now, nowOrder: old.nowOrder ?? null } : { status: 'backlog', order: top-- }),
          ...(due ? { due } : {}),
          ...(/edit/i.test(next.label) ? { estimate: editEstimate(s) } : next.tag === 'shoot' && s.hours ? { estimate: Math.round(s.hours * 60) } : {}),
          category: cat,
          shootId: s.id,
          shootStepId: next.id,
          shootStepDone: false,
          link: s.gallery,
          createdAt: now,
        });
      }
      // (A step task you deleted stays deleted: the shoot stays out until you check that step off in shoot+.)
    }

    // 4. The old one-task-per-gallery task is covered by the steps now.
    if (old && old.status !== 'done' && old.status !== REPLACED) patch(oldId, { status: REPLACED, due: null, dueTime: null });
  }
}

/** Keeps shoot+ steps and your stack in step. Mount once; waits for sync so other devices' deletes count. */
export function useShootTasks() {
  const { shootToStack } = useSettings();
  const sync = useSyncStatus();
  const tasks = useKind('task');
  const { shoots, loaded } = useShootStatus();
  const signedIn = !!sync.email;
  const settled = ['synced', 'error', 'offline'].includes(sync.state);
  const on = shootToStack !== false && signedIn;

  useEffect(() => {
    if (!on) return;
    loadShoots();
    const onVis = () => document.visibilityState === 'visible' && loadShoots(true);
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => loadShoots(), EVERY);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [on]);

  useEffect(() => {
    if (on && settled && loaded && shoots.length) syncShootTasks(shoots);
  }, [on, settled, loaded, shoots, tasks]);
}

/** Check a shoot's step on or off from here, in any order. The stack catches up on its own:
 *  a step you check that's waiting underneath just drops out, and the next open step stays on top. */
export function toggleShootStep(shootId, stepId, done) {
  const s = state.shoots.find((x) => x.id === shootId);
  if (!s) return;
  const step = s.steps.find((x) => x.id === stepId);
  if (!step) return;
  s.steps = s.steps.map((x) => (x.id === stepId || (done && step.tag === 'final') ? { ...x, done } : x));
  set({ shoots: [...state.shoots] });
  markSteps(s, { [stepId]: done });
}

/** Looks up the shoot a task came from (for the layered look and the task sheet). */
export function useShootFor(t) {
  const { shoots } = useShootStatus();
  return t && t.shootId ? shoots.find((s) => s.id === t.shootId) || null : null;
}
