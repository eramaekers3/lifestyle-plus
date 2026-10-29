import { useMemo, useState } from 'react';
import { useHabits, toggleHabit, habitStats, addHabit, resumeHabit, dayClass } from '../lib/model.js';
import { addDays, fmt, parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import HabitHistorySheet from '../components/HabitHistorySheet.jsx';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const codeLabel = (h, code) =>
  ({ d: h.mode === 'avoid' ? 'clean' : 'done', p: 'partly done', s: 'skipped', m: h.mode === 'avoid' ? 'slipped' : 'not done' })[code];

export default function HabitsView() {
  const idx = useHabits();
  const { habits, paused, all, lookup } = idx;
  const [name, setName] = useState('');
  const [mode, setMode] = useState('build');
  const [open, setOpen] = useState(null);
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const stats = useMemo(() => Object.fromEntries(all.map((h) => [h.id, habitStats(h, idx)])), [all, idx]);
  const since = all.length ? all.reduce((m, h) => (idx.startOf(h) < m ? idx.startOf(h) : m), today) : today;
  const totalDone = all.reduce((a, h) => a + stats[h.id].done, 0);

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    addHabit(name, mode, all.length ? Math.max(...all.map((h) => h.order ?? 0)) + 1 : 1);
    setName('');
    toast('Habit added');
  };

  const openHabit = open && all.find((h) => h.id === open);

  return (
    <>
      <header className="page-head">
        <h1>Habits</h1>
        <p>
          {totalDone
            ? `${totalDone.toLocaleString()} check-ins since ${fmt(since, { month: 'short', year: 'numeric' })}. Tap a habit for its full history.`
            : 'The last two weeks. Tap any day to fix it.'}
        </p>
      </header>

      {habits.map((h) => {
        const s = stats[h.id];
        return (
          <section key={h.id} className="card habit">
            <button className="habit-top" onClick={() => setOpen(h.id)} aria-label={`${h.name}: open history`}>
              <h3>{h.name}</h3>
              {h.mode === 'avoid' && <span className="tag">Avoid</span>}
              <span className="streak-badge" aria-label={`${s.streak} day streak`}>
                <b>{s.streak}</b> day{s.streak === 1 ? '' : 's'}
              </span>
            </button>
            <div className="stats">
              <span>Best <strong>{s.best}</strong></span>
              <span>Last 30 days <strong>{s.rate}%</strong></span>
              <span>All time <strong>{s.rateAll}%</strong></span>
            </div>
            <div className="days">
              {days.map((d) => {
                const code = lookup(h, d).code;
                const before = d < idx.startOf(h);
                return (
                  <button
                    key={d}
                    className={`day${before ? '' : dayClass(h, code)}${d === today ? ' today' : ''}`}
                    aria-pressed={code === 'd'}
                    aria-label={`${h.name}, ${fmt(d, { weekday: 'long', month: 'short', day: 'numeric' })}: ${before ? 'before you started' : codeLabel(h, code)}`}
                    onClick={() => toggleHabit(h, d, code === 'd')}
                  >
                    {DOW[parse(d).getDay()]}
                  </button>
                );
              })}
            </div>
            {h.mode === 'avoid' && <p className="hint-quiet">Counts as clean unless you tap a day to mark a slip.</p>}
          </section>
        );
      })}

      {!habits.length && <p className="empty card">No habits yet. Add one below, or import your history from Streaks in Settings.</p>}

      <section className="card">
        <div className="card-head"><h2>New habit</h2></div>
        <div className="seg" role="group" aria-label="Habit type" style={{ marginBottom: 10 }}>
          <button aria-pressed={mode === 'build'} onClick={() => setMode('build')}>Build</button>
          <button aria-pressed={mode === 'avoid'} onClick={() => setMode('avoid')}>Avoid</button>
        </div>
        <form className="inline" onSubmit={add}>
          <input
            id="habit-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'build' ? 'Stretch 10 min' : 'No coffee'}
            autoComplete="off"
          />
          <button className="btn">Add</button>
        </form>
        <p className="hint-quiet">
          {mode === 'build' ? 'Check it off each day you do it.' : 'Every day counts as clean until you mark a slip.'}
        </p>
      </section>

      {paused.length > 0 && (
        <section className="card" aria-labelledby="paused-h">
          <div className="card-head">
            <h2 id="paused-h">Paused</h2>
            <span className="meta">{paused.length}</span>
          </div>
          <ul className="rows">
            {paused.map((h) => (
              <li key={h.id} className="row">
                <button className="row-title link-row" onClick={() => setOpen(h.id)}>
                  <b>{h.name}</b>
                  <span className="muted small"> · best {stats[h.id].best} · {stats[h.id].done} days done</span>
                </button>
                <button className="mini" onClick={() => { resumeHabit(h); toast(`${h.name} resumed`); }}>Resume</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openHabit && <HabitHistorySheet habit={openHabit} idx={idx} onClose={() => setOpen(null)} />}
    </>
  );
}
