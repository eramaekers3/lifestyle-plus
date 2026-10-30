import { useMemo, useState } from 'react';
import { get, put, putMany, useKind, useRecord, useSettings } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, fmtDur, minToLabel, todayISO } from '../lib/dates.js';
import { useStack, pullTask } from '../lib/model.js';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool, itemsOn, overdue } from '../lib/canvas.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet, FlipClock } from './ui.jsx';
import SchoolList from './SchoolList.jsx';

/* ---------- Started-the-day state ---------- */

export const dayId = (date) => idFor(`day:${date}`);

export function useDayStarted(date = todayISO()) {
  const rec = useRecord(dayId(date));
  return !!(rec && rec.startedAt);
}

export function startDay(date = todayISO()) {
  const id = dayId(date);
  put('day', { ...(get(id) || {}), id, date, startedAt: new Date().toISOString() });
}

/** True when the morning page should open by itself: a morning, the day not started yet. */
export function wantsMorning(settings, started, hour = new Date().getHours()) {
  if (settings.morningPage === false || settings.sample) return false;
  return !started && hour >= 4 && hour < 12;
}

const greeting = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

/* ---------- The page ---------- */

export default function MorningSheet({ onClose }) {
  const today = todayISO();
  const hour = new Date().getHours();
  const settings = useSettings();

  const finish = () => {
    startDay(today);
    toast('Day started. Go get it.');
    onClose();
    if (window.location.hash !== '#plan') window.location.hash = 'plan';
  };

  return (
    <Sheet title={greeting(hour)} onClose={onClose}>
      <div className="morning">
        <div className="mo-date">
          <div>
            <div className="eyebrow">{fmt(today, { weekday: 'long' })}</div>
            <div className="mo-day">{fmt(today, { month: 'long', day: 'numeric' })}</div>
          </div>
          <FlipClock />
        </div>

        <Step n={1} title="Weigh in">
          <WeighIn today={today} />
        </Step>

        <Step n={2} title="What’s fixed today">
          <Fixed today={today} />
        </Step>

        <Step n={3} title="Block the day">
          <Blocks today={today} dayStart={settings.dayStart} />
        </Step>

        <Step n={4} title="Pick what’s Now">
          <PickNow />
        </Step>

        <button className="btn wide mo-go" onClick={finish}>
          <Icon name="sun" size={20} /> Start my day
        </button>
        <button className="link-btn mo-later" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}

function Step({ n, title, children }) {
  return (
    <section className="mo-step">
      <h3><span className="n">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function WeighIn({ today }) {
  const weights = useKind('weight');
  const todays = weights.find((w) => w.date === today);
  const last = useMemo(
    () => [...weights].filter((w) => w.date < today).sort((a, b) => a.date.localeCompare(b.date)).at(-1),
    [weights, today]
  );
  const [lbs, setLbs] = useState('');
  const save = (e) => {
    e.preventDefault();
    const v = parseFloat(lbs);
    if (!(v > 50 && v < 600)) return;
    put('weight', { id: idFor(`w:${today}`), date: today, lbs: v });
    setLbs('');
  };
  if (todays) {
    const d = last ? todays.lbs - last.lbs : null;
    return (
      <p className="mo-done">
        <Icon name="check" size={16} /> {todays.lbs.toFixed(1)} lb
        {d !== null && Math.abs(d) >= 0.05 && <span className="muted"> · {d > 0 ? '+' : ''}{d.toFixed(1)} since {fmt(last.date, { weekday: 'short' })}</span>}
      </p>
    );
  }
  return (
    <form className="inline" onSubmit={save}>
      <input
        id="mo-lbs"
        className="input"
        type="number"
        inputMode="decimal"
        step="0.1"
        min="50"
        max="600"
        value={lbs}
        onChange={(e) => setLbs(e.target.value)}
        placeholder={last ? `Last: ${last.lbs.toFixed(1)} lb` : 'Today’s weight (lb)'}
        aria-label="Today’s weight in pounds"
      />
      <button className="btn" disabled={!lbs}>Log</button>
    </form>
  );
}

function Fixed({ today }) {
  const cal = useCalendarDays()[today] || { timed: [], allDay: [] };
  const school = useSchool();
  const { canvas } = useSettings();
  const due = [...overdue(school, today), ...itemsOn(school, today)];
  const tests = school.filter((i) => i.kind === 'test' && i.date > today && i.date <= addDays(today, 3));
  const events = [...cal.timed].sort((a, b) => a.start - b.start);

  if (!events.length && !cal.allDay.length && !due.length && !tests.length) {
    return <p className="muted small">Nothing on the calendar{canvas && canvas.url ? ' and nothing due' : ''}. The whole day is yours to block.</p>;
  }
  return (
    <>
      {(cal.allDay.length > 0 || events.length > 0) && (
        <ul className="mo-events">
          {cal.allDay.map((e) => (
            <li key={e.id} style={{ '--c': e.color }}><i aria-hidden="true" /><span className="t">All day</span>{e.title}</li>
          ))}
          {events.map((e) => (
            <li key={e.id} style={{ '--c': e.color }}><i aria-hidden="true" /><span className="t">{minToLabel(e.start)}</span>{e.title}</li>
          ))}
        </ul>
      )}
      {due.length > 0 && (
        <>
          <p className="school-sub">Due today</p>
          <SchoolList items={due} showDay={false} />
        </>
      )}
      {tests.length > 0 && (
        <>
          <p className="school-sub">Tests coming up</p>
          <SchoolList items={tests} />
        </>
      )}
    </>
  );
}

function Blocks({ today, dayStart }) {
  const all = useKind('block');
  const blocks = useMemo(() => all.filter((b) => b.date === today).sort((a, b) => a.start - b.start), [all, today]);
  const yday = addDays(today, -1);
  const prev = useMemo(() => all.filter((b) => b.date === yday), [all, yday]);
  const total = blocks.reduce((a, b) => a + b.end - b.start, 0);

  const copyPrev = () => {
    putMany(prev.map((b) => ['block', { ...b, id: undefined, sample: undefined, date: today }]));
    toast(`Copied ${prev.length} blocks`);
  };

  if (!blocks.length) {
    return (
      <>
        <p className="muted small">No blocks yet. Give every hour from {minToLabel(dayStart * 60)} on a job; you’ll land on the timeline after you start.</p>
        {prev.length > 0 && <button className="mini" onClick={copyPrev}>Copy yesterday’s {prev.length} blocks</button>}
      </>
    );
  }
  return (
    <>
      <ul className="mo-blocks">
        {blocks.map((b) => (
          <li key={b.id} className={`t-${b.type}`}><i aria-hidden="true" /><span className="t">{minToLabel(b.start)}</span>{b.title || 'Untitled block'}</li>
        ))}
      </ul>
      <p className="muted small">{fmtDur(total)} planned. Adjust on the timeline anytime.</p>
    </>
  );
}

function PickNow() {
  const { stackLimit } = useSettings();
  const { active, backlog } = useStack();
  const free = stackLimit - active.length;
  return (
    <>
      {active.length > 0 ? (
        <ul className="mo-now">
          {active.map((t) => <li key={t.id}><Icon name="check" size={14} />{t.title}</li>)}
        </ul>
      ) : (
        <p className="muted small">Nothing in Now yet.</p>
      )}
      {free > 0 && backlog.length > 0 && (
        <>
          <p className="school-sub">Pull from the backlog · {free} slot{free === 1 ? '' : 's'} open</p>
          <div className="chips">
            {backlog.slice(0, 6).map((t) => (
              <button key={t.id} className="chip mo-pull" onClick={() => pullTask(t)}>
                <Icon name="up" size={14} /> {t.title}
              </button>
            ))}
          </div>
        </>
      )}
      {free <= 0 && <p className="muted small">Stack is full. Nice.</p>}
    </>
  );
}
