import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { habitStats, monthlyRates, pauseHabit, resumeHabit, deleteHabit, dayClass } from '../lib/model.js';
import { addDays, fmt, todayISO, weekStart } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

export default function HabitHistorySheet({ habit: h, idx, onClose }) {
  const s = useMemo(() => habitStats(h, idx), [h, idx]);
  const months = useMemo(() => monthlyRates(h, idx, 12), [h, idx]);
  const [confirmDel, setConfirmDel] = useState(false);
  const scroller = useRef(null);
  const today = todayISO();
  const first = idx.startOf(h);

  // One column per week (Monday first), from the week you started to this week.
  const weeks = useMemo(() => {
    const out = [];
    for (let w = weekStart(first), i = 0; w <= today && i < 600; w = addDays(w, 7), i++) {
      out.push(Array.from({ length: 7 }, (_, k) => addDays(w, k)));
    }
    return out;
  }, [first, today]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [weeks.length]);

  const label = (code) =>
    ({ d: h.mode === 'avoid' ? 'clean' : 'done', p: 'partly done', s: 'skipped', m: h.mode === 'avoid' ? 'slipped' : 'not done' })[code];

  return (
    <Sheet title={h.name} onClose={onClose}>
      <p className="sheet-sub">
        {h.mode === 'avoid' ? 'Avoid habit' : 'Build habit'} · since {fmt(first, { month: 'long', day: 'numeric', year: 'numeric' })}
        {h.paused ? ' · paused' : ''}
      </p>

      <div className="tiles">
        <div className="tile"><span>Current streak</span><b>{h.paused ? '—' : s.streak}</b></div>
        <div className="tile"><span>Best streak</span><b>{s.best}</b></div>
        <div className="tile"><span>{h.mode === 'avoid' ? 'Clean days' : 'Days done'}</span><b>{s.done.toLocaleString()}</b></div>
        <div className="tile"><span>Success rate</span><b>{s.rateAll}%</b></div>
      </div>

      <h3 className="mini-h">Every day</h3>
      <div className="heat-wrap" ref={scroller}>
        <div className="heat" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 13px)` }}>
          <div className="heat-months" style={{ gridColumn: `2 / span ${weeks.length}`, gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
            {weeks.map((w, i) => {
              const firstOfMonth = w.find((d) => d.endsWith('-01'));
              return (
                <span key={w[0]} style={{ gridColumn: i + 1 }}>
                  {firstOfMonth || i === 0 ? fmt(firstOfMonth || w[0], { month: 'short' }) : ''}
                </span>
              );
            })}
          </div>
          {DAY_LABELS.map((l, r) => (
            <span key={r} className="heat-dow" style={{ gridRow: r + 2, gridColumn: 1 }}>{l}</span>
          ))}
          {weeks.map((w, c) =>
            w.map((d, r) => {
              const out = d < first || d > today;
              const code = out ? null : idx.lookup(h, d).code;
              return (
                <i
                  key={d}
                  className={`cell${out ? ' out' : dayClass(h, code)}${d === today ? ' today' : ''}`}
                  style={{ gridColumn: c + 2, gridRow: r + 2 }}
                  title={out ? '' : `${fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}: ${label(code)}`}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="heat-legend">
        <span><i className="cell on" /> {h.mode === 'avoid' ? 'Clean' : 'Done'}</span>
        <span><i className="cell part" /> Partly</span>
        <span><i className="cell skip" /> Skipped</span>
        <span><i className={`cell${h.mode === 'avoid' ? ' slip' : ''}`} /> {h.mode === 'avoid' ? 'Slipped' : 'Missed'}</span>
      </div>

      <h3 className="mini-h">By month</h3>
      <ul className="month-bars">
        {months.map((m) => (
          <li key={m.month}>
            <span className="mb-label">
              {fmt(`${m.month}-01`, { month: 'short' })}
              {m.month.slice(0, 4) !== today.slice(0, 4) ? ` ’${m.month.slice(2, 4)}` : ''}
            </span>
            <span className="mb-track" aria-hidden="true">
              {m.rate !== null && <i style={{ width: `${m.rate}%` }} />}
            </span>
            <span className="mb-val">{m.rate === null ? '—' : `${m.rate}%`}</span>
          </li>
        ))}
      </ul>

      <div className="btn-row">
        {h.paused ? (
          <button className="btn" onClick={() => { resumeHabit(h); toast(`${h.name} resumed`); }}>Resume</button>
        ) : (
          <button className="btn ghost" onClick={() => { pauseHabit(h); toast(`${h.name} paused`); onClose(); }}>Pause</button>
        )}
        <button
          className={`btn ${confirmDel ? 'danger' : 'ghost'}`}
          onClick={() => {
            if (!confirmDel) return setConfirmDel(true);
            deleteHabit(h);
            toast('Habit deleted');
            onClose();
          }}
        >
          {confirmDel ? 'Tap again to delete it and its history' : 'Delete'}
        </button>
      </div>
      {h.paused && <p className="hint-quiet">Paused days count as skipped, so they don’t break the streak.</p>}
    </Sheet>
  );
}
