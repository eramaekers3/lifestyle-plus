// The nightly stretch: about 5 minutes, built from what you trained today and yesterday.
//
// Inputs: workouts finished in fit+ (which exercises, soreness going in, back pain after) and
// Apple Health workouts (basketball, runs, walks…). Each one loads muscle groups; today counts
// fully, yesterday a bit less. The routine picks the stretches that cover the most loaded
// groups, keeps the low back in mind (leg days tend to leave it tight), and orders them
// standing → kneeling → lying so you end on the floor, ready for bed.
//
// Everything here is back-friendly on purpose: no loaded or standing toe-touches, hamstrings
// are stretched lying down with the back flat.
import { useMemo } from 'react';
import { put, get, useKind, useRecord } from '../store.js';
import { addDays } from './dates.js';
import { dayId } from './review.js';
import { useFitWorkouts } from './fit.js';

export const MUSCLES = {
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', hips: 'Hip flexors',
  adductors: 'Inner thighs', lowback: 'Low back', back: 'Lats & upper back', chest: 'Chest',
  shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', core: 'Core',
};

// fit+ exercise ids → muscles (main ones count fully, `also` ones half). Mirrors fit+'s program.js.
const EX = {
  boxjump: [['quads', 'glutes', 'calves'], ['hips']],
  broadjump: [['quads', 'glutes', 'hamstrings'], ['calves', 'hips']],
  cmj: [['quads', 'glutes', 'calves'], ['hips']],
  trapbar: [['glutes', 'quads', 'hamstrings'], ['back', 'lowback']],
  bench: [['chest', 'triceps'], ['shoulders']],
  dbbench: [['chest', 'triceps'], ['shoulders']],
  frontsquat: [['quads', 'glutes'], ['core', 'lowback', 'adductors']],
  ssbsquat: [['quads', 'glutes'], ['core', 'lowback', 'adductors']],
  bss: [['quads', 'glutes', 'hips'], ['adductors']],
  splitsquat: [['quads', 'glutes', 'hips'], ['adductors']],
  pullup: [['back', 'biceps'], []],
  assistpullup: [['back', 'biceps'], []],
  latpulldown: [['back', 'biceps'], []],
  csrow: [['back'], ['biceps']],
  dbrow: [['back'], ['biceps']],
  hexrow: [['back'], ['biceps']],
  pallof: [['core'], []],
  hipthrust: [['glutes'], ['hamstrings']],
  legpress: [['quads', 'glutes'], ['adductors']],
  inclinedb: [['chest', 'shoulders'], ['triceps']],
  hamcurl: [['hamstrings'], []],
  seatedcurl: [['hamstrings'], []],
  calf: [['calves'], []],
  smithcalf: [['calves'], []],
  slrdl: [['hamstrings', 'glutes'], ['lowback']],
  dbpress: [['shoulders', 'triceps'], []],
  lateral: [['shoulders'], []],
  pushdown: [['triceps'], []],
  curl: [['biceps'], []],
  carry: [['core'], ['lowback']],
};

// Exercise names from anywhere else (or a renamed fit+ exercise), matched loosely.
const BY_NAME = [
  [/jump|hop|bound/i, ['quads', 'glutes', 'calves']],
  [/deadlift|rdl|good ?morning/i, ['hamstrings', 'glutes', 'lowback']],
  [/squat|lunge|step-?up|leg press/i, ['quads', 'glutes', 'hips']],
  [/hip thrust|bridge/i, ['glutes', 'hamstrings']],
  [/ham(string)? curl|leg curl|nordic/i, ['hamstrings']],
  [/calf/i, ['calves']],
  [/bench|chest|push-?up|fly|dip/i, ['chest', 'triceps', 'shoulders']],
  [/row|pull-?up|pulldown|chin/i, ['back', 'biceps']],
  [/shoulder|overhead|lateral|raise|press/i, ['shoulders', 'triceps']],
  [/tricep|pushdown|extension|skull/i, ['triceps']],
  [/curl/i, ['biceps']],
  [/plank|pallof|carry|ab|core|crunch/i, ['core']],
];

// When a fit+ workout has no exercise list (older cache), go by which program day it was.
const BY_DAY = {
  d1: ['glutes', 'quads', 'hamstrings', 'back', 'biceps', 'calves', 'lowback', 'hips'],
  d2: ['chest', 'triceps', 'glutes', 'quads', 'hamstrings', 'calves', 'back', 'shoulders'],
  d3: ['quads', 'glutes', 'hamstrings', 'shoulders', 'triceps', 'biceps', 'calves', 'lowback'],
};

