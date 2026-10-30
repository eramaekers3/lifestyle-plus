import { useMemo, useState } from 'react';
import { putMany, useKind, useSettings } from '../store.js';
import { addDays, fmt, fmtDur, minToLabel, nowMin, todayISO } from '../lib/dates.js';
import { useStack, completeTask, sendBack, useHabits, toggleHabit } from '../lib/model.js';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool, itemsOn } from '../lib/canvas.js';
import { shutDown, useShutDown } from '../lib/review.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet } from './ui.jsx';
import SchoolList from './SchoolList.jsx';
import BlockSheet from './BlockSheet.jsx';
import { haptic } from '../lib/haptics.js';
import { completeTaskFx, toggleHabitFx } from '../lib/game.js';

/**
 * The nightly shutdown (Cal Newport's "shutdown complete"): close out today, glance at tomorrow,
 * block it out, then stop thinking about work for the night.
 */
export default function ShutdownSheet({ onClose }) {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const done = useShutDown(today);

  const finish = () => {
    shutDown(today);
    haptic('big');
    toast('Shutdown complete. You’re done for today.');
    onClose();
  };

  return (
    <Sheet title="Shutdown" onClose={onClose}>
      <div className="morning shutdown">
        <div className="mo-date">
          <div>
            <div className="eyebrow">{fmt(today, { weekday: 'long' })} night</div>
            <div className="mo-day">Close out the day</div>
          </div>
          <Icon name="moon" size={30} />
        </div>

        <Step n={1} title="How today went">
          <TodayBlocks today={today} />
        </Step>

        <Step n={2} title="Close your open loops">
          <OpenLoops />
        </Step>

        <Step n={3} title="Habits">
          <HabitCheck today={today} />
        </Step>

        <Step n={4} title={`What’s fixed ${fmt(tomorrow, { weekday: 'long' })}`}>
          <Tomorrow date={tomorrow} />
        </Step>

        <Step n={5} title="Block out tomorrow">
          <BlockTomorrow today={today} tomorrow={tomorrow} />
        </Step>

        <button className="btn wide mo-go sd-go" onClick={finish}>
          <Icon name="moon" size={20} /> {done ? 'Shutdown complete (again)' : 'Shutdown complete'}
        </button>
        <button className="link-btn mo-later" onClick={onClose}>Not yet</button>
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

function TodayBlocks({ today }) {
  const all = useKind('block');
  const tasks = useKind('task');
  const blocks = useMemo(() => all.filter((b) => b.date === today).sort((a, b) => a.start - b.start), [all, today]);
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  if (!blocks.length) return <p className="muted small">No blocks today. Tomorrow, try giving every hour a job.</p>;
  const total = blocks.reduce((a, b) => a + b.end - b.start, 0);
  const deep = blocks.filter((b) => b.type === 'deep').reduce((a, b) => a + b.end - b.start, 0);
  const now = nowMin();
  return (
    <>
      <ul className="mo-blocks">
        {blocks.map((b) => {
          const t = b.taskId && byId[b.taskId];
          return (
            <li key={b.id} className={`t-${b.type}${b.end > now ? ' later' : ''}`}>
              <i aria-hidden="true" />
              <span className="t">{minToLabel(b.start)}</span>
              <span className="sd-b">{b.title || 'Untitled block'}</span>
              {t && <span className={`sd-tag${t.status === 'done' ? ' ok' : ''}`}>{t.status === 'done' ? '✓ done' : 'open'}</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">{fmtDur(total)} planned · {fmtDur(deep)} deep work.</p>
    </>
  );
}

function OpenLoops() {
  const { active } = useStack();
  if (!active.length) return <p className="mo-done"><Icon name="check" size={16} /> Nothing left in Now. Clean slate.</p>;
  return (
    <>
      <p className="muted small" style={{ marginTop: 0 }}>Everything in Now: finish it, or decide it can wait. Nothing stays in your head overnight.</p>
      <ul className="rows sd-loops">
        {active.map((t) => (
          <li key={t.id} className="row">
            <span className="row-title">{t.title}</span>
            <button className="mini sun" onClick={(e) => completeTaskFx(t, e.currentTarget)}>Done</button>
            <button className="mini" onClick={() => (sendBack(t), toast('Back to the backlog'))}>Later</button>
          </li>
        ))}
      </ul>
      <p className="muted small">Anything you keep stays in Now for tomorrow.</p>
    </>
  );
}

function HabitCheck({ today }) {
  const { habits, isDone } = useHabits();
  if (!habits.length) return <p className="muted small">No habits yet.</p>;
  const left = habits.filter((h) => !isDone(h, today));
  return (
    <>
      {!left.length && <p className="mo-done"><Icon name="check" size={16} /> All {habits.length} done today.</p>}
      <div className="chips">
        {habits.map((h) => {
          const on = isDone(h, today);
          const avoid = h.mode === 'avoid';
          return (
            <button
              key={h.id}
              className={`chip habit-chip${on ? ' on' : ''}${avoid ? ' avoid' : ''}${avoid && !on ? ' slipped' : ''}`}
              aria-pressed={on}
              onClick={(e) => toggleHabitFx(h, today, on, e.currentTarget)}
            >
              <span className="tick">{on ? <Icon name="check" size={12} /> : avoid ? '×' : null}</span>
              {h.name}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Tomorrow({ date }) {
  const cal = useCalendarDays()[date] || { timed: [], allDay: [] };
  const school = useSchool();
  const due = itemsOn(school, date).filter((i) => !i.done);
  const tests = school.filter((i) => i.kind === 'test' && !i.done && i.date > date && i.date <= addDays(date, 3));
  const events = [...cal.timed].sort((a, b) => a.start - b.start);
  if (!events.length && !cal.allDay.length && !due.length && !tests.length) {
    return <p className="muted small">Nothing fixed. The whole day is yours.</p>;
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
          <p className="school-sub">Due tomorrow</p>
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

function BlockTomorrow({ today, tomorrow }) {
  const { dayStart } = useSettings();
  const all = useKind('block');
  const mine = useMemo(() => all.filter((b) => b.date === tomorrow).sort((a, b) => a.start - b.start), [all, tomorrow]);
  const todays = useMemo(() => all.filter((b) => b.date === today), [all, today]);
  const [edit, setEdit] = useState(null);

  const copy = () => {
    putMany(todays.map((b) => ['block', { ...b, id: undefined, sample: undefined, taskId: '', date: tomorrow }]));
    toast(`Copied ${todays.length} blocks to tomorrow`);
  };
  const add = () => {
    const start = mine.length ? Math.max(...mine.map((b) => b.end)) : Math.max(dayStart * 60, 9 * 60);
    const s = Math.min(1380, start);
    setEdit({ date: tomorrow, start: s, end: Math.min(1440, s + 60), type: 'deep', title: '', taskId: '' });
  };
  const total = mine.reduce((a, b) => a + b.end - b.start, 0);

  return (
    <>
      {mine.length > 0 ? (
        <>
          <ul className="mo-blocks">
            {mine.map((b) => (
              <li key={b.id} className={`t-${b.type}`}>
                <i aria-hidden="true" />
                <span className="t">{minToLabel(b.start)}</span>
                <button className="link-btn sd-edit" onClick={() => setEdit(b)}>{b.title || 'Untitled block'}</button>
              </li>
            ))}
          </ul>
          <p className="muted small">{fmtDur(total)} planned for tomorrow.</p>
        </>
      ) : (
        <p className="muted small" style={{ marginTop: 0 }}>A rough plan is enough. You can rearrange it in the morning.</p>
      )}
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="mini sun" onClick={add}><Icon name="plus" size={14} /> Add a block</button>
        {!mine.length && todays.length > 0 && (
          <button className="mini" onClick={copy}>Copy today’s {todays.length} blocks</button>
        )}
      </div>
      {edit && <BlockSheet block={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
