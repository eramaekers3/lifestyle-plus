import { useState } from 'react';
import { put, remove } from '../store.js';
import { useHabits, toggleHabit, habitStats } from '../lib/model.js';
import { addDays, fmt, parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function HabitsView() {
  const { habits, isDone, logs } = useHabits();
  const [name, setName] = useState('');
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    put('habit', { name: name.trim(), order: habits.length ? Math.max(...habits.map((h) => h.order ?? 0)) + 1 : 1 });
    setName('');
    toast('Habit added');
  };

  return (
    <>
      <header className="page-head">
        <h1>Habits</h1>
        <p>The last two weeks. Tap any day to fix it.</p>
      </header>

      {habits.map((h) => {
        const s = habitStats(h, isDone, logs);
        return (
          <section key={h.id} className="card habit">
            <div className="habit-top">
              <h3>{h.name}</h3>
              <button className="x" onClick={() => { remove(h.id); toast('Habit deleted'); }} aria-label={`Delete ${h.name}`}>×</button>
            </div>
            <div className="stats">
              <span>Streak <strong>{s.streak}</strong></span>
              <span>Best <strong>{s.best}</strong></span>
              <span>Last 30 days <strong>{s.rate}%</strong></span>
            </div>
            <div className="days">
              {days.map((d) => {
                const on = isDone(h, d);
                return (
                  <button
                    key={d}
                    className={`day${on ? ' on' : ''}${d === today ? ' today' : ''}`}
                    aria-pressed={on}
                    aria-label={`${h.name}, ${fmt(d, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                    onClick={() => toggleHabit(h, d, on)}
                  >
                    {DOW[parse(d).getDay()]}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {!habits.length && <p className="empty card">No habits yet. Add one you want to do every day.</p>}

      <section className="card">
        <div className="card-head"><h2>New habit</h2></div>
        <form className="inline" onSubmit={add}>
          <input id="habit-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stretch 10 min" autoComplete="off" />
          <button className="btn">Add</button>
        </form>
      </section>
    </>
  );
}
