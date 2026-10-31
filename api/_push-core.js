// Decides which notifications are due right now for one person. No database or network here,
// so it can be tested on its own; api/push-tick.js gathers the data and does the sending.
import { localParts } from '../src/lib/school.js';
import { plural } from '../src/lib/text.js';

export const DEFAULT_NOTIFY = { blocks: true, lead: 5, morning: true, morningAt: 8 * 60, school: true, schoolAt: 20 * 60, shutdown: true, shutdownAt: 21 * 60 };
// The tick runs every minute; a few minutes of grace covers a late or skipped run.
// Each notification has a key, and push_log makes sure a key is only ever sent once.
const GRACE = 4;

const pad = (n) => String(n).padStart(2, '0');
export const minLabel = (m) => {
  let h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return mm ? `${h}:${pad(mm)}${ap}` : `${h}${ap}`;
};
export const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDue = (nowMin, target) => nowMin - target >= 0 && nowMin - target < GRACE;
const listOf = (items) => {
  const names = items.slice(0, 3).map((i) => i.title + (i.course ? ` (${i.course.split(/\s+/).slice(0, 2).join(' ')})` : ''));
  return names.join(', ') + (items.length > 3 ? ` +${items.length - 3} more` : '');
};

/** When the morning and evening school notifications need the Canvas feed, so it's only fetched then. */
export function needsSchool(now, tz, settings) {
  const n = { ...DEFAULT_NOTIFY, ...((settings && settings.notify) || {}) };
  if (!settings || !settings.canvas || !settings.canvas.url) return false;
  const { min } = localParts(now, tz);
  return (n.morning && isDue(min, n.morningAt)) || (n.school && isDue(min, n.schoolAt));
}

/**
 * Returns [{ key, title, body, url }] for notifications due at `now`.
 *   settings:  the settings record (notify prefs, canvas link)
 *   blocks:    today's time blocks [{ id, title, start, end, taskId }]
 *   tasksById: titles for blocks linked to a task
 *   started:   whether today's morning page was finished
 *   school:    Canvas items (from toItem, with done flags), or null when not loaded
 *   shutDown:  whether today's shutdown was finished
 *   reviewed:  on Sundays, whether next week's review is done
 */
export function dueNotifications({ now, tz, settings = {}, blocks = [], tasksById = {}, started = false, school = null, shutDown = false, reviewed = true }) {
  const n = { ...DEFAULT_NOTIFY, ...(settings.notify || {}) };
  const { date, min } = localParts(now, tz);
  const out = [];

  // 1. A heads-up before each time block.
  if (n.blocks) {
    for (const b of blocks) {
      const target = b.start - (n.lead || 0);
      if (!isDue(min, target)) continue;
      const task = b.taskId && tasksById[b.taskId];
      const title = b.title || (task && task.title) || 'Time block';
      const when = n.lead ? `in ${n.lead} min` : 'now';
      out.push({
        key: `b:${date}:${b.id}:${b.start}`,
        title: n.lead ? `Up next: ${title}` : `Now: ${title}`,
        body: `${minLabel(b.start)}–${minLabel(b.end)} · starts ${when}${task && task.title !== title ? ` · ${task.title}` : ''}`,
        url: '/#plan',
      });
    }
  }

  const pending = (school || []).filter((i) => !i.done);
  const dueToday = pending.filter((i) => i.date === date);

  // 2. Morning: start the day (and what's due today).
  if (n.morning && isDue(min, n.morningAt)) {
    const planned = blocks.length;
    const dueBit = dueToday.length ? `${plural(dueToday.length, 'thing')} due today: ${listOf(dueToday)}` : '';
    if (!started) {
      const planBit = planned ? `${plural(planned, 'block')} planned` : 'No blocks yet';
      out.push({
        key: `m:${date}`,
        title: 'Start your day',
        body: [planBit, dueBit].filter(Boolean).join(' · ') + '. Tap to weigh in and block it out.',
        url: '/#morning',
      });
    } else if (dueBit) {
      out.push({ key: `m:${date}`, title: 'Due today', body: dueBit, url: '/#plan' });
    }
  }

  // 3. Evening: what's due tomorrow, and tests in the next two days.
  if (n.school && school && isDue(min, n.schoolAt)) {
    const tomorrow = addDays(date, 1);
    const dueTomorrow = pending.filter((i) => i.date === tomorrow && i.kind === 'homework');
    const tests = pending.filter((i) => i.kind === 'test' && i.date > date && i.date <= addDays(date, 2));
    if (dueTomorrow.length || tests.length) {
      const bits = [];
      if (tests.length) bits.push(`${tests.length === 1 ? 'Test' : 'Tests'}: ${listOf(tests)}`);
      if (dueTomorrow.length) bits.push(`Due tomorrow: ${listOf(dueTomorrow)}`);
      out.push({
        key: `s:${date}`,
        title: tests.length ? 'Test coming up' : `${plural(dueTomorrow.length, 'thing')} due tomorrow`,
        body: bits.join(' · '),
        url: '/#plan',
      });
    }
  }

  // 4. Night: shut down the day. On Sundays, the weekly review comes first if it isn't done.
  if (n.shutdown && isDue(min, n.shutdownAt)) {
    const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
    if (sunday && !reviewed) {
      out.push({ key: `r:${date}`, title: 'Weekly review', body: 'Ten minutes: look back at the week, clear the backlog, set three priorities.', url: '/#review' });
    } else if (!shutDown) {
      out.push({ key: `sd:${date}`, title: 'Shut down the day', body: 'Close your open loops and block out tomorrow. Then you’re done.', url: '/#shutdown' });
    }
  }

  return out;
}
