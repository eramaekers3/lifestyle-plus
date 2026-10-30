import { useMemo, useState } from 'react';
import { put, useKind, useRecord, useSettings } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, fmtDur, iso, nowMin, todayISO, weekStart } from '../lib/dates.js';
import { BLOCK_TYPES } from '../lib/model.js';
import { useCalendarDays, useCalendarStatus } from '../lib/calendar.js';
import { useSchool, overdue, markPastDone } from '../lib/canvas.js';
import { toast } from '../lib/toast.js';
import SchoolList from '../components/SchoolList.jsx';
import BlockSheet from '../components/BlockSheet.jsx';
import CardStack from '../components/CardStack.jsx';
import { Icon } from '../components/ui.jsx';
import { reviewWeek, useReviewed } from '../lib/review.js';

export default function WeekView({ date, openDay }) {
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const we = days[6];
  const settings = useSettings();
  const blocks = useKind('block');
  const tasks = useKind('task');
  const plan = useRecord(idFor(`week:${ws}`));
  const today = todayISO();
  const calDays = useCalendarDays();
  const cals = useCalendarStatus().filter((c) => c.events);
  const [edit, setEdit] = useState(null);

  const byDay = useMemo(() => {
    const m = {};
    for (const d of days) m[d] = [];
    for (const b of blocks) if (m[b.date]) m[b.date].push(b);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, ws]);

  const all = days.flatMap((d) => byDay[d]);
  const deep = all.filter((b) => b.type === 'deep').reduce((a, b) => a + b.end - b.start, 0);
  const doneCount = tasks.filter((t) => t.status === 'done' && t.doneAt && iso(new Date(t.doneAt)) >= ws && iso(new Date(t.doneAt)) <= we).length;

  const s = settings.dayStart * 60;
  const span = (settings.dayEnd - settings.dayStart) * 60;

  // New block on a day: right after that day's last block, else now (today) or 9am.
  const addBlock = (d) => {
    const mine = byDay[d];
    let start = d === today ? Math.ceil((nowMin() + 1) / 15) * 15 : 9 * 60;
    if (mine.length) start = Math.max(...mine.map((b) => b.end));
    start = Math.min(1380, Math.max(s, start));
    setEdit({ date: d, start, end: Math.min(1440, start + 60), type: 'deep', title: '', taskId: '' });
  };

  return (
    <>
      <header className="dayhead" data-swipe-days>
        <div>
          <div className="eyebrow">{ws <= today && today <= we ? 'This week' : ws > today ? 'Coming up' : 'Past week'}</div>
          <h1>
            Week of {fmt(ws, { month: 'short', day: 'numeric' })}
            <span>
              {fmt(ws, { month: 'short', day: 'numeric' })} – {fmt(we, { month: 'short', day: 'numeric' })}
            </span>
          </h1>
        </div>
      </header>

      <ReviewRow ws={ws} />

      <CardStack
        page="week"
        cards={[
          { id: 'plan', title: 'Weekly plan', node: <WeekPlan key={ws + (plan ? 'p' : '')} ws={ws} plan={plan} /> },
          { id: 'school', title: 'School this week', node: <SchoolWeek ws={ws} we={we} today={today} /> },
          {
            id: 'glance',
            title: 'The week at a glance',
            node: (
              <section className="card" aria-labelledby="glance-h" data-swipe-days>
        <div className="card-head">
          <h2 id="glance-h">The week at a glance</h2>
          <span className="meta">
            {fmtDur(deep)} deep · {doneCount} task{doneCount === 1 ? '' : 's'} done
          </span>
        </div>
        <ul className="week-days">
          {days.map((d) => {
            const list = [...byDay[d], ...((calDays[d] && calDays[d].timed) || [])];
            const total = byDay[d].reduce((a, b) => a + b.end - b.start, 0);
            return (
              <li key={d} className="wk-li">
                <button className={`wk-row${d === today ? ' is-today' : ''}`} onClick={() => openDay(d)}>
                  <span className="wk-day">
                    <b>{fmt(d, { weekday: 'short' })}</b>
                    <span>{fmt(d, { day: 'numeric' })}</span>
                  </span>
                  <span className="wk-bar" aria-hidden="true">
                    {list.map((b) => (
                      <i
                        key={b.id}
                        className={`t-${b.type}`}
                        style={{
                          '--c': b.color,
                          left: `${Math.max(0, ((b.start - s) / span) * 100)}%`,
                          width: `${Math.max(1, ((Math.min(b.end, s + span) - Math.max(b.start, s)) / span) * 100)}%`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="wk-hrs">{total ? fmtDur(total) : 'Plan'}</span>
                </button>
                <button className="mini wk-add" onClick={() => addBlock(d)} aria-label={`Add a block on ${fmt(d, { weekday: 'long' })}`}>
                  <Icon name="plus" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="legend">
          {BLOCK_TYPES.map((t) => (
            <span key={t.id} className={`t-${t.id}`}>
              <i aria-hidden="true" />
              {t.label}
            </span>
          ))}
          {cals.map((c) => (
            <span key={c.id} className="t-cal" style={{ '--c': c.color }}>
              <i aria-hidden="true" />
              {c.name || 'Calendar'}
            </span>
          ))}
        </div>
      </section>
            ),
          },
        ]}
      />

      {edit && <BlockSheet block={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

/** The review button on the week it plans: a prompt until it's done, then a quiet "reviewed" line. */
function ReviewRow({ ws }) {
  const reviewed = useReviewed(ws);
  if (ws !== reviewWeek()) return null;
  if (reviewed) {
    return (
      <a className="reviewed-line" href="#review">
        <Icon name="check" size={14} /> Week reviewed · open again
      </a>
    );
  }
  return (
    <a className="start-banner review-banner" href="#review">
      <Icon name="review" size={22} />
      <span>
        <b>Do the weekly review</b>
        <span>About 10 minutes. Look back, clear the backlog, set three priorities.</span>
      </span>
      <Icon name="right" />
    </a>
  );
}

function SchoolWeek({ ws, we, today }) {
  const items = useSchool();
  const { canvas } = useSettings();
  if (!canvas || !canvas.url) return null;
  const thisWeek = ws <= today && today <= we;
  const week = items.filter((i) => i.date >= ws && i.date <= we);
  const late = thisWeek ? overdue(items, today).filter((i) => i.date < ws) : [];
  const tests = week.filter((i) => i.kind === 'test');
  const hw = [...late, ...week.filter((i) => i.kind === 'homework')];
  const left = hw.filter((i) => !i.done).length;
  return (
    <section className="card school-card" aria-labelledby="sch-h">
      <div className="card-head">
        <h2 id="sch-h">School this week</h2>
        <span className="meta">
          {tests.length ? `${tests.length} test${tests.length === 1 ? '' : 's'} · ` : ''}
          {hw.length ? `${left} of ${hw.length} left` : 'No homework due'}
        </span>
      </div>
      {tests.length > 0 && <SchoolList items={tests} />}
      {hw.length > 0 && <SchoolList items={hw} />}
      <PastDoneButton items={[...tests, ...hw]} today={today} />
      {!tests.length && !hw.length && <p className="muted small">Nothing from Canvas this week.</p>}
    </section>
  );
}

/** Canvas doesn't say what you've submitted, so finished past work can be cleared in one tap. */
export function PastDoneButton({ items, today }) {
  const n = items.filter((i) => !i.done && i.date < today).length;
  if (!n) return null;
  return (
    <button className="mini past-done" onClick={() => toast(`Marked ${markPastDone(items, today)} as done`)}>
      Mark {n} past item{n === 1 ? '' : 's'} done
    </button>
  );
}

function WeekPlan({ ws, plan }) {
  const [big, setBig] = useState(() => (plan && plan.big) || ['', '', '']);
  const [notes, setNotes] = useState(() => (plan && plan.notes) || '');
  const [saved, setSaved] = useState(false);

  const save = (nextBig = big, nextNotes = notes) => {
    const same = plan && JSON.stringify(plan.big) === JSON.stringify(nextBig) && plan.notes === nextNotes;
    if (same) return;
    put('week', { ...(plan || {}), id: idFor(`week:${ws}`), week: ws, big: nextBig, notes: nextNotes });
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  return (
    <section className="card plan-card" aria-labelledby="wp-h">
      <div className="card-head">
        <h2 id="wp-h">Weekly plan</h2>
        <span className={`meta saved${saved ? ' show' : ''}`}>Saved</span>
      </div>
      <p className="card-sub">Look at your calendar and your goals, then decide what this week is for.</p>
      <div className="big3">
        {[0, 1, 2].map((i) => (
          <label key={i} htmlFor={`big-${i}`}>
            <span className="n">{i + 1}</span>
            <input
              id={`big-${i}`}
              className="input"
              value={big[i] || ''}
              placeholder={['Most important thing this week', 'Second priority', 'Third priority'][i]}
              onChange={(e) => setBig((b) => b.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => save()}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
      <label className="f" htmlFor="week-notes" style={{ marginTop: 14 }}>
        Notes for the week
        <textarea
          id="week-notes"
          className="input"
          rows={3}
          value={notes}
          placeholder="Deadlines, appointments, when the deep work happens…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => save()}
        />
      </label>
    </section>
  );
}
