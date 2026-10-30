// Workouts: your editable workout plans ("routines"), the one you're doing right now (the session),
// and finished workouts (kind 'workout', shown under Recent workouts).
//
// The session is one synced record, so it survives closing the app and shows on your other devices.
// Stopwatches are stored as timestamps, not ticking counters:
//   total     = (pausedAt or now) − startedAt − pausedMs
//   exercise  = ex.ms + (now − curSince) while it's the current exercise and the clock is running
import { useEffect, useMemo } from 'react';
import { get, list, put, putMany, remove, useKind, useRecord, useSettings, useSyncStatus, saveSettings, patch } from '../store.js';
import { idFor, newId } from './ids.js';
import { iso } from './dates.js';
import { GUIDE_ROUTINES } from './routines.js';

export const SESSION_ID = idFor('active-session');
export const KINDS = [
  { id: 'weight', label: 'Weight & reps' },
  { id: 'reps', label: 'Reps only' },
  { id: 'time', label: 'Time' },
];

/* ---------- Routines ---------- */

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const withIds = (exercises) => exercises.map((e) => ({ id: newId(), ...e }));

export function useRoutines() {
  const r = useKind('routine');
  return useMemo(() => [...r].sort(byOrder), [r]);
}

/**
 * Adds the guide's eight workouts once per account. Waits until sync has settled, and uses stable
 * ids, so two devices can't create duplicates; a flag in settings keeps deleted ones deleted.
 */
export function useSeedRoutines() {
  const s = useSettings();
  const sync = useSyncStatus();
  const settled = ['synced', 'local', 'signed-out', 'error', 'offline'].includes(sync.state);
  useEffect(() => {
    if (!settled || s.routinesSeeded) return;
    const have = new Set(list('routine').map((r) => r.id));
    putMany(
      GUIDE_ROUTINES.map((r, i) => ({ ...r, id: idFor(`routine:${r.slug}`), num: i + 1, order: i + 1, exercises: withIds(r.exercises) }))
        .filter((r) => !have.has(r.id))
        .map((r) => ['routine', r])
    );
    saveSettings({ routinesSeeded: true });
  }, [settled, s.routinesSeeded]);
}

export function addRoutine() {
  const all = list('routine');
  return put('routine', {
    name: 'New workout',
    tagline: '',
    intro: '',
    note: '',
    order: (all.length ? Math.max(...all.map((r) => r.order ?? 0)) : 0) + 1,
    exercises: [],
  });
}

export const newExercise = (name = 'New exercise') => ({ id: newId(), name, sets: 3, reps: '8–12', rest: '90 sec', notes: '', kind: 'weight' });

export const updateExercise = (routine, exId, changes) =>
  patch(routine.id, { exercises: routine.exercises.map((e) => (e.id === exId ? { ...e, ...changes } : e)) });

export function reorderRoutines(routines) {
  const changed = routines.filter((r, i) => r.order !== i + 1).map((r) => ['routine', { ...r, order: routines.indexOf(r) + 1 }]);
  if (changed.length) putMany(changed);
}

/* ---------- History ---------- */

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * The sets you logged for this exercise the last time you did it: [{ wt, reps }].
 * With a routineId, the last time you did it in that same workout wins; otherwise the last time anywhere.
 */
export function lastSetsFor(name, workouts, routineId = null) {
  const n = norm(name);
  const sorted = [...workouts].sort((a, b) => (b.startedAt || b.date).localeCompare(a.startedAt || a.date));
  const find = (list) => {
    for (const w of list) {
      const e = (w.exercises || []).find((x) => norm(x.name) === n);
      if (e && e.sets.length) return e.sets;
      const flat = (w.sets || []).filter((s) => norm(s.ex) === n);
      if (flat.length) return flat.map((s) => ({ wt: s.wt, reps: s.reps }));
    }
    return null;
  };
  return (routineId && find(sorted.filter((w) => w.routineId === routineId))) || find(sorted) || [];
}

/* ---------- The session ---------- */

export const useSession = () => useRecord(SESSION_ID);

const blankRow = (prev) => ({ wt: prev && prev.wt ? String(prev.wt) : '', reps: prev && prev.reps ? String(prev.reps) : '', done: false });

function sessionExercise(e, history, routineId = null) {
  const last = lastSetsFor(e.name, history, routineId);
  // Start with as many sets as last time (or the plan's count the first time), filled with last time's numbers.
  const n = Math.max(1, last.length || e.sets || 1);
  return {
    id: newId(),
    name: e.name,
    kind: e.kind || 'weight',
    unit: e.unit,
    target: { sets: e.sets, reps: e.reps, rest: e.rest, notes: e.notes },
    last,
    ms: 0,
    rows: Array.from({ length: n }, (_, i) => blankRow(last[i] || last[last.length - 1])),
  };
}

