import { useMemo, useState } from 'react';
import { put, useKind, useRecord, useSettings } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, fmtDur, iso, todayISO, weekStart } from '../lib/dates.js';
import { BLOCK_TYPES } from '../lib/model.js';

export default function WeekView({ date, openDay }) {
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const we = days[6];
  const settings = useSettings();
  const blocks = useKind('block');
  const tasks = useKind('task');
  const plan = useRecord(idFor(`week:${ws}`));
  const today = todayISO();

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

  return (
    <>
      <header className="dayhead">
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

      <WeekPlan key={ws + (plan ? 'p' : '')} ws={ws} plan={plan} />

      <section className="card" aria-labelledby="glance-h">
        <div className="card-head">
          <h2 id="glance-h">The week at a glance</h2>
          <span className="meta">
            {fmtDur(deep)} deep · {doneCount} task{doneCount === 1 ? '' : 's'} done
          </span>
        </div>
        <ul className="week-days">
          {days.map((d) => {
            const list = byDay[d];
            const total = list.reduce((a, b) => a + b.end - b.start, 0);
            return (
              <li key={d}>
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
                          left: `${Math.max(0, ((b.start - s) / span) * 100)}%`,
                          width: `${Math.max(1, ((Math.min(b.end, s + span) - Math.max(b.start, s)) / span) * 100)}%`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="wk-hrs">{total ? fmtDur(total) : 'Plan'}</span>
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
        </div>
      </section>
    </>
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