// Apple Health workout types → [muscle, weight].
const CARDIO = [
  [/basketball/i, 'basketball', [['calves', 1], ['hips', 0.8], ['quads', 0.8], ['adductors', 0.7], ['glutes', 0.6], ['hamstrings', 0.5], ['lowback', 0.3]]],
  [/run|jog/i, 'a run', [['calves', 1], ['hamstrings', 0.8], ['hips', 0.8], ['quads', 0.6], ['glutes', 0.4]]],
  [/cycl|bike|spin/i, 'a ride', [['quads', 0.9], ['hips', 0.8], ['glutes', 0.4], ['calves', 0.3]]],
  [/walk|hik/i, 'a walk', [['calves', 0.4], ['hips', 0.3], ['hamstrings', 0.2]]],
  [/swim|row/i, 'cardio', [['back', 0.7], ['shoulders', 0.7], ['chest', 0.3]]],
  [/elliptical|stair/i, 'cardio', [['quads', 0.6], ['calves', 0.6], ['hips', 0.5], ['glutes', 0.4]]],
];

/**
 * The stretches. `secs` is per side when `sides` is true. `pos` orders the flow (0 standing,
 * 1 kneeling / all fours, 2 lying). Stretches sharing a `group` don't both make it in.
 */
export const STRETCHES = [
  { id: 'calf', name: 'Wall calf stretch', pos: 0, sides: true, secs: 30, t: { calves: 1 },
    cue: 'Hands on the wall, back leg straight, heel down. Halfway through, bend the back knee a little to hit the lower calf.' },
  { id: 'doorway', name: 'Doorway chest stretch', pos: 0, sides: true, secs: 30, t: { chest: 1, shoulders: 0.5, biceps: 0.3 },
    cue: 'Forearm on the door frame at shoulder height, step through gently. Keep your ribs down.' },
  { id: 'crossbody', name: 'Cross-body shoulder', pos: 0, sides: true, secs: 25, t: { shoulders: 1, back: 0.3 },
    cue: 'Pull one arm across your chest at shoulder height. Keep that shoulder down, away from your ear.' },
  { id: 'triceps', name: 'Overhead triceps stretch', pos: 0, sides: true, secs: 25, t: { triceps: 1, back: 0.3 },
    cue: 'Hand reaches down your upper back; the other hand nudges the elbow back. Stand tall, don’t arch.' },
  { id: 'biceps', name: 'Wall biceps stretch', pos: 0, sides: true, secs: 25, t: { biceps: 1, chest: 0.3, shoulders: 0.2 },
    cue: 'Palm flat on the wall behind you at shoulder height, thumb up. Turn your body away slowly.' },

  { id: 'couch', name: 'Couch stretch', group: 'hipflex', pos: 1, sides: true, secs: 45, t: { hips: 1, quads: 1 },
    cue: 'Back knee against the couch or wall, shin up it, front foot planted. Squeeze the back glute and keep your ribs down. Don’t let your low back arch.' },
  { id: 'hipflexor', name: 'Half-kneeling hip flexor', group: 'hipflex', pos: 1, sides: true, secs: 40, t: { hips: 1, quads: 0.4 },
    cue: 'One knee down, tuck your pelvis under and squeeze that glute. Shift forward an inch. Reach the same-side arm up.' },
  { id: 'frog', name: 'Frog stretch', pos: 1, sides: false, secs: 45, t: { adductors: 1, hips: 0.4, glutes: 0.2 },
    cue: 'On all fours, slide your knees wide, ankles in line with knees. Rock your hips back slowly; stop before it pinches.' },
  { id: 'lat', name: 'Couch lat stretch', pos: 1, sides: false, secs: 45, t: { back: 1, triceps: 0.5, shoulders: 0.4 },
    cue: 'Kneel, elbows on the couch, palms together. Sink your hips back and let your chest drop between your arms.' },
  { id: 'catcow', name: 'Cat-cow', pos: 1, sides: false, secs: 40, t: { lowback: 0.9, back: 0.4, core: 0.3 },
    cue: 'Slow and easy: round up as you breathe out, let your belly drop as you breathe in. About 5 seconds each way.' },
  { id: 'child', name: 'Child’s pose', pos: 1, sides: false, secs: 45, t: { lowback: 0.8, back: 0.7, shoulders: 0.3, glutes: 0.2 },
    cue: 'Knees wide, sit back on your heels, arms long. Breathe into your low back. Walk your hands left and right for the sides.' },

  { id: 'hamstring', name: 'Lying hamstring stretch', pos: 2, sides: true, secs: 40, t: { hamstrings: 1, calves: 0.3 },
    cue: 'On your back, towel or band around one foot, leg up straight. Other leg flat on the floor. Back stays flat, no rounding.' },
  { id: 'figure4', name: 'Figure-4 stretch', pos: 2, sides: true, secs: 40, t: { glutes: 1, hips: 0.3, lowback: 0.3 },
    cue: 'On your back, ankle over the opposite knee. Pull that thigh toward you. Head and back stay down.' },
  { id: 'ninety', name: '90/90 hip hold', pos: 2, sides: true, secs: 35, t: { glutes: 0.7, hips: 0.6, adductors: 0.4 },
    cue: 'Sit with both knees bent at 90°, one in front, one to the side. Sit tall and lean gently over the front shin.' },
  { id: 'twist', name: 'Lying twist', pos: 2, sides: true, secs: 30, t: { lowback: 0.7, glutes: 0.4, chest: 0.3, back: 0.3 },
    cue: 'On your back, knees together, let them fall to one side. Arms out, look the other way. Let gravity do it.' },
  { id: 'knees', name: 'Knees to chest', pos: 2, sides: false, secs: 40, t: { lowback: 1, glutes: 0.3 },
    cue: 'On your back, hug both knees in and rock side to side a little. Easiest one for a tight low back.' },
  { id: 'wall', name: 'Legs up the wall', pos: 2, sides: false, secs: 60, t: { hamstrings: 0.3, calves: 0.3, lowback: 0.3 }, calm: true,
    cue: 'Hips near the wall, legs up it, arms out. Breathe slowly: 4 in, 6 out. A good one right before bed.' },
];

