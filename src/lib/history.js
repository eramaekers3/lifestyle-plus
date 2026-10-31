// Undo history: earlier versions of your records, kept on the server for 90 days
// (supabase/history.sql), plus deleted records and a backup file from this device.
import { supabase } from '../supabase.js';
import { put, allRecords, SETTINGS_ID } from '../store.js';
import { todayISO } from './dates.js';

const SETUP = 'History isn’t turned on yet. Run supabase/history.sql in the Supabase SQL Editor.';

async function rows(query) {
  if (!supabase) throw new Error('Sign in to see history.');
  const { data, error } = await query;
  if (error) throw new Error(/record_history|does not exist|schema cache/i.test(error.message) ? SETUP : error.message);
  return data || [];
}
const COLS = 'hid, record_id, kind, data, deleted, updated_at, replaced_at';

/** Earlier versions of your settings (calendars, Canvas link, colors…), newest first. */
export const settingsVersions = () =>
  rows(supabase.from('record_history').select(COLS).eq('record_id', SETTINGS_ID).order('replaced_at', { ascending: false }).limit(30));

/** The latest changes to everything else, newest first. */
export const recentChanges = () =>
  rows(supabase.from('record_history').select(COLS).neq('kind', 'settings').order('replaced_at', { ascending: false }).limit(80));

/** Puts a version back. It syncs to your other devices like any other edit. */
export const restoreVersion = (v) => put(v.kind, { ...v.data, id: v.record_id || v.id });

const KIND_NAMES = {
  task: 'Task', block: 'Time block', habit: 'Habit', habitlog: 'Habit check', listitem: 'List item', list: 'List',
  category: 'Category', recur: 'Repeating task', workout: 'Workout', routine: 'Routine', weight: 'Weigh-in', week: 'Week plan',
};
export const kindName = (k) => KIND_NAMES[k] || k.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const labelOf = (d = {}) => d.title || d.name || d.text || (d.date ? d.date : '') || 'Untitled';

/** "3 calendars · Canvas linked · coral heart" — what was in a settings version. */
export function settingsSummary(d = {}) {
  const parts = [];
  const n = (d.calendars || []).length;
  parts.push(n ? `${n} calendar${n === 1 ? '' : 's'}` : 'no calendars');
  if (d.canvas) parts.push('Canvas linked');
  if (d.stackLimit) parts.push(`Now limit ${d.stackLimit}`);
  return parts.join(' · ');
}

/** Saves a backup file with everything on this device (sharing it on iPhone, downloading elsewhere). */
export async function exportBackup() {
  const body = JSON.stringify({ app: 'lifestyle+', exportedAt: new Date().toISOString(), records: allRecords().filter((r) => r.kind !== 'secret') }, null, 1);
  const name = `lifestyle-plus-backup-${todayISO()}.json`;
  const file = new File([body], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'lifestyle+ backup' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
