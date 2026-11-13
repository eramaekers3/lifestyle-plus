// Patterns across everything the app already collects: journal ratings, sleep (Apple Health),
// workouts (fit+ and older ones), deep work sessions, XP and bank spending.
//
// Each insight splits recent days into two groups by one thing (slept 8+ hours, worked out, a busy day…)
// and compares another thing between them. Only differences big enough to matter, with enough days on
// both sides, are shown. These are patterns, not proof of cause.

import { useMemo } from 'react';
import { useKind } from '../store.js';
import { addDays, fmtDur, iso, todayISO } from './dates.js';
import { valueOf } from './journal.js';
import { scoreAll } from './sleepScore.js';
import { useFitWorkouts } from './fit.js';
import { buildEvents, workoutList } from './game.js';
import { useFinance, money } from './finance.js';

export const WINDOW = 56; // days looked at (8 weeks)
const MIN_GROUP = 3; // days needed on each side
const MIN_EFFECT = 0.35; // smallest difference worth showing, in standard deviations

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs, m) => (xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0);

/** Everything known about each day in the window, keyed by date. */
export function dailyFacts({ journal, health, workouts, fit, deepLogs, tasks, logs, habits, txns }, today = todayISO()) {
  const from = addDays(today, -(WINDOW - 1));
  const days = {};
  for (let i = 0; i < WINDOW; i++) days[addDays(from, i)] = {};

  const byJournal = Object.fromEntries(journal.map((e) => [e.date, e]));
  const byHealth = Object.fromEntries(health.filter((h) => h.sleepMin).map((h) => [h.date, h]));
  const scores = scoreAll(byHealth);
  const workoutDays = new Set(workoutList(workouts, fit).map((w) => w.date));
  const anyWorkouts = workoutDays.size > 0;

  const deep = {};
  for (const l of deepLogs) deep[l.date] = (deep[l.date] || 0) + (l.minutes || 0);
  const anyDeep = deepLogs.length > 0;

  const xp = {};
  for (const e of buildEvents({ tasks, logs, habits, workouts, fit })) {
    const d = iso(new Date(e.at));
    xp[d] = (xp[d] || 0) + e.xp;
  }

  // Spending only counts on days the bank data covers.
  const spendTx = txns.filter((t) => t.kind === 'spend');
  const bankFrom = spendTx.length ? spendTx.reduce((a, t) => (t.date < a ? t.date : a), today) : null;
  const spend = {};
  for (const t of spendTx) spend[t.date] = (spend[t.date] || 0) + t.amount;

  for (const d of Object.keys(days)) {
    const f = days[d];
    const e = byJournal[d];
    if (e) {
      f.energy = valueOf(e, 'energy');
      f.outlook = valueOf(e, 'attitude');
      f.pace = valueOf(e, 'busy');
    }
    // Health records are dated by the morning you woke up, so health[d] is the night before d.
    if (byHealth[d]) f.sleepBefore = byHealth[d].sleepMin;
    const next = addDays(d, 1);
    if (next <= today && byHealth[next]) f.sleepAfter = byHealth[next].sleepMin;
    if (next <= today && scores[next]) f.scoreAfter = scores[next].score;
    if (anyWorkouts) f.workout = workoutDays.has(d);
    if (anyDeep && d < today) f.deep = deep[d] || 0;
    if (d < today) f.xp = xp[d] || 0;
    if (bankFrom && d >= bankFrom && d < today) f.spend = Math.round((spend[d] || 0) * 100) / 100;
  }
  return days;
}

const rating = (v) => v.toFixed(1);
const OUTCOMES = {
  energy: { label: 'Energy', fmt: rating, unit: 'rating' },
  outlook: { label: 'Outlook', fmt: rating, unit: 'rating' },
  xp: { label: 'XP', fmt: (v) => `${Math.round(v)} XP`, unit: 'xp' },
  deep: { label: 'Deep work', fmt: (v) => fmtDur(Math.round(v)) || '0m', unit: 'min' },
  spend: { label: 'Spending', fmt: (v) => money(v), unit: 'money' },
  sleepAfter: { label: 'Sleep that night', fmt: (v) => fmtDur(Math.round(v)), unit: 'min' },
  scoreAfter: { label: 'Sleep score that night', fmt: (v) => String(Math.round(v)), unit: 'score' },
};