const GAP = 5; // seconds to get into each stretch (and to switch sides)
const TARGET = 300;
const MAX = 345;

/** How long a routine takes, getting into position included. */
export const stretchSecs = (s) => (s.sides ? s.secs * 2 + GAP : s.secs) + GAP;
export const READY_SECS = GAP;

function addLoad(load, muscles, w) {
  for (const m of muscles) load[m] = (load[m] || 0) + w;
}

function workoutLoad(load, w, k) {
  const exs = w.exs || [];
  if (exs.length) {
    for (const e of exs) {
      const known = EX[e.ex];
      if (known) {
        addLoad(load, known[0], k);
        addLoad(load, known[1], k * 0.5);
      } else {
        const hit = BY_NAME.find(([re]) => re.test(e.name || ''));
        if (hit) addLoad(load, hit[1], k * 0.8);
      }
    }
  } else {
    addLoad(load, BY_DAY[w.day] || ['quads', 'glutes', 'hamstrings', 'back', 'chest', 'shoulders'], k * 2);
  }
  // Soreness going in (0-3) and back pain after (0-10) both push the stretch toward those spots.
  for (const [m, v] of Object.entries(w.sore || {})) if (MUSCLES[m] && v > 0) load[m] = (load[m] || 0) + v * k;
  if (w.backPain > 0) load.lowback = (load.lowback || 0) + Math.min(6, w.backPain) * k;
}

const LEGS = ['quads', 'hamstrings', 'glutes'];
const SMALL = ['biceps', 'triceps', 'core'];
const UPPER = ['chest', 'back', 'shoulders'];

/**
 * Builds the routine for the night of `date` from that day's and the day before's training.
 * Returns { items, secs, why, focus: [muscle labels], rest: bool }.
 */
