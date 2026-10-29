// Reads an Apple (iCloud) public calendar link, or a Canvas calendar feed, and returns its events as JSON.
// Shared by the Vercel function (api/calendar.js) and the local dev server (vite.config.js).
import ICAL from 'ical.js';

const MAX_BYTES = 5 * 1024 * 1024;
const isICloud = (host) => host === 'icloud.com' || host.endsWith('.icloud.com');
// Canvas feeds look like https://canvas.unl.edu/feeds/calendars/user_….ics (or a school's *.instructure.com).
const isCanvas = (url) =>
  /^\/feeds\/calendars\/[\w.-]+\.ics$/i.test(url.pathname) &&
  (url.hostname.endsWith('.instructure.com') || url.hostname.endsWith('.edu'));

const SOURCES = {
  apple: { ok: (u) => isICloud(u.hostname), name: 'Apple Calendar', wrong: 'Only Apple Calendar (iCloud) links are supported.' },
  canvas: { ok: isCanvas, name: 'Canvas', wrong: 'That isn’t a Canvas calendar feed link. It should end in .ics and contain /feeds/calendars/.' },
};

export class CalendarError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Only https links from the allowed source are fetched, including any redirects. */
async function fetchICS(rawUrl, source = 'apple') {
  const src = SOURCES[source] || SOURCES.apple;
  let url;
  try {
    url = new URL(String(rawUrl || '').trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new CalendarError('That doesn’t look like a calendar link.');
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== 'https:' || !src.ok(url)) {
      throw new CalendarError(src.wrong);
    }
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'lifestyle-plus calendar' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (res.status === 404 || res.status === 401) {
      throw new CalendarError(source === 'canvas' ? 'Canvas says this feed link doesn’t work. Copy a fresh one from the Canvas Calendar page.' : 'Apple says this calendar link doesn’t exist. Check that Public Calendar is still on.', 404);
    }
    if (!res.ok) throw new CalendarError(`${src.name} didn’t respond (error ${res.status}). Try again in a minute.`, 502);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new CalendarError('This calendar is too large to load.', 413);
    if (!text.includes('BEGIN:VCALENDAR')) throw new CalendarError('That link didn’t return a calendar.');
    return text;
  }
  throw new CalendarError(`Too many redirects from ${src.name}.`, 502);
}

const out = (t, allDay) => (allDay ? t.toString().slice(0, 10) : t.toJSDate().toISOString());

/** Returns { name, events: [{ id, title, start, end, allDay }] } for events overlapping [from, to]. */
export async function readCalendar({ url, from, to, source }) {
  return parseCalendar(await fetchICS(url, source), from, to);
}

export function parseCalendar(text, from, to) {
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new CalendarError('Couldn’t read this calendar file.');
  }

  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* fall back to UTC for unknown zones */
    }
  }

  const rangeStart = ICAL.Time.fromDateString(from);
  const rangeEnd = ICAL.Time.fromDateString(to);
  rangeEnd.adjust(1, 0, 0, 0);

  // Group edited single occurrences (RECURRENCE-ID) with their repeating event.
  const masters = new Map();
  const exceptions = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}:${ex.recurrenceId}`, ex);
  }

  const events = [];
  const push = (ev, start, end, item) => {
    const component = item ? item.component : ev.component;
    if ((component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    if (end.compare(rangeStart) <= 0 || start.compare(rangeEnd) >= 0) return;
    const allDay = start.isDate;
    const link = component.getFirstPropertyValue('url');
    events.push({
      id: `${ev.uid}|${start.toString()}`,
      uid: ev.uid,
      title: (item ? item.summary : ev.summary) || 'Busy',
      start: out(start, allDay),
      end: out(end, allDay),
      allDay,
      ...(typeof link === 'string' && /^https:\/\//.test(link) ? { link } : {}),
    });
  };

  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let next;
      let guard = 0;
      while ((next = it.next()) && guard++ < 3000) {
        if (next.compare(rangeEnd) >= 0) break;
        const d = ev.getOccurrenceDetails(next);
        push(ev, d.startDate, d.endDate, d.item);
      }
    } else {
      const end = ev.endDate || ev.startDate.clone();
      push(ev, ev.startDate, end, null);
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return { name: root.getFirstPropertyValue('x-wr-calname') || 'Apple Calendar', events };
}

/** Shared request handling for Node-style req/res. */
export async function handle(body, send) {
  const { url, from, to, source } = body || {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!url || !dateRe.test(from || '') || !dateRe.test(to || '')) {
    return send(400, { error: 'Send a calendar link plus a from and to date.' });
  }
  try {
    send(200, await readCalendar({ url, from, to, source: source === 'canvas' ? 'canvas' : 'apple' }));
  } catch (e) {
    send(e instanceof CalendarError ? e.status : 500, {
      error: e instanceof CalendarError ? e.message : 'Something went wrong reading the calendar.',
    });
  }
}
