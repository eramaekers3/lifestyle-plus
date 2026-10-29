import { useMemo, useState } from 'react';
import { put, remove, useKind, useRecord } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

const DRAFT_ID = idFor('draft-workout');

export default function BodyView() {
  const weights = useKind('weight');
  const workouts = useKind('workout');
  const draft = useRecord(DRAFT_ID);
  const today = todayISO();

  const ws = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const last = ws.at(-1);
  const weekAgo = ws.filter((w) => w.date <= addDays(today, -7)).at(-1);
  const delta = last && weekAgo ? last.lbs - weekAgo.lbs : null;
  const thisWeek = workouts.filter((w) => w.date > addDays(today, -7)).length;
  const recent = [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const exercises = [...new Set(workouts.flatMap((w) => w.sets.map((s) => s.ex)))];

  const [lbs, setLbs] = useState('');
  const logWeight = (e) => {
    e.preventDefault();
    if (!lbs) return;
    put('weight', { id: idFor(`w:${today}`), date: today, lbs: +lbs });
    setLbs('');
    toast('Weight logged');
  };

  return (
    <>
      <header className="page-head">
        <h1>Body</h1>
        <p>{thisWeek} workout{thisWeek === 1 ? '' : 's'} in the last 7 days.</p>
      </header>

      <section className="card" aria-labelledby="wt-h">
        <div className="card-head"><h2 id="wt-h">Weight</h2></div>
        <div className="hero-row">
          <div>
            <div className="label">Latest</div>
            <div className="big">
              {last ? last.lbs.toFixed(1) : '—'}
              <span> lb</span>
            </div>
          </div>
          {delta !== null && (
            <div className="right">
              <div className="label">vs. a week ago</div>
              <div className="delta">{delta > 0 ? '+' : ''}{delta.toFixed(1)} lb</div>
            </div>
          )}
        </div>
        <WeightChart points={ws.filter((w) => w.date >= addDays(today, -29))} today={today} />
        <p className="card-sub">Dots are daily weigh-ins. The line is the smoothed trend.</p>
        <form className="inline" onSubmit={logWeight}>
          <input id="lbs" className="input" type="number" inputMode="decimal" step="0.1" min="50" max="600" value={lbs} onChange={(e) => setLbs(e.target.value)} placeholder="Today’s weight (lb)" />
          <button className="btn">Log</button>
        </form>
      </section>

      <Workout draft={draft} exercises={exercises} />

      <section className="card" aria-labelledby="rw-h">
        <div className="card-head"><h2 id="rw-h">Recent workouts</h2></div>
        {recent.length ? (
          <ul className="rows">
            {recent.map((w) => {
              const vol = w.sets.reduce((a, s) => a + s.reps * s.wt, 0);
              return (
                <li key={w.id} className="row">
                  <span className="row-title">
                    <b>{w.name}</b>{' '}
                    <span className="muted">· {w.sets.length} sets · {vol.toLocaleString()} lb moved</span>
                  </span>
                  <span className="meta">{w.date === today ? 'Today' : fmt(w.date, { month: 'short', day: 'numeric' })}</span>
                  <button className="x" onClick={() => { remove(w.id); toast('Workout deleted'); }} aria-label={`Delete ${w.name} workout`}>×</button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">No workouts yet.</p>
        )}
      </section>
    </>
  );
}

function Workout({ draft, exercises }) {
  const [name, setName] = useState('');
  const lastSet = draft && draft.sets.at(-1);
  const [ex, setEx] = useState('');
  const [reps, setReps] = useState('');
  const [wt, setWt] = useState('');

  if (!draft) {
    return (
      <section className="card" aria-labelledby="wo-h">
        <div className="card-head"><h2 id="wo-h">Start a workout</h2></div>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            put('draft', { id: DRAFT_ID, name: name.trim(), sets: [], date: todayISO() });
            setName('');
          }}
        >
          <input id="wo-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Push, Pull, Legs…" autoComplete="off" />
          <button className="btn">Start</button>
        </form>
      </section>
    );
  }

  const addSet = (e) => {
    e.preventDefault();
    const set = { ex: (ex || lastSet?.ex || '').trim(), reps: +(reps || lastSet?.reps || 0), wt: +(wt || lastSet?.wt || 0) };
    if (!set.ex || !set.reps) return;
    put('draft', { ...draft, sets: [...draft.sets, set] });
    setReps('');
  };

  return (
    <section className="card live-card" aria-labelledby="wo-h">
      <div className="card-head">
        <h2 id="wo-h">Workout in progress</h2>
        <span className="meta">{draft.sets.length} sets</span>
      </div>
      <h3 className="wo-name">{draft.name}</h3>
      {draft.sets.length > 0 && (
        <div className="tablebox">
          <table className="sets">
            <thead><tr><th>Exercise</th><th>Reps</th><th>Weight</th><th /></tr></thead>
            <tbody>
              {draft.sets.map((s, i) => (
                <tr key={i}>
                  <td>{s.ex}</td><td>{s.reps}</td><td>{s.wt} lb</td>
                  <td><button className="x" onClick={() => put('draft', { ...draft, sets: draft.sets.filter((_, j) => j !== i) })} aria-label="Remove set">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="inline" onSubmit={addSet}>
        <input id="set-ex" className="input" list="exlist" value={ex} onChange={(e) => setEx(e.target.value)} placeholder={lastSet?.ex || 'Exercise'} autoComplete="off" />
        <input id="set-reps" className="input num-in" type="number" inputMode="numeric" min="1" value={reps} onChange={(e) => setReps(e.target.value)} placeholder={lastSet ? String(lastSet.reps) : 'Reps'} />
        <input id="set-wt" className="input num-in" type="number" inputMode="decimal" min="0" step="2.5" value={wt} onChange={(e) => setWt(e.target.value)} placeholder={lastSet ? String(lastSet.wt) : 'lb'} />
        <button className="btn">Log set</button>
      </form>
      <datalist id="exlist">{exercises.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="btn-row">
        <button
          className="btn"
          onClick={() => {
            if (draft.sets.length) put('workout', { date: draft.date || todayISO(), name: draft.name, sets: draft.sets });
            remove(DRAFT_ID);
            toast(draft.sets.length ? 'Workout saved' : 'Workout discarded');
          }}
        >
          Finish workout
        </button>
        <button className="btn ghost" onClick={() => { remove(DRAFT_ID); toast('Workout discarded'); }}>Discard</button>
      </div>
    </section>
  );
}

function WeightChart({ points, today }) {
  if (points.length < 2) return <p className="empty">Log a few weigh-ins to see your trend.</p>;
  let ema = points[0].lbs;
  const trend = points.map((p) => (ema = ema + 0.25 * (p.lbs - ema)));
  const all = points.map((p) => p.lbs).concat(trend);
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const W = 340, H = 170, L = 34, R = 10, T = 10, B = 22;
  const x0 = parse(addDays(today, -29)).getTime();
  const span = 29 * 864e5;
  const x = (d) => L + (W - L - R) * ((parse(d).getTime() - x0) / span);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight over the last 30 days">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
        </g>
      ))}
      {points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.lbs)} r="2.6" className="dot" />)}
      <polyline className="trend" points={points.map((p, i) => `${x(p.date)},${y(trend[i])}`).join(' ')} />
      <circle cx={x(points.at(-1).date)} cy={y(trend.at(-1))} r="4.5" className="end" />
      <text x={L} y={H - 5}>{fmt(addDays(today, -29), { month: 'short', day: 'numeric' })}</text>
      <text x={W - R} y={H - 5} textAnchor="end">Today</text>
    </svg>
  );
}
