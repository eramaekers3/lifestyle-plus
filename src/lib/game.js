// XP, levels, daily score, combos and personal records.
//
// Nothing here is stored. XP is worked out from what you've already done (finished tasks, habit
// check-offs, saved workouts), so it syncs between devices for free and undoing something takes
// its XP back.
//
//   task finished     10 XP
//   habit checked      5 XP   (build habits; avoid habits don't log check-offs)
//   workout saved     30 XP + 2 per set (up to +30)
//   personal record   20 XP   (best estimated max, or best reps, for an exercise)
//   combo             finishing tasks/habits within 15 minutes of each other: +2 XP per link, up to +10

import { useMemo } from 'react';
import { useKind, list } from '../store.js';
import { buildHabitIndex, habitStats, toggleHabit, completeTask } from './model.js';
import { haptic } from './haptics.js';
import { sessionScore } from './lifting.js';
import { todayISO, iso, addDays } from './dates.js';

export const XP = { task: 10, habit: 5, workout: 30, perSet: 2, maxSets: 30, pr: 20 };
const COMBO_GAP = 15 * 60 * 1000;
const COMBO_STEP = 2;
const COMBO_MAX = 10;

/** XP to go from level n to n + 1. Gets a little longer each level. */
export const levelCost = (n) => 100 + 50 * (n - 1);

