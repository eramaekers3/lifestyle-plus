import { useMemo, useState } from 'react';
import { useKind, useSettings, putMany } from '../store.js';
import { addDays, fmt, fmtDur, nowMin, relDay, todayISO, weekStart } from '../lib/dates.js';
import { useFinance, total as sumKind, money, merchantOf, catLabel, CAT_COLORS } from '../lib/finance.js';
import { useHabits } from '../lib/model.js';
import { toast } from '../lib/toast.js';
import { FlipClock, Icon, Sheet } from '../components/ui.jsx';
import NowStack from '../components/NowStack.jsx';
import Timeline from '../components/Timeline.jsx';
import BlockSheet from '../components/BlockSheet.jsx';
import AutoPlanSheet from '../components/AutoPlanSheet.jsx';
import { useDayStarted } from '../components/MorningSheet.jsx';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool, itemsOn, overdue } from '../lib/canvas.js';
import SchoolList from '../components/SchoolList.jsx';
import CardStack from '../components/CardStack.jsx';
import { PastDoneButton } from './WeekView.jsx';
import { useShutDown, useReviewed, reviewWeek, reviewDue } from '../lib/review.js';
import { toggleHabitFx } from '../lib/game.js';

export default function DayView({ date }) {
  const settings = useSettings();
  const allBlocks = useKind('block');
  const tasks = useKind('task');
  const hasBanks = useKind('fin_account').length > 0;
  const [edit, setEdit] = useState(null);
  const [autoPlan, setAutoPlan] = useState(false);
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
      <header className="dayhead" data-swipe-days>
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
      {isToday && <ReviewBanner />}
      {isToday && <ShutdownBanner date={date} />}

      <CardStack
        page="day"
        cards={[
          { id: 'now', title: 'Now', node: <NowStack /> },
          { id: 'school', title: 'Due today', node: <SchoolDay date={date} /> },
          {
            id: 'blocks',
            title: 'Time blocks',
            node: (
              <section className="card tl-card" aria-labelledby="tl-h" data-swipe-days>
        <div className="card-head">
          <h2 id="tl-h">Time blocks</h2>
          <span className="meta">
            {total ? `${fmtDur(total)} planned · ${fmtDur(deep)} deep` : 'Nothing planned yet'}
            {cal.timed.length > 0 && ` · ${cal.timed.length} event${cal.timed.length === 1 ? '' : 's'}`}
          </span>
          <button className="mini add-blk" onClick={() => setAutoPlan(true)} disabled={date < todayISO()}>
            Auto-plan
          </button>
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
            ),
          },
          { id: 'habits', title: 'Habits', node: <HabitChips date={date} /> },
          { id: 'spend', title: 'Spending this week', node: hasBanks ? <WeekSpend date={date} /> : null },
        ]}
      />

      {edit && <BlockSheet block={edit} onClose={() => setEdit(null)} />}
      {autoPlan && <AutoPlanSheet date={date} blocks={blocks} events={cal.timed} onClose={() => setAutoPlan(false)} />}
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

function ShutdownBanner({ date }) {
  const done = useShutDown(date);
  const started = useDayStarted(date);
  const hour = new Date().getHours();
  // From 4pm on, until it's done.
  if (done || hour < 16) return null;
  return (
    <a className="start-banner moon-banner" href="#shutdown">
      <Icon name="moon" size={22} />
      <span>
        <b>Shut down the day</b>
        <span>{started ? 'Close your loops, block out tomorrow, then stop.' : 'Two minutes: close out today and plan tomorrow.'}</span>
      </span>
      <Icon name="right" />
    </a>
  );
}

export function ReviewBanner() {
  const ws = reviewWeek();
  const reviewed = useReviewed(ws);
  if (reviewed || !reviewDue()) return null;
  return (
    <a className="start-banner review-banner" href="#review">
      <Icon name="review" size={22} />
      <span>
        <b>Weekly review</b>
        <span>Look back, clear the backlog, set three priorities.</span>
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
              onClick={(e) => toggleHabitFx(h, date, on, e.currentTarget)}
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

/** This week's spending (Monday on), against last week by the same day, with what's still due. */
function WeekSpend({ date }) {
  const f = useFinance();
  const today = todayISO();
  const from = weekStart(date);
  const to = addDays(from, 6);
  const upto = date === today || (today >= from && today <= to) ? today : to < today ? to : from;
  const spent = sumKind(f.txns, 'spend', from, upto);
  const nDays = Math.round((Date.parse(upto) - Date.parse(from)) / 864e5);
  const last = sumKind(f.txns, 'spend', addDays(from, -7), addDays(from, -7 + nDays));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    return { d, v: d > today ? 0 : Math.max(0, sumKind(f.txns, 'spend', d, d)) };
  });
  const max = Math.max(1, ...days.map((x) => x.v));
  const due = f.recurring.filter((r) => r.dir === 'out' && r.counted && r.active && r.next > today && r.next <= to);
  const dueTotal = due.reduce((s, r) => s + r.amount, 0);
  const diff = spent - last;
  // null = closed, 'all' = the whole week, or one day's date.
  const [open, setOpen] = useState(null);
  const openAt = (e, d) => {
    e.stopPropagation();
    setOpen(d);
  };
  return (
    <section className="card" aria-labelledby="ws-h">
      <div
        className="wk-spend"
        role="button"
        tabIndex={0}
        onClick={() => setOpen('all')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen('all'))}
        aria-label="See this week’s purchases"
      >
        <div className="card-head">
          <h2 id="ws-h">Spending this week</h2>
          <span className="meta">{money(spent)}</span>
        </div>
        <div className="hero-row">
          <div>
            <div className="label">{fmt(from, { month: 'short', day: 'numeric' })} – {fmt(to, { month: 'short', day: 'numeric' })}</div>
            <div className="big money-big">{money(spent)}</div>
          </div>
          {last > 0 && (
            <div className="right">
              <div className="label">Last week by now</div>
              <div className="delta">{money(last)}</div>
              <div className={`label mo-cmp ${diff <= 0 ? 'pos' : 'neg'}`}>{diff <= 0 ? '▼' : '▲'} {money(Math.abs(diff))}</div>
            </div>
          )}
        </div>
        <div className="wk-days">
          {days.map((x) => (
            <button
              key={x.d}
              className={x.d === today ? 'today' : x.d > today ? 'future' : ''}
              disabled={x.d > today}
              onClick={(e) => openAt(e, x.d)}
              aria-label={`${fmt(x.d, { weekday: 'long' })}: ${money(x.v)}`}
            >
              <i style={{ height: `${x.d > today ? 4 : Math.max(4, (x.v / max) * 44)}px` }} />
              {fmt(x.d, { weekday: 'narrow' })}
            </button>
          ))}
        </div>
        {due.length > 0 && (
          <p className="muted small">{money(dueTotal, true)} in subscriptions still due this week: {due.map((r) => r.name).join(', ')}.</p>
        )}
        <p className="wk-more">See purchases ›</p>
      </div>
      {open && <WeekPurchases f={f} from={from} upto={upto} days={days} today={today} pick={open} setPick={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** The popup: every purchase this week, newest first, grouped by day. Tap a day to see just that one. */
function WeekPurchases({ f, from, upto, days, today, pick, setPick, onClose }) {
  const inRange = (d) => (pick === 'all' ? d >= from && d <= upto : d === pick);
  const list = f.txns.filter((t) => t.kind === 'spend' && inRange(t.date));
  const sum = Math.round(list.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const byDay = [];
  for (const t of list) {
    const g = byDay.at(-1);
    if (g && g.d === t.date) g.txns.push(t);
    else byDay.push({ d: t.date, txns: [t] });
  }
  const dayName = (d) => (d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }));
  return (
    <Sheet title={pick === 'all' ? 'This week’s purchases' : dayName(pick)} onClose={onClose}>
      <div className="rv-stats money-stats">
        <div><b>{money(sum, true)}</b><span>spent</span></div>
        <div><b>{list.filter((t) => t.amount > 0).length}</b><span>purchases</span></div>
        <div><b>{money(pick === 'all' ? sum / Math.max(1, days.filter((x) => x.d <= today).length) : sum)}</b><span>{pick === 'all' ? 'a day' : 'that day'}</span></div>
      </div>
      <div className="chips wk-chips">
        <button className="chip" aria-pressed={pick === 'all'} onClick={() => setPick('all')}>Week</button>
        {days.filter((x) => x.d <= today).map((x) => (
          <button key={x.d} className="chip" aria-pressed={pick === x.d} onClick={() => setPick(x.d)}>
            {fmt(x.d, { weekday: 'short' })}
          </button>
        ))}
      </div>
      {!list.length && <p className="empty">No purchases {pick === 'all' ? 'yet this week' : 'that day'}.</p>}
      {byDay.map((g) => (
        <div key={g.d}>
          {pick === 'all' && (
            <p className="school-sub wk-day-head">
              <span>{dayName(g.d)}</span>
              <span>{money(g.txns.reduce((s, t) => s + t.amount, 0), true)}</span>
            </p>
          )}
          <ul className="rows txn-list">
            {g.txns.map((t) => (
              <li key={t.txnId} className="row">
                <span className="row-title">
                  <span className="title-line">
                    <i className="wk-dot" style={{ background: CAT_COLORS[t.cat] || CAT_COLORS.OTHER }} />
                    {merchantOf(t)}
                    {t.pending && <span className="tag">Pending</span>}
                    {t.repeat && <span className="tag">{t.repeat.cadence.label}</span>}
                  </span>
                  <span className="task-meta"><span>{catLabel(t.cat)}</span><span>{t.account.name}</span></span>
                </span>
                <b className={`txn-amt${t.amount < 0 ? ' in' : ''}`}>{t.amount < 0 ? '+' : ''}{money(Math.abs(t.amount), true)}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <a className="link-btn" href="#money" onClick={onClose}>Open Money ›</a>
    </Sheet>
  );
}
