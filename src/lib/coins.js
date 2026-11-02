// Coins: a spendable currency next to XP. XP only goes up (your level); coins are earned from
// the same things you get done and spent in the rewards shop.
//
// Like XP, earnings aren't stored: they're worked out from what you've done since coins started,
// so they sync for free and undoing something takes its coins back. Purchases are records.
//
//   one-off task      2 + 1 per 15 min of its time estimate (12 at most)
//   repeating task    1
//   habit checked     1
//   workout saved     8, +2 per personal record
//   deep work         1 per 10 minutes actually logged
//   shutdown done     3
//
// The balance carries over week to week, but tops out at CAP; coins earned while you're at the
// cap are lost, so it pays to spend as you go.

import { useEffect, useMemo } from 'react';
import { get, list, put, remove, saveSettings, SETTINGS_ID, useKind, useSettings } from '../store.js';
import { idFor } from './ids.js';
import { findPRs } from './game.js';
import { iso, todayISO, weekStart } from './dates.js';

export const COINS = { taskBase: 2, taskPer15: 1, taskMax: 12, repeat: 1, habit: 1, workout: 8, pr: 2, deepPer10: 1, shutdown: 3 };
export const CAP = 250;

export const DEFAULT_REWARDS = [
  { slug: 'coffee', name: 'Coffee', emoji: '☕', price: 25, perWeek: null },
  { slug: 'rl', name: 'Rocket League · 1h', emoji: '🎮', price: 50, perWeek: 2 },
  { slug: 'fastfood', name: 'Fast food', emoji: '🍔', price: 45, perWeek: 1 },
];

export const taskCoins = (t) =>
  t.recurId ? COINS.repeat : Math.min(COINS.taskMax, COINS.taskBase + Math.floor((t.estimate || 0) / 15) * COINS.taskPer15);

/** Everything that earned coins since `since` (an ISO time), oldest first. */
export function coinEvents({ tasks, logs, habits, workouts, deepLogs, days }, since) {
  const after = (at) => at && at >= since;
  const avoid = new Set(habits.filter((h) => h.mode === 'avoid').map((h) => h.id));
  const names = new Map(habits.map((h) => [h.id, h.name || h.title || 'Habit']));
  const ev = [];
  for (const t of tasks) if (t.status === 'done' && after(t.doneAt)) ev.push({ kind: 'task', at: t.doneAt, coins: taskCoins(t), label: t.title });
  for (const l of logs) {
    const at = l.at || `${l.date}T12:00:00`;
    if (l.done && !avoid.has(l.habitId) && after(at)) ev.push({ kind: 'habit', at, coins: COINS.habit, label: names.get(l.habitId) || 'Habit' });
  }
  for (const w of workouts) {
    const at = w.startedAt || `${w.date}T12:00:00`;
    if (after(at)) ev.push({ kind: 'workout', at, coins: COINS.workout, label: w.name || 'Workout' });
  }
  for (const p of findPRs(workouts)) if (after(p.at)) ev.push({ kind: 'pr', at: p.at, coins: COINS.pr, label: `PR · ${p.name}` });
  for (const l of deepLogs) {
    const at = new Date(l.endedAt).toISOString();
    const c = Math.floor((l.minutes || 0) / 10) * COINS.deepPer10;
    if (c && after(at)) ev.push({ kind: 'deep', at, coins: c, label: `Deep work · ${l.minutes}m` });
  }
  for (const d of days) if (after(d.shutdownAt)) ev.push({ kind: 'shutdown', at: d.shutdownAt, coins: COINS.shutdown, label: 'Shutdown' });
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

/** Walks earnings and purchases in order: the balance, with anything over the cap lost. */
export function coinSummary(ev, spends, today = todayISO()) {
  const all = [...ev.map((e) => ({ ...e, type: 'earn' })), ...spends.map((s) => ({ ...s, type: 'spend' }))].sort((a, b) => a.at.localeCompare(b.at));
  const ws = weekStart(today);
  let balance = 0;
  let lost = 0;
  let lostWeek = 0;
  let week = 0;
  let todayEarned = 0;
  for (const x of all) {
    const day = iso(new Date(x.at));
    if (x.type === 'spend') {
      balance = Math.max(0, balance - x.price);
      continue;
    }
    const room = CAP - balance;
    const kept = Math.min(room, x.coins);
    balance += kept;
    lost += x.coins - kept;
    if (day >= ws) {
      week += x.coins;
      lostWeek += x.coins - kept;
    }
    if (day === today) todayEarned += x.coins;
  }
  return { balance, lost, lostWeek, week, today: todayEarned, full: balance >= CAP };
}

const midnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Coins start counting the first time the app runs with them (from that morning), and the default rewards go in once. */
export function useCoinsSetup() {
  const s = useSettings();
  useEffect(() => {
    if (!s.coinsSince) saveSettings({ coinsSince: midnight() });
    if (!s.rewardsSeeded) {
      const at = Date.now();
      // Fixed ids, so two devices seeding at once end up with one set.
      DEFAULT_REWARDS.forEach((r, i) => put('reward', { ...r, id: idFor(`reward:${r.slug}`), order: i + 1, createdAt: new Date(at + i).toISOString() }));
      saveSettings({ rewardsSeeded: true });
    }
  }, [s.coinsSince, s.rewardsSeeded]);
}

function gather(src) {
  return {
    tasks: src('task'),
    logs: src('habitlog'),
    habits: src('habit'),
    workouts: src('workout'),
    deepLogs: src('deep_log'),
    days: src('day'),
  };
}

export function useCoins() {
  const { coinsSince } = useSettings();
  const tasks = useKind('task');
  const logs = useKind('habitlog');
  const habits = useKind('habit');
  const workouts = useKind('workout');
  const deepLogs = useKind('deep_log');
  const days = useKind('day');
  const spends = useKind('coin_spend');
  return useMemo(() => {
    const since = coinsSince || midnight();
    const ev = coinEvents({ tasks, logs, habits, workouts, deepLogs, days }, since);
    const mine = spends.filter((s) => s.at >= since);
    return { ...coinSummary(ev, mine), events: ev, spends: mine.sort((a, b) => b.at.localeCompare(a.at)) };
  }, [coinsSince, tasks, logs, habits, workouts, deepLogs, days, spends]);
}

/** What the most recent thing of a kind just earned (for the pop after finishing it). */
export function latestCoins(kind) {
  const settings = get(SETTINGS_ID) || {};
  const ev = coinEvents(gather(list), settings.coinsSince || midnight());
  const e = [...ev].reverse().find((x) => x.kind === kind);
  return e ? e.coins : 0;
}

export const useRewards = () => {
  const rewards = useKind('reward');
  return useMemo(() => [...rewards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [rewards]);
};

/** How many times a reward was bought this week (Monday on). */
export function boughtThisWeek(spends, rewardId, today = todayISO()) {
  const ws = weekStart(today);
  return spends.filter((s) => s.rewardId === rewardId && iso(new Date(s.at)) >= ws).length;
}

export function buy(r) {
  return put('coin_spend', { rewardId: r.id, name: r.name, emoji: r.emoji || '', price: r.price, at: new Date().toISOString() });
}
export const unbuy = (spend) => remove(spend.id);