export function levelFor(total) {
  let level = 1;
  let into = total;
  while (into >= levelCost(level)) {
    into -= levelCost(level);
    level++;
  }
  return { level, into, need: levelCost(level), pct: into / levelCost(level) };
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** Each workout's exercises as { name, sets: [{wt, reps}] }. */
function exercisesOf(w) {
  if (w.exercises && w.exercises.length) return w.exercises;
  const map = new Map();
  for (const s of w.sets || []) {
    if (!map.has(s.ex)) map.set(s.ex, { name: s.ex, sets: [] });
    map.get(s.ex).sets.push({ wt: s.wt, reps: s.reps });
  }
  return [...map.values()];
}

/** Every personal record ever set, oldest first. A first-ever session of an exercise isn't a record. */
export function findPRs(workouts) {
  const best = new Map();
  const out = [];
  const sorted = [...workouts].sort((a, b) => (a.startedAt || a.date || '').localeCompare(b.startedAt || b.date || ''));
  for (const w of sorted) {
    for (const e of exercisesOf(w)) {
      if (!e.sets || !e.sets.length || e.kind === 'time') continue;
      const s = sessionScore(e.sets);
      if (!s.score) continue;
      const k = norm(e.name);
      const prev = best.get(k);
      if (prev && s.score > prev.score + 0.01) {
        out.push({ at: w.startedAt || `${w.date}T12:00:00`, workoutId: w.id, name: e.name, wt: s.wt, reps: s.reps, weighted: s.weighted, prev });
      }
      if (!prev || s.score > prev.score) best.set(k, { score: s.score, wt: s.wt, reps: s.reps });
    }
  }
  return out;
}

export const prLabel = (p) => (p.weighted ? `${p.name} ${+p.wt.toFixed(1)}×${p.reps}` : `${p.name} ${p.reps} reps`);

/** Everything that earned XP, oldest first, with combos worked out. */
export function buildEvents({ tasks, logs, habits, workouts }) {
  const avoid = new Set(habits.filter((h) => h.mode === 'avoid').map((h) => h.id));
  const ev = [];
  for (const t of tasks) if (t.status === 'done' && t.doneAt) ev.push({ kind: 'task', at: t.doneAt, xp: XP.task, label: t.title });
  for (const l of logs) {
    if (!l.done || avoid.has(l.habitId)) continue;
    ev.push({ kind: 'habit', at: l.at || `${l.date}T12:00:00`, xp: XP.habit, timed: !!l.at, label: 'Habit' });
  }
  for (const w of workouts) {
    const sets = exercisesOf(w).reduce((a, e) => a + (e.sets ? e.sets.length : 0), 0);
    ev.push({ kind: 'workout', at: w.startedAt || `${w.date}T12:00:00`, xp: XP.workout + Math.min(XP.maxSets, sets * XP.perSet), label: w.name || 'Workout' });
  }
  for (const p of findPRs(workouts)) ev.push({ kind: 'pr', at: p.at, xp: XP.pr, label: prLabel(p), pr: p });
  ev.sort((a, b) => a.at.localeCompare(b.at));

  // Combos: quick tasks and habits back to back.
  let chain = 0;
  let lastAt = 0;
  for (const e of ev) {
    if (e.kind !== 'task' && !(e.kind === 'habit' && e.timed)) continue;
    const t = Date.parse(e.at);
    chain = lastAt && t - lastAt <= COMBO_GAP ? chain + 1 : 1;
    lastAt = t;
    e.combo = chain;
    e.bonus = Math.min(COMBO_MAX, COMBO_STEP * (chain - 1));
    e.xp += e.bonus;
  }
  return ev;
}

const localDay = (at) => iso(new Date(at));

export function summarizeGame(ev, today = todayISO()) {
  const total = ev.reduce((a, e) => a + e.xp, 0);
  const byDay = new Map();
  for (const e of ev) {
    const d = localDay(e.at);
    byDay.set(d, (byDay.get(d) || 0) + e.xp);
  }
  const weekFrom = addDays(today, -6);
  let week = 0;
  for (const [d, x] of byDay) if (d >= weekFrom && d <= today) week += x;
  const bestDay = Math.max(0, ...byDay.values());
  const combos = ev.filter((e) => e.combo);
  const lastCombo = combos.at(-1);
  const comboLive = lastCombo && Date.now() - Date.parse(lastCombo.at) <= COMBO_GAP ? lastCombo.combo : 0;
  return {
    total,
    ...levelFor(total),
    today: byDay.get(today) || 0,
    week,
    bestDay,
    combo: comboLive,
    prs: ev.filter((e) => e.kind === 'pr').map((e) => e.pr).reverse(),
    counts: {
      task: ev.filter((e) => e.kind === 'task').length,
      habit: ev.filter((e) => e.kind === 'habit').length,
      workout: ev.filter((e) => e.kind === 'workout').length,
    },
  };
}

function snapshot() {
  return { tasks: list('task'), logs: list('habitlog'), habits: list('habit'), workouts: list('workout') };
}

export function useGame() {
  const tasks = useKind('task');
  const logs = useKind('habitlog');
  const habits = useKind('habit');
  const workouts = useKind('workout');
  return useMemo(() => summarizeGame(buildEvents({ tasks, logs, habits, workouts })), [tasks, logs, habits, workouts]);
}

/** Right after something was finished: what the latest event earned. */
export function latestGain(kind) {
  const ev = buildEvents(snapshot());
  const e = [...ev].reverse().find((x) => x.kind === kind);
  return { xp: e ? e.xp : XP[kind] || 0, combo: e && e.combo > 1 ? e.combo : 0, today: summarizeGame(ev).today };
}

/** Personal records set in the workout that started at this time. */
export function prsSince(startedAtIso) {
  return findPRs(list('workout')).filter((p) => p.at >= startedAtIso);
}

/** Habit stats right now, read straight from the store (for before/after a check-off). */
export function habitStatsNow(h) {
  const idx = buildHabitIndex(list('habit'), list('habitlog'), list('habitmonth'));
  return habitStats(h, idx);
}

/* ---------- Celebrations ---------- */

function ensureLayer() {
  let layer = document.getElementById('cheer-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'cheer-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A small spark burst and a rising "+10 XP" at an element (or {x, y}).
 *   text   the main line, e.g. "+10 XP"
 *   sub    a second line, e.g. "×3 combo · 45 today"
 *   color  spark color (defaults to the accent)
 */
export function cheer(at, { text, sub, color, sparks = true } = {}) {
  if (typeof document === 'undefined' || !at) return;
  let x;
  let y;
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else ({ x, y } = at);
  const layer = ensureLayer();
  const c = color || getComputedStyle(document.documentElement).getPropertyValue('--sun').trim() || '#ffcf5c';
  const still = reduced();

  if (!still && sparks) {
    // Ring that opens out from the check.
    const ring = document.createElement('i');
    ring.className = 'cheer-ring';
    ring.style.cssText = `left:${x}px;top:${y}px;border-color:${c}`;
    layer.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.1)', opacity: 0 }], {
      duration: 520,
      easing: 'cubic-bezier(.22,1,.36,1)',
    }).onfinish = () => ring.remove();

    // Sparks.
    const n = 9;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'cheer-spark';
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 22 + Math.random() * 16;
      const w = 3 + Math.random() * 3;
      s.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${w}px;background:${i % 3 === 2 ? 'var(--ink)' : c}`;
      layer.appendChild(s);
      s.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3)`, opacity: 0 },
        ],
        { duration: 480 + Math.random() * 160, easing: 'cubic-bezier(.22,1,.36,1)' }
      ).onfinish = () => s.remove();
    }
  }

  if (text) {
    const pop = document.createElement('div');
    pop.className = 'cheer-pop';
    pop.innerHTML = `<b></b>${sub ? '<span></span>' : ''}`;
    pop.querySelector('b').textContent = text;
    if (sub) pop.querySelector('span').textContent = sub;
    const left = Math.max(60, Math.min(window.innerWidth - 60, x));
    pop.style.cssText = `left:${left}px;top:${y - 14}px`;
    layer.appendChild(pop);
    pop.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [
            { transform: 'translate(-50%,-30%) scale(.7)', opacity: 0 },
            { transform: 'translate(-50%,-100%) scale(1.05)', opacity: 1, offset: 0.22 },
            { transform: 'translate(-50%,-115%) scale(1)', opacity: 1, offset: 0.7 },
            { transform: 'translate(-50%,-150%) scale(.96)', opacity: 0 },
          ],
      { duration: 1250, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
    ).onfinish = () => pop.remove();
  }
}

