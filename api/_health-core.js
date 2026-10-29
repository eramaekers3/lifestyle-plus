// Turns the lines an iPhone Shortcut sends from Apple Health into lifestyle+ records.
//
// Each line is:  metric|START|END|VALUE|UNIT
//   steps|2026-10-28T00:00:00-05:00|2026-10-29T00:00:00-05:00|8231|count
//   weight|2026-10-29T07:02:00-05:00|2026-10-29T07:02:00-05:00|181.4|lb
//   sleep|2026-10-28T23:41:00-05:00|2026-10-29T02:10:00-05:00|Core|
//   workout|2026-10-28T17:05:00-05:00|2026-10-28T17:52:00-05:00|Traditional Strength Training|
// Dates are ISO 8601 with the phone's own offset, so the first 10 characters are the local date.
import { idFor } from '../src/lib/ids.js';

const MAX_LINES = 5000;
const num = (v) => {
  const n = parseFloat(String(v || '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10) : null);

/** Returns { days: {date: {steps, sleepMin}}, weights: {date: lbs}, workouts: [...], counts } */
export function parseHealthLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);

  const steps = {};
  const weights = {};
  const sleep = {}; // wake date -> [[start, end], ...]
  const workouts = [];
  const counts = { steps: 0, weight: 0, sleep: 0, workout: 0, skipped: 0 };

  for (const line of lines) {
    const [metric, start, end, value, unit] = line.split('|').map((p) => (p || '').trim());
    const m = metric.toLowerCase();
    const d = isoDate(start);
    if (!d) {
      counts.skipped++;
      continue;
    }
    if (m === 'steps') {
      const v = num(value);
      if (v === null) { counts.skipped++; continue; }
      steps[d] = (steps[d] || 0) + v;
      counts.steps++;
    } else if (m === 'weight') {
      let v = num(value);
      if (v === null) { counts.skipped++; continue; }
      if (/kg/i.test(unit || '')) v *= 2.20462;
      const prev = weights[d];
      if (!prev || start > prev.at) weights[d] = { lbs: Math.round(v * 10) / 10, at: start };
      counts.weight++;
    } else if (m === 'sleep') {
      // Count time asleep only: skip "In Bed" and "Awake" samples.
      if (/bed|awake/i.test(value || '')) continue;
      const s = Date.parse(start);
      const e = Date.parse(end);
      const wake = isoDate(end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || !wake) { counts.skipped++; continue; }
      (sleep[wake] = sleep[wake] || []).push([s, e]);
      counts.sleep++;
    } else if (m === 'workout') {
      const s = Date.parse(start);
      const e = Date.parse(end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) { counts.skipped++; continue; }
      workouts.push({ date: d, start, end, minutes: Math.round((e - s) / 60000), type: value || 'Workout' });
      counts.workout++;
    } else {
      counts.skipped++;
    }
  }

  // Merge overlapping sleep pieces (iPhone and Apple Watch can both record the same night).
  const sleepMin = {};
  for (const [date, parts] of Object.entries(sleep)) {
    parts.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = parts[0];
    for (const [s, e] of parts.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else {
        total += ce - cs;
        [cs, ce] = [s, e];
      }
    }
    total += ce - cs;
    sleepMin[date] = Math.round(total / 60000);
  }

  const days = {};
  for (const [d, v] of Object.entries(steps)) (days[d] = days[d] || {}).steps = Math.round(v);
  for (const [d, v] of Object.entries(sleepMin)) (days[d] = days[d] || {}).sleepMin = v;

  return {
    days,
    weights: Object.fromEntries(Object.entries(weights).map(([d, w]) => [d, w.lbs])),
    workouts,
    counts,
  };
}

/** Record rows for the `records` table, using the same ids the app uses. */
export function toRecords(parsed, existing = {}) {
  const now = new Date().toISOString();
  const rows = [];
  for (const [date, v] of Object.entries(parsed.days)) {
    const id = idFor(`h:${date}`);
    rows.push({ id, kind: 'health', data: { ...(existing[id] || {}), ...v, id, date }, updated_at: now, deleted: false });
  }
  for (const [date, lbs] of Object.entries(parsed.weights)) {
    const id = idFor(`w:${date}`);
    rows.push({ id, kind: 'weight', data: { id, date, lbs, source: 'Apple Health' }, updated_at: now, deleted: false });
  }
  for (const w of parsed.workouts) {
    const id = idFor(`hw:${w.start}`);
    rows.push({ id, kind: 'healthworkout', data: { id, ...w }, updated_at: now, deleted: false });
  }
  const syncId = idFor('healthsync');
  rows.push({ id: syncId, kind: 'healthsync', data: { id: syncId, at: now, counts: parsed.counts }, updated_at: now, deleted: false });
  return rows;
}
