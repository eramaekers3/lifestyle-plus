// Workouts now live in fit+. lifestyle+ only reads the ones you finish there, so they still count
// toward XP, coins, personal records, the weekly review and the journal.
//
// Same account, same Supabase project: fit+ keeps its workouts in its own `fit_records` table
// (kind 'session'), and that table's row-level security lets you read your own rows from here.
// lifestyle+ never writes to it.
//
// Finished workouts are kept on this device in a small cache, so XP and coins work offline and
// don't jump around while the first pull is loading.
import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase.js';
import { onSynced } from '../store.js';
import { toast } from './toast.js';

const KEY = 'lifestyleplus.fit.v1';
const TABLE = 'fit_records';
const DAY_NAMES = { d1: 'Lower + pull', d2: 'Upper + legs', d3: 'Full body' };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.rows) return raw;
  } catch {
    /* storage unavailable */
  }
  return { rows: {}, lastPull: null, owner: null };
}

let st = load();
let workouts = [];
const listeners = new Set();

function rebuild() {
  workouts = Object.values(st.rows).sort((a, b) => a.at.localeCompare(b.at));
}
rebuild();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* storage full or blocked */
  }
}
function emit() {
  rebuild();
  listeners.forEach((l) => l());
}

/** A finished fit+ session, boiled down to what lifestyle+ needs. Null if it isn't finished. */
function toWorkout(id, s) {
  if (!s || s.status !== 'done' || !s.date) return null;
  const items = s.items || [];
  const sets = items.reduce((a, it) => a + ((it.log || []).length || 0), 0);
  const num = s.day ? String(s.day).replace(/^d/, '') : '';
  const name = s.day ? `Day ${num}${DAY_NAMES[s.day] ? ` · ${DAY_NAMES[s.day]}` : ''}` : 'Workout';
  const at = s.finishedAt || `${s.date}T12:00:00`;
  const prs = (s.prs || []).map((p) => ({ at, label: p.text || p.ex || 'PR', ex: p.ex }));
  const started = s.createdAt ? Date.parse(s.createdAt) : null;
  const durationMin = started && s.finishedAt ? Math.round((Date.parse(s.finishedAt) - started) / 60000) : null;
  return { id, date: s.date, at, name, sets, prs, exercises: items.filter((it) => (it.log || []).length).length, durationMin: durationMin > 0 && durationMin < 300 ? durationMin : null };
}

/** Finished fit+ workouts on this device, oldest first: [{ id, date, at, name, sets, prs, … }]. */
export const listFit = () => workouts;
export const useFitWorkouts = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => workouts
  );

let pulling = false;
/** Pulls fit+ workouts changed since last time. Runs after every lifestyle+ sync. */
export async function syncFit(session) {
  if (!supabase || !session || pulling) return;
  pulling = true;
  try {
    const uid = session.user.id;
    if (st.owner && st.owner !== uid) st = { rows: {}, lastPull: null, owner: uid };
    st.owner = uid;
    const first = !st.lastPull;
    const fresh = [];

    let maxSeen = st.lastPull ? Date.parse(st.lastPull) : 0;
    const since = st.lastPull ? new Date(Date.parse(st.lastPull) - 5000).toISOString() : null;
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(TABLE).select('id, data, deleted, synced_at').eq('kind', 'session').order('synced_at', { ascending: true }).range(from, from + 999);
      if (since) q = q.gt('synced_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data) {
        const w = row.deleted ? null : toWorkout(row.id, row.data);
        if (w) {
          if (!st.rows[row.id]) fresh.push(w);
          st.rows[row.id] = w;
        } else delete st.rows[row.id];
        maxSeen = Math.max(maxSeen, Date.parse(row.synced_at));
      }
      if (data.length < 1000) break;
    }
    st.lastPull = new Date(maxSeen || Date.now()).toISOString();
    save();
    emit();

    // A workout just finished in fit+: say what it earned here.
    const recent = fresh.filter((w) => Date.now() - Date.parse(w.at) < 6 * 3600 * 1000);
    if (!first && recent.length) {
      // Loaded here rather than at the top: game.js and coins.js read this file too.
      const [{ XP }, { COINS }] = await Promise.all([import('./game.js'), import('./coins.js')]);
      const w = recent.at(-1);
      const xp = XP.workout + Math.min(XP.maxSets, w.sets * XP.perSet) + w.prs.length * XP.pr;
      const coins = COINS.workout + w.prs.length * COINS.pr;
      const prs = w.prs.length ? ` · ${w.prs.length} PR${w.prs.length > 1 ? 's' : ''}` : '';
      toast(`fit+ workout: +${xp} XP · +${coins} coins${prs}`);
    }
  } catch {
    /* fit+ not set up yet, or offline: try again next sync */
  } finally {
    pulling = false;
  }
}

onSynced(syncFit);
