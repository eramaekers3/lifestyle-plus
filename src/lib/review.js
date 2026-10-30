// The end of the day (shutdown) and the end of the week (weekly review).
// A day's record (kind 'day', one per date) holds startedAt and shutdownAt.
// A week's plan (kind 'week', one per Monday) holds big, notes and reviewedAt.
import { put, get, useRecord } from '../store.js';
import { idFor } from './ids.js';
import { addDays, iso, parse, todayISO, weekStart } from './dates.js';

export const dayId = (date) => idFor(`day:${date}`);
export const weekId = (ws) => idFor(`week:${ws}`);

export function useShutDown(date = todayISO()) {
  const rec = useRecord(dayId(date));
  return !!(rec && rec.shutdownAt);
}

export function shutDown(date = todayISO()) {
  const id = dayId(date);
  put('day', { ...(get(id) || {}), id, date, shutdownAt: new Date().toISOString() });
}

/** The week a review plans: from Friday evening on it's next week, otherwise this week. */
export function reviewWeek(now = new Date()) {
  const today = iso(now);
  const dow = now.getDay(); // 0 Sun … 6 Sat
  const weekend = dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 17);
  return weekend ? weekStart(addDays(today, 7 - ((dow + 6) % 7))) : weekStart(today);
}

export function useReviewed(ws) {
  const rec = useRecord(weekId(ws));
  return !!(rec && rec.reviewedAt);
}

/** Show the review nudge from Friday evening through Monday, until the week is reviewed. */
export function reviewDue(now = new Date()) {
  const dow = now.getDay();
  return dow === 0 || dow === 6 || dow === 1 || (dow === 5 && now.getHours() >= 17);
}

export function saveWeek(ws, changes) {
  const id = weekId(ws);
  put('week', { big: ['', '', ''], notes: '', ...(get(id) || {}), ...changes, id, week: ws });
}

export const weekDays = (ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
export const inRange = (isoTime, from, to) => {
  if (!isoTime) return false;
  const d = iso(new Date(isoTime));
  return d >= from && d <= to;
};
export const shortDay = (d) => parse(d).toLocaleDateString(undefined, { weekday: 'short' });