export function startSession(routine) {
  const now = Date.now();
  const history = list('workout');
  put('session', {
    id: SESSION_ID,
    routineId: routine ? routine.id : null,
    name: routine ? routine.name : 'Workout',
    intro: routine ? routine.intro : '',
    startedAt: now,
    pausedAt: null,
    pausedMs: 0,
    cur: 0,
    curSince: now,
    exercises: routine ? routine.exercises.map((e) => sessionExercise(e, history, routine.id)) : [],
  });
}

/** Applies a change to the latest copy of the session. fn(session) returns the fields to change. */
function update(fn) {
  const s = get(SESSION_ID);
  if (!s) return;
  put('session', { ...s, ...fn(s, Date.now()) });
}

/** Folds the running exercise clock into that exercise's total. */
const banked = (s, now) =>
  s.exercises.map((e, i) => (i === s.cur && s.curSince && !s.pausedAt ? { ...e, ms: e.ms + (now - s.curSince) } : e));

export const totalMs = (s, now) => Math.max(0, (s.pausedAt || now) - s.startedAt - (s.pausedMs || 0));
export const exerciseMs = (s, i, now) => {
  const e = s.exercises[i];
  if (!e) return 0;
  return e.ms + (i === s.cur && s.curSince && !s.pausedAt ? now - s.curSince : 0);
};

export const goToExercise = (i) =>
  update((s, now) => (i === s.cur ? {} : { exercises: banked(s, now), cur: i, curSince: s.pausedAt ? null : now }));

export const pauseSession = () => update((s, now) => (s.pausedAt ? {} : { exercises: banked(s, now), pausedAt: now, curSince: null }));

export const resumeSession = () =>
  update((s, now) => (!s.pausedAt ? {} : { pausedMs: (s.pausedMs || 0) + (now - s.pausedAt), pausedAt: null, curSince: now }));

export const resetExerciseClock = (i) =>
  update((s, now) => ({
    exercises: s.exercises.map((e, j) => (j === i ? { ...e, ms: 0 } : e)),
    ...(i === s.cur && !s.pausedAt ? { curSince: now } : {}),
  }));

export const updateRow = (i, r, changes) =>
  update((s) => ({
    exercises: s.exercises.map((e, j) => (j !== i ? e : { ...e, rows: e.rows.map((row, k) => (k === r ? { ...row, ...changes } : row)) })),
  }));

export const addRow = (i) =>
  update((s) => ({ exercises: s.exercises.map((e, j) => (j !== i ? e : { ...e, rows: [...e.rows, blankRow(e.rows[e.rows.length - 1])] })) }));

export const removeRow = (i, r) =>
  update((s) => ({ exercises: s.exercises.map((e, j) => (j !== i ? e : { ...e, rows: e.rows.filter((_, k) => k !== r) })) }));

export const editSessionExercise = (i, changes) =>
  update((s) => ({ exercises: s.exercises.map((e, j) => (j !== i ? e : { ...e, ...changes })) }));

export function addSessionExercise(name) {
  update((s, now) => {
    const e = sessionExercise(newExercise(name), list('workout'), s.routineId);
    const exercises = [...banked(s, now), e];
    return { exercises, cur: exercises.length - 1, curSince: s.pausedAt ? null : now };
  });
}

export function removeSessionExercise(i) {
  update((s, now) => {
    const exercises = banked(s, now).filter((_, j) => j !== i);
    const cur = Math.max(0, Math.min(i <= s.cur ? s.cur - (i < s.cur ? 1 : 0) : s.cur, exercises.length - 1));
    return { exercises, cur, curSince: s.pausedAt ? null : now };
  });
}

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** What finishing would save: only sets you checked off. */
export function summarize(s, now = Date.now()) {
  const exercises = banked(s, now)
    .map((e) => ({
      name: e.name,
      kind: e.kind,
      unit: e.unit,
      secs: Math.round(e.ms / 1000),
      sets: e.rows.filter((r) => r.done).map((r) => ({ wt: e.kind === 'weight' ? num(r.wt) : 0, reps: num(r.reps) })),
    }))
    .filter((e) => e.sets.length);
  const sets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const volume = exercises.filter((e) => e.kind === 'weight').reduce((a, e) => a + e.sets.reduce((b, x) => b + x.wt * x.reps, 0), 0);
  return { exercises, sets, volume, durationSec: Math.round(totalMs(s, now) / 1000) };
}

export function finishSession() {
  const s = get(SESSION_ID);
  if (!s) return null;
  const sum = summarize(s);
  if (sum.sets) {
    put('workout', {
      date: iso(new Date(s.startedAt)),
      name: s.name,
      routineId: s.routineId,
      startedAt: new Date(s.startedAt).toISOString(),
      durationSec: sum.durationSec,
      exercises: sum.exercises,
      // Flat list too, so older screens (exercise suggestions, volume) keep working.
      sets: sum.exercises.flatMap((e) => e.sets.map((x) => ({ ex: e.name, reps: x.reps, wt: x.wt }))),
    });
  }
  remove(SESSION_ID);
  return sum;
}

export const discardSession = () => remove(SESSION_ID);

/** 1:05:09 or 12:04 */
export function clock(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