/** The usual pop after finishing something: "+12 XP", "×3 combo · 57 today". */
export function cheerGain(at, kind, extra, sparks = true) {
  const g = latestGain(kind);
  const bits = [];
  if (g.combo) bits.push(`×${g.combo} combo`);
  if (extra) bits.push(extra);
  bits.push(`${g.today} today`);
  cheer(at, { text: `+${g.xp} XP`, sub: bits.join(' · '), sparks });
}


/* ---------- Finishing things, with the celebration ---------- */

/** Finish a task, then spark and show its XP at the element that was tapped. */
export function completeTaskFx(t, el) {
  completeTask(t);
  haptic('success');
  cheerGain(el, 'task');
}

/** For a row that animates out first: spark now, finish after `delay`, then show the XP where it was. */
export function completeTaskLater(t, el, delay, then) {
  const r = el.getBoundingClientRect();
  const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  haptic('success');
  cheer(at);
  setTimeout(() => {
    completeTask(t);
    cheerGain(at, 'task', '', false);
    if (then) then();
  }, delay);
}

/** Check a habit on or off. Checking one on celebrates, and calls out a new best streak. */
export function toggleHabitFx(h, date, current, el) {
  const checking = !current && h.mode !== 'avoid';
  const before = checking && date === todayISO() ? habitStatsNow(h) : null;
  toggleHabit(h, date, current);
  if (!checking) return;
  let extra = '';
  if (before) {
    const after = habitStatsNow(h);
    if (after.streak >= 3 && after.streak > before.best) extra = `new best streak: ${after.streak}`;
    else if (after.streak >= 2) extra = `${after.streak}-day streak`;
  }
  haptic(extra.startsWith('new best') ? 'big' : 'success');
  cheerGain(el, 'habit', extra);
}
