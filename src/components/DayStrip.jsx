import { useMemo } from 'react';
import { fmtDur, minToLabel, nowMin } from '../lib/dates.js';
import { useNow } from './ui.jsx';

/**
 * Today at a glance, watch-style: one line from the start of the day to the end, with time blocks on top,
 * calendar events under them, timed tasks as dots, and a "now" marker that moves through the day.
 * Above it: what you're on now and what's next.
 */
export default function DayStrip({ blocks, events = [], tasks = [], dayStart, dayEnd }) {
  useNow(30000);
  const now = nowMin();
  const start = dayStart * 60;
  const end = Math.max(start + 60, dayEnd * 60);
  const span = end - start;
  const pct = (m) => `${((Math.min(end, Math.max(start, m)) - start) / span) * 100}%`;
  const width = (a, b) => `${((Math.min(end, b) - Math.max(start, a)) / span) * 100}%`;
  const inDay = (x) => x.end > start && x.start < end;

  const timedTasks = useMemo(() => tasks.filter((t) => t.dueTime != null && t.status !== 'done'), [tasks]);

  const status = useMemo(() => {
    const items = [
      ...blocks.map((b) => ({ start: b.start, end: b.end, title: b.title || 'Block' })),
      ...events.map((e) => ({ start: e.start, end: e.end, title: e.title, cal: true })),
    ].sort((a, b) => a.start - b.start);
    const cur = items.filter((x) => x.start <= now && now < x.end).sort((a, b) => a.end - b.end)[0] || null;
    const nextItem = items.find((x) => x.start > now) || null;
    const nextTask = timedTasks.filter((t) => t.dueTime > now).sort((a, b) => a.dueTime - b.dueTime)[0];
    const next =
      nextTask && (!nextItem || nextTask.dueTime < nextItem.start)
        ? { start: nextTask.dueTime, title: nextTask.title, task: true }
        : nextItem;
    return { cur, next };
  }, [blocks, events, timedTasks, now]);

  const hours = [];
  for (let h = Math.ceil(start / 60); h <= end / 60; h++) hours.push(h);
  const labelEvery = span > 12 * 60 ? 3 : 2;
  const live = now >= start && now <= end;
  const { cur, next } = status;
  const left = (m) => fmtDur(Math.max(1, m - now));

  return (
    <section className="card dstrip" aria-label="Today at a glance">
      <div className="ds-status">
        <div className="ds-now">
          <span className="ds-k">Right now{cur ? ` · ${left(cur.end)} left` : ''}</span>
          {cur ? (
            <span className="ds-v"><b>{cur.title}</b></span>
          ) : (
            <span className="ds-v muted">{now < start ? 'Day hasn’t started' : now >= end ? 'Day’s done' : next ? `Free for ${left(next.start)}` : 'Free for the rest of the day'}</span>
          )}
        </div>
        {next && (
          <div className="ds-next">
            <span className="ds-k">Next · {minToLabel(next.start)}</span>
            <span className="ds-v"><b>{next.title}</b></span>
          </div>
        )}
      </div>

      <div className="ds-bar" role="img" aria-label={`Timeline from ${minToLabel(start)} to ${minToLabel(end)}${live ? `, now ${minToLabel(now)}` : ''}`}>
        <div className="ds-lane ds-blocks">
          {blocks.filter(inDay).map((b) => (
            <i key={b.id} className={`t-${b.type}${b.end <= now ? ' past' : ''}${b.start <= now && now < b.end ? ' cur' : ''}`} style={{ left: pct(b.start), width: width(b.start, b.end) }} />
          ))}
        </div>
        <div className="ds-lane ds-events">
          {events.filter(inDay).map((e) => (
            <i key={e.id} className={`t-cal${e.end <= now ? ' past' : ''}`} style={{ left: pct(e.start), width: width(e.start, e.end), '--c': e.color }} />
          ))}
        </div>
        {timedTasks
          .filter((t) => t.dueTime >= start && t.dueTime <= end)
          .map((t) => (
            <span key={t.id} className={`ds-task${t.dueTime < now ? ' late' : ''}`} style={{ left: pct(t.dueTime) }} title={`${t.title} · ${minToLabel(t.dueTime)}`} />
          ))}
        {live && (
          <>
            <div className="ds-past" style={{ width: pct(now) }} />
            <div className="ds-nowmark" style={{ left: pct(now) }} />
          </>
        )}
      </div>
      <div className="ds-hours" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} className={h % labelEvery ? 'tick' : ''} style={{ left: pct(h * 60) }}>
            {h % labelEvery ? '' : minToLabel(h * 60).replace(/(am|pm)$/, (x) => x[0])}
          </span>
        ))}
      </div>
    </section>
  );
}
