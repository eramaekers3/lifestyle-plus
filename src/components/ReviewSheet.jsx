import { useMemo, useState } from 'react';
import { remove, useKind, useRecord, useSettings } from '../store.js';
import { addDays, fmt, fmtDur, todayISO } from '../lib/dates.js';
import { useStack, useHabits, pullTask } from '../lib/model.js';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool } from '../lib/canvas.js';
import { reviewWeek, saveWeek, weekId, weekDays, inRange, shortDay } from '../lib/review.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet, Step } from './ui.jsx';
import SchoolList from './SchoolList.jsx';

/** The weekly review: look back at last week, clear the backlog, decide what next week is for. */
export default function ReviewSheet({ onClose }) {
  const ws = reviewWeek();
  const prev = addDays(ws, -7);
  const thisWeek = ws <= todayISO();
  const plan = useRecord(weekId(ws));

  const finish = () => {
    saveWeek(ws, { reviewedAt: new Date().toISOString() });
    toast('Week planned. Go make it count.');
    onClose();
  };

  return (
    <Sheet title="Weekly review" onClose={onClose}>
      <div className="morning review">
        <div className="mo-date">
          <div>
            <div className="eyebrow">{thisWeek ? 'This week' : 'Next week'}</div>
            <div className="mo-day">
              {fmt(ws, { month: 'short', day: 'numeric' })} – {fmt(addDays(ws, 6), { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <Icon name="review" size={30} />
        </div>

        <Step n={1} title={thisWeek ? 'How last week went' : 'How this week went'}>
          <LookBack ws={prev} />
        </Step>

        <Step n={2} title="Clear out the backlog">
          <Backlog />
        </Step>

        <Step n={3} title="What’s fixed">
          <Fixed ws={ws} />
        </Step>

        <Step n={4} title="Three priorities">
          <Priorities key={ws + (plan ? 'p' : '')} ws={ws} plan={plan} />
        </Step>

        <button className="btn wide mo-go" onClick={finish}>
          <Icon name="check" size={20} /> Week planned
        </button>
        <button className="link-btn mo-later" onClick={onClose}>Finish later</button>
      </div>
    </Sheet>
  );
}

function LookBack({ ws }) {
  const we = addDays(ws, 6);
  const days = weekDays(ws);
  const blocks = useKind('block');
  const tasks = useKind('task');
  const workouts = useKind('workout');
  const plan = useRecord(weekId(ws));
  const { habits, isDone } = useHabits();
  const today = todayISO();

  const stats = useMemo(() => {
    const wk = blocks.filter((b) => b.date >= ws && b.date <= we);
    const deep = wk.filter((b) => b.type === 'deep').reduce((a, b) => a + b.end - b.start, 0);
    const total = wk.reduce((a, b) => a + b.end - b.start, 0);
    const done = tasks.filter((t) => t.status === 'done' && inRange(t.doneAt, ws, we)).length;
    const lifts = workouts.filter((w) => w.date >= ws && w.date <= we).length;
    return { deep, total, done, lifts };
  }, [blocks, tasks, workouts, ws, we]);

  const big = ((plan && plan.big) || []).map((b, i) => ({ text: b, i })).filter((b) => b.text && b.text.trim());
  const hit = (plan && plan.hit) || [];
  const counted = days.filter((d) => d <= today);

  return (
    <>
      <div className="rv-stats">
        <div><b>{fmtDur(stats.deep)}</b><span>deep work</span></div>
        <div><b>{fmtDur(stats.total)}</b><span>blocked</span></div>
        <div><b>{stats.done}</b><span>task{stats.done === 1 ? '' : 's'} done</span></div>
        <div><b>{stats.lifts}</b><span>workout{stats.lifts === 1 ? '' : 's'}</span></div>
      </div>

      {big.length > 0 && (
        <>
          <p className="school-sub">Did you hit your priorities?</p>
          <ul className="rows rv-big">
            {big.map(({ text, i }) => (
              <li key={i} className="row">
                <button
                  className={`check${hit[i] ? ' on' : ''}`}
                  aria-pressed={!!hit[i]}
                  aria-label={`Hit: ${text}`}
                  onClick={() => {
                    const next = [0, 1, 2].map((j) => (j === i ? !hit[j] : !!hit[j]));
                    saveWeek(ws, { hit: next });
                  }}
                >
                  {hit[i] && <Icon name="check" size={16} />}
                </button>
                <span className="row-title">{text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {habits.length > 0 && counted.length > 0 && (
        <>
          <p className="school-sub">Habits</p>
          <ul className="rv-habits">
            {habits.map((h) => {
              const n = counted.filter((d) => isDone(h, d)).length;
              return (
                <li key={h.id}>
                  <span className="rv-h-name">{h.name}</span>
                  <span className="rv-dots" aria-label={`${n} of ${counted.length} days`}>
                    {days.map((d) => (
                      <i key={d} className={d > today ? 'future' : isDone(h, d) ? 'on' : ''} title={shortDay(d)} />
                    ))}
                  </span>
                  <span className="rv-n">{n}/{counted.length}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Backlog() {
  const { backlog, active } = useStack();
  const { stackLimit } = useSettings();
  const room = active.length < stackLimit;
  const [all, setAll] = useState(false);
  if (!backlog.length) return <p className="mo-done"><Icon name="check" size={16} /> The backlog is empty.</p>;
  // Oldest first: those are the ones most likely to be stale.
  const sorted = [...backlog].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const shown = all ? sorted : sorted.slice(0, 8);
  const age = (t) => (t.createdAt ? Math.floor((Date.now() - Date.parse(t.createdAt)) / 864e5) : null);
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Oldest first. Delete what you’re never going to do; pull what matters this week.</p>
      <ul className="rows sd-loops">
        {shown.map((t) => {
          const d = age(t);
          return (
            <li key={t.id} className="row">
              <span className="row-title">
                {t.title}
                {d !== null && d >= 7 && <span className="muted small"> · {d} days old</span>}
              </span>
              <button className="mini" disabled={!room} onClick={() => pullTask(t)}>Pull</button>
              <button className="x" onClick={() => (remove(t.id), toast('Deleted'))} aria-label={`Delete “${t.title}”`}>×</button>
            </li>
          );
        })}
      </ul>
      {!all && sorted.length > shown.length && (
        <button className="mini" onClick={() => setAll(true)}>Show all {sorted.length}</button>
      )}
    </>
  );
}

function Fixed({ ws }) {
  const we = addDays(ws, 6);
  const cal = useCalendarDays();
  const school = useSchool();
  const days = weekDays(ws);
  const events = days.map((d) => ({ d, list: (cal[d] && cal[d].timed) || [] })).filter((x) => x.list.length);
  const tests = school.filter((i) => i.kind === 'test' && i.date >= ws && i.date <= we);
  const hw = school.filter((i) => i.kind === 'homework' && !i.done && i.date >= ws && i.date <= we);
  if (!events.length && !tests.length && !hw.length) {
    return <p className="muted small">Nothing on the calendar or due from Canvas yet.</p>;
  }
  return (
    <>
      {events.length > 0 && (
        <div className="rv-cal">
          {events.map(({ d, list }) => (
            <span key={d}><b>{shortDay(d)}</b> {list.length} event{list.length === 1 ? '' : 's'}</span>
          ))}
        </div>
      )}
      {tests.length > 0 && (
        <>
          <p className="school-sub">Tests</p>
          <SchoolList items={tests} />
        </>
      )}
      {hw.length > 0 && (
        <>
          <p className="school-sub">Homework due · {hw.length}</p>
          <SchoolList items={hw} />
        </>
      )}
      <p className="muted small">Put study time for tests on the calendar before the week fills up.</p>
    </>
  );
}

function Priorities({ ws, plan }) {
  const [big, setBig] = useState(() => (plan && plan.big) || ['', '', '']);
  const save = () => saveWeek(ws, { big });
  return (
    <div className="big3">
      {[0, 1, 2].map((i) => (
        <label key={i} htmlFor={`rv-big-${i}`}>
          <span className="n">{i + 1}</span>
          <input
            id={`rv-big-${i}`}
            className="input"
            value={big[i] || ''}
            placeholder={['Most important thing this week', 'Second priority', 'Third priority'][i]}
            onChange={(e) => setBig((b) => [0, 1, 2].map((j) => (j === i ? e.target.value : b[j] || '')))}
            onBlur={save}
            autoComplete="off"
          />
        </label>
      ))}
    </div>
  );
}
