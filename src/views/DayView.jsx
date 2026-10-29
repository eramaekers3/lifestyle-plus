import { useMemo, useState } from 'react';
import { useKind, useSettings, putMany } from '../store.js';
import { addDays, fmt, fmtDur, nowMin, relDay, todayISO } from '../lib/dates.js';
import { useHabits, toggleHabit } from '../lib/model.js';
import { toast } from '../lib/toast.js';
import { FlipClock, Icon } from '../components/ui.jsx';
import NowStack from '../components/NowStack.jsx';
import Timeline from '../components/Timeline.jsx';
import BlockSheet from '../components/BlockSheet.jsx';
import { useDayStarted } from '../components/MorningSheet.jsx';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool, itemsOn, overdue } from '../lib/canvas.js';
import SchoolList from '../components/SchoolList.jsx';
import { PastDoneButton } from './WeekView.jsx';

export default function DayView({ date }) {
  const settings = useSettings();
  const allBlocks = useKind('block');
  const tasks = useKind('task');
  const [edit, setEdit] = useState(null);
  const calDays = useCalendarDays();
  const cal = calDays[date] || { timed: [], allDay: [] };
  const isToday = date === todayISO();

  const blocks = useMemo(() => allBlocks.filter((b) => b.date === date), [allBlocks, date]);
  const prevDate = addDays(date, -1);
  const prevBlocks = useMemo(() => allBlocks.filter((b) => b.date === prevDate), [allBlocks, prevDate]);
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);

  const total = blocks.reduce((a, b) => a + (b.end - b.start), 0);
  const deep = blocks.filter((b) => b.type === 'deep').reduce((a, b) => a + (b.end - b.start), 0);

  const newBlockAt = (start) =>
    setEdit({ date, start, end: Math.min(1440, start + 60), type: 'deep', title: '', taskId: '' });
  const newBlock = () => {
    const base = isToday ? Math.ceil((nowMin() + 1) / 15) * 15 : 9 * 60;
    newBlockAt(Math.min(1380, Math.max(settings.dayStart * 60, base)));
  };
  const copyPrev = () => {
    putMany(prevBlocks.map((b) => ['block', { ...b, id: undefined, sample: undefined, date }]));
    toast(`Copied ${prevBlocks.length} blocks`);
  };

  return (
    <>
      <header className="dayhead">
        <div>
          <div className="eyebrow">{relDay(date)}</div>
          <h1>
            {fmt(date, { weekday: 'long' })}
            <span>{fmt(date, { month: 'long', day: 'numeric' })}</span>
          </h1>
        </div>
        {isToday && <FlipClock />}
      </header>

      {isToday && <StartBanner date={date} />}

      <NowStack />

      <SchoolDay date={date} />

      <section className="card tl-card" aria-labelledby="tl-h">
        <div className="card-head">
          <h2 id="tl-h">Time blocks</h2>
          <span className="meta">
            {total ? `${fmtDur(total)} planned · ${fmtDur(deep)} deep` : 'Nothing planned yet'}
            {cal.timed.length > 0 && ` · ${cal.timed.length} event${cal.timed.length === 1 ? '' : 's'}`}
          </span>
          <button className="mini sun add-blk" onClick={newBlock}>
            <Icon name="plus" size={14} /> Block
          </button>
        </div>
        {cal.allDay.length > 0 && (
          <div className="allday" aria-label="All-day events">
            {cal.allDay.map((e) => (
              <span key={e.id} className="allday-chip" title={e.calendar} style={{ '--c': e.color }}>{e.title}</span>
            ))}
          </div>
        )}
        {blocks.length === 0 && (
          <div className="tl-empty">
            <p>Give every hour a job. Tap the timeline to add a block.</p>
            {prevBlocks.length > 0 && (
              <button className="mini" onClick={copyPrev}>
                Copy {fmt(prevDate, { weekday: 'long' })}’s {prevBlocks.length} blocks
              </button>
            )}
          </div>
        )}
        <Timeline
          date={date}
          blocks={blocks}
          events={cal.timed}
          tasksById={tasksById}
          dayStart={settings.dayStart}
          dayEnd={settings.dayEnd}
          onAdd={newBlockAt}
          onEdit={setEdit}
        />
      </section>

      <HabitChips date={date} />

      {edit && <BlockSheet block={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StartBanner({ date }) {
  const started = useDayStarted(date);
  const { morningPage } = useSettings();
  if (started || morningPage === false || new Date().getHours() >= 15) return null;
  return (
    <a className="start-banner" href="#morning">
      <Icon name="sun" size={22} />
      <span>
        <b>Start my day</b>
        <span>Weigh in, see what’s fixed, block it out.</span>
      </span>
      <Icon name="right" />
    </a>
  );
}

function SchoolDay({ date }) {
  const items = useSchool();
  const today = todayISO();
  const due = itemsOn(items, date);
  const late = date === today ? overdue(items, today) : [];
  // Tests in the next three days, so they never sneak up on you.
  const soon = items.filter((i) => i.kind === 'test' && i.date > date && i.date <= addDays(date, 3));
  if (!due.length && !late.length && !soon.length) return null;
  const left = due.filter((i) => !i.done).length;
  return (
    <section className="card school-card" aria-labelledby="due-h">
      <div className="card-head">
        <h2 id="due-h">{date === today ? 'Due today' : 'Due this day'}</h2>
        <span className="meta">{due.length ? `${left} of ${due.length} left` : 'Nothing due'}</span>
      </div>
      {(late.length > 0 || due.length > 0) && <SchoolList items={[...late, ...due]} showDay={false} />}
      <PastDoneButton items={late} today={today} />
      {soon.length > 0 && (
        <>
          <p className="school-sub">Tests coming up</p>
          <SchoolList items={soon} />
        </>
      )}
    </section>
  );
}

function HabitChips({ date }) {
  const { habits, isDone } = useHabits();
  if (!habits.length) return null;
  const n = habits.filter((h) => isDone(h, date)).length;
  return (
    <section className="card" aria-labelledby="hab-h">
      <div className="card-head">
        <h2 id="hab-h">Habits</h2>
        <span className="meta">{n} of {habits.length}</span>
      </div>
      <div className="chips">
        {habits.map((h) => {
          const on = isDone(h, date);
          const avoid = h.mode === 'avoid';
          return (
            <button
              key={h.id}
              className={`chip habit-chip${on ? ' on' : ''}${avoid ? ' avoid' : ''}${avoid && !on ? ' slipped' : ''}`}
              aria-pressed={on}
              aria-label={avoid ? `${h.name}: ${on ? 'clean so far, tap to mark a slip' : 'slipped, tap to undo'}` : h.name}
              onClick={() => toggleHabit(h, date, on)}
            >
              <span className="tick">{on ? <Icon name="check" size={12} /> : avoid ? '×' : null}</span>
              {h.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