// Each split: how to sort a day into group A or B (or neither), and what to compare.
const SPLITS = [
  {
    id: 'sleep7',
    test: (f) => (f.sleepBefore == null ? null : f.sleepBefore >= 480),
    a: 'after 8+ hours of sleep',
    b: 'after less',
    outcomes: ['energy', 'outlook', 'deep', 'xp'],
  },
  {
    id: 'workout',
    test: (f) => (f.workout == null ? null : f.workout),
    a: 'on workout days',
    b: 'on rest days',
    outcomes: ['energy', 'outlook', 'scoreAfter', 'deep'],
  },
  {
    id: 'deep60',
    test: (f) => (f.deep == null ? null : f.deep >= 60),
    a: 'on days with an hour+ of deep work',
    b: 'on days with less',
    outcomes: ['outlook', 'energy'],
  },
  {
    id: 'busy',
    test: (f) => (f.pace == null ? null : f.pace >= 4 ? true : f.pace <= 3 ? false : null),
    a: 'on busy days',
    b: 'on calmer days',
    outcomes: ['spend', 'sleepAfter', 'outlook'],
  },
  {
    id: 'energy',
    test: (f) => (f.energy == null ? null : f.energy >= 4 ? true : f.energy <= 2 ? false : null),
    a: 'on high-energy days',
    b: 'on drained days',
    outcomes: ['xp', 'spend'],
  },
];

/** The differences worth knowing about, strongest first. */
export function findInsights(days) {
  const facts = Object.values(days);
  const out = [];
  for (const s of SPLITS) {
    for (const key of s.outcomes) {
      const A = [];
      const B = [];
      for (const f of facts) {
        const g = s.test(f);
        if (g === null || f[key] == null) continue;
        (g ? A : B).push(f[key]);
      }
      if (A.length < MIN_GROUP || B.length < MIN_GROUP) continue;
      const ma = mean(A);
      const mb = mean(B);
      const pooled = Math.sqrt(((A.length - 1) * variance(A, ma) + (B.length - 1) * variance(B, mb)) / (A.length + B.length - 2));
      const diff = ma - mb;
      if (!diff) continue;
      // With no spread at all, any difference is clear; otherwise measure it against the spread.
      const effect = pooled ? Math.abs(diff) / pooled : 1;
      if (effect < MIN_EFFECT) continue;
      out.push({ id: `${s.id}:${key}`, split: s, key, o: OUTCOMES[key], a: ma, b: mb, nA: A.length, nB: B.length, diff, effect, weight: effect * Math.sqrt(Math.min(A.length, B.length)) });
    }
  }
  return out.sort((x, y) => y.weight - x.weight);
}

/** "Energy averaged 3.8 after 8+ hours of sleep, vs 2.6 after less." plus a short change line. */
export function describe(ins) {
  const { o, split, a, b, diff } = ins;
  const lead = `${o.label} ${o.unit === 'money' ? 'came to' : 'averaged'} ${o.fmt(a)} ${split.a}, vs ${o.fmt(b)} ${split.b}.`;
  const up = diff > 0;
  let change;
  if (o.unit === 'rating') change = `${Math.abs(diff).toFixed(1)} points ${up ? 'higher' : 'lower'}`;
  else if (o.unit === 'money') change = `${money(Math.abs(diff))} ${up ? 'more' : 'less'} a day`;
  else if (o.unit === 'min') change = `${fmtDur(Math.round(Math.abs(diff)))} ${up ? 'more' : 'less'}`;
  else if (o.unit === 'xp') change = `${Math.round(Math.abs(diff))} XP ${up ? 'more' : 'less'} a day`;
  else change = `${Math.round(Math.abs(diff))} points ${up ? 'higher' : 'lower'}`;
  return { lead, change, up };
}

/** What's still missing for patterns to show up, in plain words. */
export function missing(days) {
  const f = Object.values(days);
  const rated = f.filter((x) => x.energy != null || x.outlook != null).length;
  const slept = f.filter((x) => x.sleepBefore != null).length;
  const need = [];
  if (rated < 8) need.push(`${8 - rated} more journal rating${8 - rated === 1 ? '' : 's'}`);
  if (slept < 8) need.push('more nights of sleep from Apple Health');
  return need;
}

export function useInsights() {
  const journal = useKind('journal');
  const health = useKind('health');
  const workouts = useKind('workout');
  const deepLogs = useKind('deep_log');
  const tasks = useKind('task');
  const logs = useKind('habitlog');
  const habits = useKind('habit');
  const fit = useFitWorkouts();
  const { txns } = useFinance();
  return useMemo(() => {
    const days = dailyFacts({ journal, health, workouts, fit, deepLogs, tasks, logs, habits, txns });
    return { insights: findInsights(days), missing: missing(days) };
  }, [journal, health, workouts, fit, deepLogs, tasks, logs, habits, txns]);
}
