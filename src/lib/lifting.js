// Exercise history and weekly sets per muscle group, worked out from finished workouts.
import { useMemo } from 'react';
import { useKind } from '../store.js';
import { libraryEntry } from './exercises.js';
import { norm } from './text.js';


/** One entry per workout per exercise: { date, startedAt, name, sets: [{ wt, reps }] } */
function entries(workouts) {
  const out = [];
  for (const w of workouts) {
    const at = w.startedAt || `${w.date}T12:00:00`;
    if (w.exercises && w.exercises.length) {
      for (const e of w.exercises) if (e.sets && e.sets.length) out.push({ date: w.date, at, name: e.name, kind: e.kind, unit: e.unit, sets: e.sets, workout: w.name });
    } else if (w.sets && w.sets.length) {
      const by = new Map();
      for (const s of w.sets) {
        const k = norm(s.ex);
        if (!by.has(k)) by.set(k, { date: w.date, at, name: s.ex, sets: [], workout: w.name });
        by.get(k).sets.push({ wt: +s.wt || 0, reps: +s.reps || 0 });
      }
      out.push(...by.values());
    }
  }
  return out;
}

/** Estimated one-rep max (Epley). Only meaningful up to ~12 reps, so higher counts are capped. */
export const e1rm = (wt, reps) => (wt > 0 && reps > 0 ? wt * (1 + Math.min(reps, 12) / 30) : 0);

/** What a session is measured by: the best estimated max if weight was used, else the best reps (or time). */
export function sessionScore(sets) {
  const weighted = sets.some((s) => s.wt > 0);
  if (weighted) {
    let best = { score: 0, wt: 0, reps: 0 };
    for (const s of sets) {
      const v = e1rm(s.wt, s.reps);
      if (v > best.score) best = { score: v, wt: s.wt, reps: s.reps };
    }
    return { weighted, ...best };
  }
  const top = Math.max(0, ...sets.map((s) => s.reps || 0));
  return { weighted, score: top, wt: 0, reps: top };
}

/** Every exercise you've logged, most recently done first, with its sessions oldest → newest. */
export function useExerciseHistory() {
  const workouts = useKind('workout');
  return useMemo(() => {
    const map = new Map();
    for (const e of entries(workouts)) {
      const k = norm(e.name);
      if (!map.has(k)) map.set(k, { key: k, name: e.name, kind: e.kind, unit: e.unit, sessions: [] });
      map.get(k).sessions.push(e);
    }
    const list = [...map.values()].map((x) => {
      x.sessions.sort((a, b) => a.at.localeCompare(b.at));
      const last = x.sessions.at(-1);
      x.name = last.name;
      x.kind = last.kind || x.kind;
      x.unit = last.unit || x.unit;
      x.last = last;
      x.scores = x.sessions.map((s) => ({ date: s.date, ...sessionScore(s.sets) }));
      x.weighted = x.scores.some((s) => s.weighted);
      x.best = x.scores.reduce((a, b) => (b.score > a.score ? b : a), x.scores[0]);
      return x;
    });
    return list.sort((a, b) => b.last.at.localeCompare(a.last.at));
  }, [workouts]);
}

/* ---------- Muscle groups ---------- */

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];

// First matching rule wins. A primary muscle counts each set as 1, a helper muscle as ½.
const RULES = [
  [/jump|pogo|\bhops?\b|bound|walk|bike|\brun|treadmill|interval|cardio|rowing machine|elliptical/, {}],
  [/calf|calves|tibialis/, { Calves: 1 }],
  [/wrist|farmer|dead hang|grip|reverse curl/, { Forearms: 1 }],
  [/romanian|\brdl\b|deadlift|hamstring|leg curl|good morning|nordic/, { Hamstrings: 1, Glutes: 0.5 }],
  [/split squat|lunge|step-?up/, { Quads: 1, Glutes: 1 }],
  [/squat|leg press|leg extension|hack/, { Quads: 1, Glutes: 0.5 }],
  [/hip thrust|glute|bridge/, { Glutes: 1, Hamstrings: 0.5 }],
  [/rear[- ]?delt|reverse (pec|fly)|face pull/, { Shoulders: 1, Back: 0.5 }],
  [/tricep|pushdown|skull|kickback|\bdips?\b/, { Triceps: 1 }],
  [/curl/, { Biceps: 1 }],
  [/lateral raise|front raise|upright row/, { Shoulders: 1 }],
  [/shoulder press|overhead press|military|arnold/, { Shoulders: 1, Triceps: 0.5 }],
  [/fly|bench|chest press|push-?up|incline.*press|press.*incline|pec deck/, { Chest: 1, Triceps: 0.5, Shoulders: 0.5 }],
  [/row|pulldown|pull-?up|chin-?up|pullover|lat\b/, { Back: 1, Biceps: 0.5 }],
  [/plank|crunch|dead ?bug|pallof|bird ?dog|abs|core|leg raise|sit-?up|hollow|twist|ab wheel|rollout/, { Core: 1 }],
];

export function musclesFor(name) {
  const lib = libraryEntry(name);
  if (lib) return lib.muscles;
  const n = norm(name);
  for (const [re, m] of RULES) if (re.test(n)) return m;
  return {};
}

/** Sets per muscle group between two dates (inclusive), counting only sets you checked off. */
export function setsByMuscle(workouts, from, to) {
  const totals = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const e of entries(workouts)) {
    if (e.date < from || e.date > to) continue;
    const m = musclesFor(e.name);
    for (const [k, w] of Object.entries(m)) totals[k] += w * e.sets.length;
  }
  return totals;
}
