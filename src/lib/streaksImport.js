// Reads a CSV export from the Streaks app and turns it into lifestyle+ habits and history.
// Re-importing the same file (or a newer export) updates history instead of making duplicates.
import { idFor } from './ids.js';
import { addDays } from './dates.js';
import { monthId } from './model.js';

const CODES = {
  completed_manually: 'd',
  completed_auto: 'd',
  completed_manually_partial: 'p',
  skipped_auto: 's',
  skipped_manually: 's',
  missed_auto: 'm',
  missed_manually: 'm',
};
// When a day has several entries (e.g. three check-ins), keep the best one.
const RANK = { d: 4, p: 3, s: 2, m: 1 };

/** Minimal CSV parser that handles quoted fields, commas and newlines inside quotes. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0]);
}

const toISO = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/**
 * Returns { habits: [...], from, to, entries } or throws if the file isn't a Streaks export.
 * Each habit: { taskId, name, icon, mode, paused, first, last, days: Map(date -> code), counts }
 */
export function parseStreaksExport(text) {
  const rows = parseCSV(String(text || '').replace(/^﻿/, ''));
  if (!rows.length) throw new Error('That file is empty.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const iTask = col('task_id');
  const iTitle = col('title');
  const iIcon = col('icon');
  const iType = col('entry_type');
  const iDate = col('entry_date');
  const iStamp = col('entry_timestamp_local');
  if ([iTask, iTitle, iType, iDate].some((i) => i < 0)) {
    throw new Error('This doesn’t look like a Streaks export. In Streaks, open Settings → Export Data and choose CSV.');
  }

  const byTask = new Map();
  let entries = 0;
  let maxDate = '';
  for (const r of rows.slice(1)) {
    const code = CODES[(r[iType] || '').trim()];
    const raw = (r[iDate] || '').trim();
    if (!code || !/^\d{8}$/.test(raw)) continue;
    const date = toISO(raw);
    const id = r[iTask];
    let t = byTask.get(id);
    if (!t) {
      t = { taskId: id, name: '', icon: '', nameAt: '', days: new Map(), counts: { d: 0, p: 0, s: 0, m: 0, auto: 0 } };
      byTask.set(id, t);
    }
    const stamp = (iStamp >= 0 && r[iStamp]) || date;
    if (stamp >= t.nameAt) {
      // Use the most recent name, in case the habit was renamed.
      t.name = (r[iTitle] || '').trim() || 'Habit';
      t.icon = iIcon >= 0 ? r[iIcon] : '';
      t.nameAt = stamp;
    }
    const prev = t.days.get(date);
    if (!prev || RANK[code] > RANK[prev]) t.days.set(date, code);
    if (r[iType] === 'completed_auto') t.counts.auto++;
    entries++;
    if (date > maxDate) maxDate = date;
  }
  if (!byTask.size) throw new Error('No habit entries found in this file.');

  const recentFrom = addDays(maxDate, -13);
  const habits = [...byTask.values()].map((t) => {
    const dates = [...t.days.keys()].sort();
    for (const c of t.days.values()) t.counts[c]++;
    const recentActive = dates.some((d) => d >= recentFrom && t.days.get(d) !== 's');
    return {
      taskId: t.taskId,
      name: t.name,
      icon: t.icon,
      // Mostly auto-completed habits are "avoid" habits in Streaks: done unless you mark a slip.
      mode: t.counts.auto > 0.3 * Math.max(1, t.counts.d) ? 'avoid' : 'build',
      paused: !recentActive,
      first: dates[0],
      last: dates[dates.length - 1],
      days: t.days,
      counts: t.counts,
    };
  });
  habits.sort((a, b) => Number(a.paused) - Number(b.paused) || a.first.localeCompare(b.first));
  const from = habits.reduce((m, h) => (h.first < m ? h.first : m), maxDate);
  return { habits, from, to: maxDate, entries };
}

/** Builds records for putMany. Keeps your own name, order and pause state on re-import. */
export function streaksToRecords(parsed, existingHabits) {
  const byId = new Map(existingHabits.map((h) => [h.id, h]));
  let order = existingHabits.reduce((m, h) => Math.max(m, h.order ?? 0), 0);
  const items = [];
  for (const h of parsed.habits) {
    const id = idFor(`streaks:${h.taskId}`);
    const prev = byId.get(id);
    items.push([
      'habit',
      prev
        ? { ...prev, startDate: h.first < (prev.startDate || h.first) ? h.first : prev.startDate || h.first }
        : {
            id,
            name: h.name,
            mode: h.mode,
            order: ++order,
            startDate: h.first,
            source: 'streaks',
            paused: h.paused,
            pauses: h.paused ? [[addDays(parsed.to, 1), null]] : [],
          },
    ]);

    const months = new Map();
    for (const [date, code] of h.days) {
      const month = date.slice(0, 7);
      if (!months.has(month)) {
        const [y, m] = month.split('-').map(Number);
        months.set(month, Array(new Date(y, m, 0).getDate()).fill('.'));
      }
      months.get(month)[+date.slice(8, 10) - 1] = code;
    }
    for (const [month, arr] of months) {
      items.push(['habitmonth', { id: monthId(id, month), habitId: id, month, s: arr.join('') }]);
    }
  }
  return items;
}