export function buildStretch({ date, fit = [], health = [] }) {
  const yday = addDays(date, -1);
  const load = {};
  const why = { today: [], yday: [] };

  for (const [d, k, bucket] of [[date, 1, 'today'], [yday, 0.6, 'yday']]) {
    const lifts = fit.filter((w) => w.date === d);
    for (const w of lifts) {
      workoutLoad(load, w, k);
      why[bucket].push(w.name.replace(/^Day \d+ · /, '').toLowerCase());
    }
    for (const h of health.filter((x) => x.date === d)) {
      const kind = CARDIO.find(([re]) => re.test(h.type || ''));
      const mins = h.minutes || 30;
      if (kind) {
        const scale = k * Math.min(1.5, Math.max(0.4, mins / 45)) * 2;
        for (const [m, w] of kind[2]) load[m] = (load[m] || 0) + w * scale;
        if (!why[bucket].includes(kind[1])) why[bucket].push(kind[1]);
      } else if (/strength|functional|cross/i.test(h.type || '') && !lifts.length) {
        // A lift logged in Apple Health but not fit+: assume full body.
        addLoad(load, ['quads', 'glutes', 'hamstrings', 'back', 'chest', 'shoulders'], k);
        if (!why[bucket].includes('a lift')) why[bucket].push('a lift');
      }
    }
  }

  // Leg days tend to leave the low back tight, so it always gets something after one.
  const legLoad = LEGS.reduce((a, m) => a + (load[m] || 0), 0);
  if (legLoad > 1.5) load.lowback = Math.max(load.lowback || 0, 1 + legLoad * 0.15);

  const rest = Object.keys(load).length === 0;
  // Arms and core recover fast and don't need much stretching; big muscles and hips come first.
  for (const m of SMALL) if (load[m]) load[m] *= 0.5;
  // A small floor so short days still get a full 5 minutes; on rest days, a general hips-and-back wind-down.
  for (const m of Object.keys(MUSCLES)) if (!SMALL.includes(m)) load[m] = (load[m] || 0) + (rest ? 0.5 : 0.1);
  if (rest) {
    load.lowback += 0.8;
    load.hips += 0.4;
  }

  const focus = Object.entries(load)
    .filter(([m]) => m !== 'core')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLES[m]);

  const left = { ...load };
  const picked = [];
  const groups = new Set();
  let secs = 0;
  const score = (s) => Object.entries(s.t).reduce((a, [m, w]) => a + w * (left[m] || 0), 0) / Math.sqrt(stretchSecs(s) / 60);
  const take = (best) => {
    picked.push(best);
    if (best.group) groups.add(best.group);
    secs += stretchSecs(best);
    // Diminishing returns: a covered muscle counts for less next time.
    for (const [m, w] of Object.entries(best.t)) left[m] = (left[m] || 0) * (1 - 0.7 * w);
  };
  // A real upper-body day gets at least one upper stretch, even when the legs are the bigger load.
  const upper = UPPER.filter((m) => load[m] >= 1.5).sort((a, b) => load[b] - load[a])[0];
  if (upper) take(STRETCHES.filter((s) => (s.t[upper] || 0) >= 0.7).reduce((a, b) => (score(b) > score(a) ? b : a)));
  for (;;) {
    const options = STRETCHES.filter((s) => !picked.includes(s) && !(s.group && groups.has(s.group)) && !s.calm && secs + stretchSecs(s) <= MAX);
    if (!options.length) break;
    const best = options.reduce((a, b) => (score(b) > score(a) ? b : a));
    if (secs >= TARGET - 20 || score(best) <= 0) break;
    take(best);
  }
  // Room left over: end on legs up the wall.
  const calm = STRETCHES.find((s) => s.calm);
  if (secs + stretchSecs(calm) <= MAX && secs < TARGET) {
    picked.push(calm);
    secs += stretchSecs(calm);
  }

  const items = picked.sort((a, b) => a.pos - b.pos || STRETCHES.indexOf(a) - STRETCHES.indexOf(b));
  return { items, secs, why, focus, rest };
}

/** One line on what tonight's routine is built from. */
export function whyLine({ why, rest }) {
  if (rest) return 'No training today or yesterday, so this is a general wind-down for your hips and back.';
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const parts = [];
  if (why.today.length) parts.push(`today’s ${list(why.today)}`);
  if (why.yday.length) parts.push(`yesterday’s ${list(why.yday)}`);
  return `Built for ${parts.join(' and ')}.`;
}

/** Tonight's routine, kept in step with fit+ and Apple Health. */
export function useStretch(date) {
  const fit = useFitWorkouts();
  const health = useKind('healthworkout');
  return useMemo(() => buildStretch({ date, fit, health }), [date, fit, health]);
}

/** Whether you've done the stretch for `date` (kept on that day's record, next to the shutdown). */
export function useStretched(date) {
  const rec = useRecord(dayId(date));
  return !!(rec && rec.stretchedAt);
}

export function markStretched(date) {
  const id = dayId(date);
  put('day', { ...(get(id) || {}), id, date, stretchedAt: new Date().toISOString() });
}
