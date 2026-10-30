// Turns the lines an iPhone Shortcut sends from Apple Health into lifestyle+ records.
//
// Each line is:  metric|START|END|VALUE|UNIT
//   steps|2026-10-28T00:00:00-05:00|2026-10-29T00:00:00-05:00|8231|count
//   weight|2026-10-29T07:02:00-05:00|2026-10-29T07:02:00-05:00|181.4|lb
//   sleep|2026-10-28T23:41:00-05:00|2026-10-29T02:10:00-05:00|Core|
//   workout|2026-10-28T17:05:00-05:00|2026-10-28T17:52:00-05:00|Traditional Strength Training|
// Dates are ISO 8601 with the phone's own offset, so the first 10 characters are the local date.
import { idFor } from '../src/lib/ids.js';

const MAX_LINES = 60000; // a week of ungrouped step readings from two devices can run to thousands
const num = (v) => {
  const n = parseFloat(String(v || '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const pad = (n) => String(n).padStart(2, '0');

/**
 * Reads a date from the Shortcut. ISO 8601 is best, but the phone's normal formats also work
 * ("Oct 28, 2026 at 11:41 PM", "10/28/26, 11:41 PM"). Returns { date: 'YYYY-MM-DD', ms } or null.
 */
export function readDate(raw) {
  const s = String(raw || '').replace(/[\u202f\u00a0]/g, ' ').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const ms = Date.parse(s.length > 10 ? s.replace(' ', 'T') : `${s}T00:00:00`);
    const hour = /^\d{4}-\d{2}-\d{2}[T ](\d{2})/.exec(s);
    return { date: s.slice(0, 10), hour: hour ? +hour[1] : 0, ms: Number.isFinite(ms) ? ms : Date.parse(`${s.slice(0, 10)}T00:00:00`) };
  }
  // Parsed as wall-clock time in the server's zone; reading it back the same way keeps the phone's date.
  const d = new Date(s.replace(/\s+at\s+/i, ' '));
  if (Number.isNaN(d.getTime())) return null;
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours(), ms: d.getTime() };
}

/** A skipped line with every digit masked, so logs show its shape but no health values. */
export const lineShape = (line) => String(line).slice(0, 120).replace(/\d/g, '9');

const nextDay = (d) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** Minutes after local midnight, read from the phone's own wall clock in the date text. */
function wallMin(raw, ms) {
  const m = /T(\d{2}):(\d{2})/.exec(String(raw || ''));
  if (m) return +m[1] * 60 + +m[2];
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Which sleep stage a sample is, from Apple's value text ("Core", "Deep", "REM", "Asleep", "In Bed", "Awake"). */
export function sleepStage(v) {
  const t = String(v || '').toLowerCase();
  if (/bed/.test(t)) return 'inbed';
  if (/awake/.test(t)) return 'awake';
  if (/deep/.test(t)) return 'deep';
  if (/rem/.test(t)) return 'rem';
  if (/core|light/.test(t)) return 'core';
  return 'asleep';
}

/** Total minutes covered by a set of [start, end] ms ranges, counting overlaps once. */
function unionMin(parts) {
  if (!parts.length) return 0;
  const p = [...parts].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = p[0];
  for (const [s, e] of p.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  return Math.round((total + ce - cs) / 60000);
}

/** Returns { days: {date: {steps, sleepMin, bedMin, wakeMin, stages}}, weights: {date: lbs}, workouts: [...], counts } */
export function parseHealthLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);

  const steps = {};
  const stepHours = {}; // 'date|hour' -> { source: steps }
  const weights = {};
  const sleep = {}; // wake date -> [[start, end], ...]
  const workouts = [];
  const counts = { steps: 0, weight: 0, sleep: 0, workout: 0, skipped: 0 };
  const skippedShapes = [];
  const skip = (line) => {
    counts.skipped++;
    if (skippedShapes.length < 3) skippedShapes.push(lineShape(line));
  };

  for (const line of lines) {
    const [metric, start, end, value, unit, source] = line.split('|').map((p) => (p || '').trim());
    // Accept typed words or Apple's own type names ("Steps", "Body Mass", "Sleep Analysis", "Workout").
    const t = metric.toLowerCase();
    const m = /step/.test(t) ? 'steps'
      : /weight|body ?mass/.test(t) ? 'weight'
      : /sleep/.test(t) ? 'sleep'
      : /workout|exercise/.test(t) ? 'workout'
      : t;
    const sd = readDate(start);
    const ed = readDate(end) || sd;
    if (!sd) {
      skip(line);
      continue;
    }
    const d = sd.date;
    if (m === 'steps') {
      const v = num(value);
      if (v === null) { skip(line); continue; }
      // Individual readings with a source get de-duplicated per hour (see below), like the Health app.
      // Day totals (Group By Day) can't be de-duplicated, so they're added as-is.
      const span = Number.isFinite(sd.ms) && Number.isFinite(ed.ms) ? ed.ms - sd.ms : 0;
      if (source && span < 6 * 3600000) {
        const key = `${d}|${sd.hour}`;
        const bySource = (stepHours[key] = stepHours[key] || {});
        bySource[source] = (bySource[source] || 0) + v;
      } else {
        steps[d] = (steps[d] || 0) + v;
      }
      counts.steps++;
    } else if (m === 'weight') {
      let v = num(value);
      if (v === null) { skip(line); continue; }
      if (/kg/i.test(unit || '')) v *= 2.20462;
      const prev = weights[d];
      if (!prev || sd.ms > prev.at) weights[d] = { lbs: Math.round(v * 10) / 10, at: sd.ms };
      counts.weight++;
    } else if (m === 'sleep') {
      // Asleep time counts toward the total; "Awake" is kept to show restlessness; "In Bed" is ignored.
      const stage = sleepStage(value);
      if (stage === 'inbed') continue;
      const st = sd.ms;
      const e = ed.ms;
      if (!Number.isFinite(st) || !Number.isFinite(e) || e <= st) { skip(line); continue; }
      // A night belongs to the morning you wake up: sleep that starts at 6pm or later counts toward the
      // next day, so the minutes before midnight stay with the rest of the night.
      const sm = wallMin(start, st);
      const wake = sm >= 18 * 60 ? nextDay(sd.date) : sd.date;
      const n = (sleep[wake] = sleep[wake] || { parts: [], stages: {}, bed: null, end: null, anchor: null });
      // The night's 6pm-the-evening-before, so every sample can be placed on one clock axis.
      if (n.anchor === null) n.anchor = st - (sm >= 18 * 60 ? sm - 18 * 60 : sm + 6 * 60) * 60000;
      (n.stages[stage] = n.stages[stage] || []).push([st, e]);
      if (stage !== 'awake') {
        n.parts.push([st, e]);
        if (!n.bed || st < n.bed.ms) n.bed = { ms: st, min: wallMin(start, st) };
        if (!n.end || e > n.end.ms) n.end = { ms: e, min: wallMin(end, e) };
      }
      counts.sleep++;
    } else if (m === 'workout') {
      const s = sd.ms;
      const e = ed.ms;
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) { skip(line); continue; }
      workouts.push({ date: d, start: new Date(s).toISOString(), end: new Date(e).toISOString(), minutes: Math.round((e - s) / 60000), type: value || 'Workout' });
      counts.workout++;
    } else {
      skip(line);
    }
  }

  // iPhone and Apple Watch both count the same walk. For each hour, keep the device that counted more.
  for (const [key, bySource] of Object.entries(stepHours)) {
    const d = key.split('|')[0];
    steps[d] = (steps[d] || 0) + Math.max(...Object.values(bySource));
  }

  // Each night (by wake-up date): time asleep, counting iPhone and Apple Watch overlap once,
  // bedtime and wake time on the phone's clock, and minutes in each stage.
  const nights = {};
  for (const [date, n] of Object.entries(sleep)) {
    if (!n.parts.length) continue;
    const stages = {};
    for (const [k, parts] of Object.entries(n.stages)) stages[k] = unionMin(parts);
    // With Apple Watch stages, they're the record (like the Health app); a phone's plain "Asleep"
    // sample would paper over the times you woke up.
    const staged = ['core', 'deep', 'rem'].flatMap((k) => n.stages[k] || []);
    const asleep = staged.length ? staged : n.parts;
    if (staged.length) delete stages.asleep;
    const first = Math.min(...asleep.map((x) => x[0]));
    const last = Math.max(...asleep.map((x) => x[1]));
    const bed = n.bed.ms === first ? n.bed.min : n.bed.min + Math.round((first - n.bed.ms) / 60000);
    const wake = n.end.ms === last ? n.end.min : n.end.min - Math.round((n.end.ms - last) / 60000);
    // When each stage happened, as [from, to, stage] in minutes after 6pm the evening before.
    const CODE = { deep: 'd', core: 'c', rem: 'r', awake: 'w', asleep: 's' };
    const kinds = staged.length ? ['deep', 'core', 'rem', 'awake'] : ['asleep', 'awake'];
    const segs = kinds
      .flatMap((k) => (n.stages[k] || []).map(([a, b]) => [Math.round((a - n.anchor) / 60000), Math.round((b - n.anchor) / 60000), CODE[k]]))
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const sg of segs) {
      const prev = merged[merged.length - 1];
      if (prev && prev[2] === sg[2] && sg[0] <= prev[1] + 1) prev[1] = Math.max(prev[1], sg[1]);
      else merged.push([...sg]);
    }
    nights[date] = { sleepMin: unionMin(asleep), bedMin: (bed + 1440) % 1440, wakeMin: (wake + 1440) % 1440, stages, segs: merged };
  }
  const days = {};
  for (const [d, v] of Object.entries(steps)) (days[d] = days[d] || {}).steps = Math.round(v);
  for (const [d, v] of Object.entries(nights)) Object.assign((days[d] = days[d] || {}), v);

  // The oldest day in an upload is usually only partly covered (a "last 2 days" window starts
  // mid-day), so its step count is a floor, not the day's total. See toRecords.
  const stepDays = Object.keys(steps).sort();
  const sleepDays = Object.keys(nights).sort();

  return {
    days,
    stepsEdge: stepDays.length > 1 ? stepDays[0] : null,
    sleepEdge: sleepDays.length > 1 ? sleepDays[0] : null,
    weights: Object.fromEntries(Object.entries(weights).map(([d, w]) => [d, w.lbs])),
    workouts,
    counts,
    skippedShapes,
  };
}

/** Record rows for the `records` table, using the same ids the app uses. */
export function toRecords(parsed, existing = {}) {
  const now = new Date().toISOString();
  const rows = [];
  for (const [date, v] of Object.entries(parsed.days)) {
    const id = idFor(`h:${date}`);
    const old = existing[id] || {};
    const data = { ...old, ...v, id, date };
    // A partly covered oldest day never lowers a total saved by an earlier, fuller upload.
    if (date === parsed.stepsEdge && old.steps > (v.steps || 0)) data.steps = old.steps;
    // Same for the oldest night: a window that starts mid-night only caught the end of it.
    if (date === parsed.sleepEdge && old.sleepMin > (v.sleepMin || 0)) {
      Object.assign(data, { sleepMin: old.sleepMin, bedMin: old.bedMin, wakeMin: old.wakeMin, stages: old.stages, segs: old.segs });
    }
    rows.push({ id, kind: 'health', data, updated_at: now, deleted: false });
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
