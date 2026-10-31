// Turning Canvas calendar-feed events into homework and tests.
// Plain JavaScript (only the date helpers), so the notification server (api/push-tick.js) can use it too.

import { iso } from './dates.js';

const TEST_RE = /\b(exams?|midterms?|finals?|tests?|quiz(zes)?)\b/i;
// Canvas puts the course at the end of each title: "Homework 6 [CSCE 310-001 Data Structures]".
const splitTitle = (t) => {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(t || '');
  return m ? { title: m[1] || t, course: m[2] } : { title: t || 'Untitled', course: '' };
};

/** Local date and minutes after midnight for an instant, in this device's zone or a named one. */
export function localParts(d, tz) {
  if (!tz) return { date: iso(d), min: d.getHours() * 60 + d.getMinutes() };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}

/** Turns a raw feed event into a school item, or null for events that aren't homework or tests. */
export function toItem(ev, tz) {
  const { title, course } = splitTitle(ev.title);
  const isAssignment = String(ev.uid || '').startsWith('event-assignment');
  const isTest = TEST_RE.test(title);
  if (!isAssignment && !isTest) return null; // office hours, lectures and other course events
  let date;
  let time = null;
  if (ev.allDay) date = ev.start;
  else {
    const p = localParts(new Date(ev.start), tz);
    date = p.date;
    time = p.min;
  }
  return {
    id: ev.uid || ev.id,
    title,
    course,
    kind: isTest ? 'test' : 'homework',
    date,
    time,
    link: ev.link || null,
  };
}

