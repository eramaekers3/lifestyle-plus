import { useMemo, useState } from 'react';
import { put, remove, useKind, useRecord } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, fmtDur, parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { Icon } from '../components/ui.jsx';
import { useRoutines, addRoutine, startSession, useSession, reorderRoutines } from '../lib/workouts.js';
import RoutineSheet from '../components/RoutineSheet.jsx';
import SortableList from '../components/SortableList.jsx';
import ExerciseSheet from '../components/ExerciseSheet.jsx';
import { MUSCLES, setsByMuscle, useExerciseHistory, musclesFor } from '../lib/lifting.js';
import { GROUPS } from '../lib/exercises.js';
import MuscleIcon from '../components/MuscleIcon.jsx';
import ExercisePicker from '../components/ExercisePicker.jsx';
import CardStack from '../components/CardStack.jsx';
import { weekStart } from '../lib/dates.js';

const DRAFT_ID = idFor('draft-workout');

export default function BodyView() {
  const weights = useKind('weight');
  const workouts = useKind('workout');
  const draft = useRecord(DRAFT_ID);
  const today = todayISO();

  const ws = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const last = ws.at(-1);
  // Daily weight swings a few pounds with water and food, so the 7-day average is the number to watch.
  const avgOver = (from, to) => {
    const xs = ws.filter((w) => w.date >= from && w.date <= to);
    return xs.length ? xs.reduce((a, w) => a + w.lbs, 0) / xs.length : null;
  };
  const avgNow = avgOver(addDays(today, -6), today);
  const avgPrev = avgOver(addDays(today, -13), addDays(today, -7));
  const delta = avgNow !== null && avgPrev !== null ? avgNow - avgPrev : null;
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

      {draft && <Workout draft={draft} exercises={exercises} />}

      <CardStack
        page="body"
        cards={[
          { id: 'muscles', title: 'Sets this week', node: <MuscleWeek workouts={workouts} today={today} /> },
          { id: 'exercises', title: 'Exercise history', node: <Exercises /> },
          {
            id: 'weight',
            title: 'Weight',
            node: (
              <section className="card" aria-labelledby="wt-h">
        <div className="card-head"><h2 id="wt-h">Weight</h2>{last && <span className="meta">{last.lbs.toFixed(1)} lb</span>}</div>
        <div className="hero-row">
          <div>
            <div className="label">Latest</div>
            <div className="big">
              {last ? last.lbs.toFixed(1) : '—'}
              <span> lb</span>
            </div>
          </div>
          {avgNow !== null && (
            <div className="right">
              <div className="label">7-day average</div>
              <div className="delta">{avgNow.toFixed(1)} lb</div>
              {delta !== null && (
                <div className="label wt-change">{delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : ''}{Math.abs(delta).toFixed(1)} lb vs. the week before</div>
              )}
            </div>
          )}
        </div>
        <WeightChart all={ws} today={today} />
        <p className="card-sub wt-legend">
          <span><i className="lg-dot" aria-hidden="true" /> a day’s weigh-in</span>
          <span><i className="lg-line" aria-hidden="true" /> 7-day average (evens out water swings)</span>
        </p>
        <form className="inline" onSubmit={logWeight}>
          <input id="lbs" className="input" type="number" inputMode="decimal" step="0.1" min="50" max="600" value={lbs} onChange={(e) => setLbs(e.target.value)} placeholder="Today’s weight (lb)" />
          <button className="btn">Log</button>
        </form>
      </section>
            ),
          },
          { id: 'health', title: 'Apple Health', node: <HealthCard today={today} /> },
          {
            id: 'recent',
            title: 'Recent workouts',
            node: (
              <section className="card" aria-labelledby="rw-h">
        <div className="card-head"><h2 id="rw-h">Recent workouts</h2><span className="meta">{thisWeek} this week</span></div>
        {recent.length ? (
          <ul className="rows">
            {recent.map((w) => {
              const vol = w.sets.reduce((a, s) => a + s.reps * s.wt, 0);
              return (
                <li key={w.id} className="row">
                  <span className="row-title">
                    <b>{w.name}</b>{' '}
                    <span className="muted">
                      · {w.durationSec ? `${Math.max(1, Math.round(w.durationSec / 60))} min · ` : ''}{w.sets.length} sets{vol ? ` · ${vol.toLocaleString()} lb moved` : ''}
                    </span>
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
            ),
          },
          { id: 'workouts', title: 'Workouts', node: <Workouts /> },
        ]}
      />
    </>
  );
}

/** The muscle groups a workout works hard (main movers only), as group ids. */
const groupsOf = (r) => {
  const out = new Set();
  for (const e of r.exercises || []) for (const [m, w] of Object.entries(musclesFor(e.name))) if (w >= 1) out.add(m.toLowerCase());
  return out;
};

/** Your workout plans, one tight row each. Filter by muscle; tap a name to edit; Start opens the workout screen. */
function Workouts() {
  const routines = useRoutines();
  const session = useSession();
  const [open, setOpen] = useState(null);
  const [mus, setMus] = useState(null);
  const [quick, setQuick] = useState(false);
  const tagged = useMemo(() => routines.map((r) => ({ r, g: groupsOf(r) })), [routines]);
  const used = GROUPS.filter((g) => tagged.some((t) => t.g.has(g.id)));
  const shown = mus ? tagged.filter((t) => t.g.has(mus)).map((t) => t.r) : routines;
  const iconsFor = (r) => GROUPS.filter((g) => tagged.find((t) => t.r === r).g.has(g.id)).slice(0, 4);
  return (
    <section className="card wk-card" aria-labelledby="wk-h">
      <div className="card-head">
        <h2 id="wk-h">Workouts</h2>
        <span className="meta">{routines.length}</span>
        <div className="wk-actions">
          <button className="mini" disabled={!!session} onClick={() => setQuick(true)}>Quick</button>
          <button className="mini" onClick={() => setOpen(addRoutine().id)} aria-label="New workout">
            <Icon name="plus" size={14} /> New
          </button>
        </div>
      </div>
      {used.length > 1 && (
        <div className="mus-filter" role="group" aria-label="Filter by muscle">
          <button className="chip" aria-pressed={!mus} onClick={() => setMus(null)}>All</button>
          {used.map((g) => (
            <button key={g.id} className={`chip m-${g.id}`} aria-pressed={mus === g.id} onClick={() => setMus(mus === g.id ? null : g.id)}>
              <MuscleIcon group={g.id} size={20} /> {g.label}
            </button>
          ))}
        </div>
      )}
      {session && <p className="hint wk-hint">{session.name} is in progress. Finish it to start another.</p>}
      {shown.length > 0 ? (
        <SortableList items={shown} onReorder={(l) => (mus ? null : reorderRoutines(l))} className="rows routine-list" rowClass={() => 'row routine-row'}>
          {(r, grip) => (
            <>
              <button className="row-title task-open" onClick={() => setOpen(r.id)} aria-label={`Open ${r.name}`}>
                <b className="routine-name">{r.name}</b>
                <span className="routine-mus" aria-hidden="true">
                  {iconsFor(r).slice(0, 3).map((g) => <MuscleIcon key={g.id} group={g.id} size={20} />)}
                </span>
                <span className="routine-n">{r.exercises.length} ex</span>
              </button>
              <button
                className="mini sun"
                disabled={!!session || !r.exercises.length}
                onClick={() => startSession(r)}
                aria-label={`Start ${r.name}`}
              >
                Start
              </button>
              {!mus && grip}
            </>
          )}
        </SortableList>
      ) : (
        <p className="empty">{mus ? 'None of your workouts hit that muscle yet. Tap New and add some from the library.' : 'No workouts yet.'}</p>
      )}
      {open && <RoutineSheet id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
      {quick && (
        <ExercisePicker
          title="Quick workout"
          allowNone
          cta={(n) => (n ? `Start with ${n} exercise${n === 1 ? '' : 's'}` : 'Start empty')}
          onClose={() => setQuick(false)}
          onAdd={(list) => {
            setQuick(false);
            startSession({ id: null, name: 'Quick workout', intro: '', exercises: list });
          }}
        />
      )}
    </section>
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

/**
 * The last 30 days of weigh-ins (or less, if that's all there is, so a new history isn't squeezed into
 * one corner). Dots are single days; the line is the average of each day's previous 7 days of weigh-ins.
 */
function WeightChart({ all, today }) {
  const from = addDays(today, -29);
  const points = all.filter((w) => w.date >= from);
  if (points.length < 2) return <p className="empty">Log a few weigh-ins to see your trend.</p>;
  const avg = points.map((p) => {
    const xs = all.filter((w) => w.date <= p.date && w.date > addDays(p.date, -7));
    return xs.reduce((a, w) => a + w.lbs, 0) / xs.length;
  });
  const vals = points.map((p) => p.lbs).concat(avg);
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const start = points[0].date < addDays(today, -6) ? points[0].date : addDays(today, -6);
  const W = 340, H = 170, L = 34, R = 14, T = 12, B = 22;
  const x0 = parse(start).getTime();
  const span = Math.max(1, parse(today).getTime() - x0);
  const x = (d) => L + (W - L - R) * ((parse(d).getTime() - x0) / span);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = points.at(-1);
  return (
    <svg className="chart wt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight since ${fmt(start, { month: 'short', day: 'numeric' })}: weigh-ins and 7-day average`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
        </g>
      ))}
      <polyline className="trend" points={points.map((p, i) => `${x(p.date)},${y(avg[i])}`).join(' ')} />
      {points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.lbs)} r="3" className="dot" />)}
      <circle cx={x(last.date)} cy={y(last.lbs)} r="4.5" className="latest" />
      <text x={L} y={H - 5}>{fmt(start, { month: 'short', day: 'numeric' })}</text>
      <text x={W - R} y={H - 5} textAnchor="end">Today</text>
    </svg>
  );
}

function HealthCard({ today }) {
  const health = useKind('health');
  const hw = useKind('healthworkout');
  const sync = useRecord(idFor('healthsync'));
  const byDate = useMemo(() => Object.fromEntries(health.map((h) => [h.date, h])), [health]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const workouts = useMemo(() => [...hw].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 5), [hw]);

  if (!health.length && !hw.length) {
    return (
      <section className="card" aria-labelledby="ah-h">
        <div className="card-head"><h2 id="ah-h">Apple Health</h2></div>
        <p className="empty" style={{ marginTop: 0 }}>
          Steps, sleep and workouts from Apple Health will show here. Set it up in Settings → Apple Health.
        </p>
      </section>
    );
  }

  const maxSteps = Math.max(10000, ...days.map((d) => (byDate[d] && byDate[d].steps) || 0));
  const withSteps = days.filter((d) => byDate[d] && byDate[d].steps);
  const avgSteps = withSteps.length ? Math.round(withSteps.reduce((a, d) => a + byDate[d].steps, 0) / withSteps.length) : 0;
  const withSleep = days.filter((d) => byDate[d] && byDate[d].sleepMin);
  const avgSleep = withSleep.length ? Math.round(withSleep.reduce((a, d) => a + byDate[d].sleepMin, 0) / withSleep.length) : 0;

  return (
    <section className="card" aria-labelledby="ah-h">
      <div className="card-head">
        <h2 id="ah-h">Apple Health</h2>
        {sync && sync.at && (
          <span className="meta">
            Updated {new Date(sync.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div className="health-week" role="table" aria-label="Steps and sleep, last 7 days">
        {days.map((d) => {
          const h = byDate[d] || {};
          return (
            <div key={d} className={`hd${d === today ? ' today' : ''}`} role="row">
              <div className="hd-bar" aria-hidden="true">
                <i style={{ height: `${Math.min(100, ((h.steps || 0) / maxSteps) * 100)}%` }} />
              </div>
              <b role="cell">{h.steps ? `${(h.steps / 1000).toFixed(1)}k` : '—'}</b>
              <span role="cell">{h.sleepMin ? fmtDur(h.sleepMin) : '—'}</span>
              <span className="hd-day">{fmt(d, { weekday: 'narrow' })}</span>
            </div>
          );
        })}
      </div>
      <div className="health-legend">
        <span>Bars and top number: steps{avgSteps ? ` · avg ${avgSteps.toLocaleString()}` : ''}</span>
        <span>Below: sleep{avgSleep ? ` · avg ${fmtDur(avgSleep)}` : ''}</span>
      </div>
      {workouts.length > 0 && (
        <ul className="rows" style={{ marginTop: 10 }}>
          {workouts.map((w) => (
            <li key={w.id} className="row">
              <span className="row-title"><b>{w.type}</b> <span className="muted">· {fmtDur(w.minutes)}</span></span>
              <span className="meta">{w.date === today ? 'Today' : fmt(w.date, { month: 'short', day: 'numeric' })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sets per muscle group this week (Monday on), with last week for comparison. */
function MuscleWeek({ workouts, today }) {
  const ws = weekStart(today);
  const now = useMemo(() => setsByMuscle(workouts, ws, today), [workouts, ws, today]);
  const prev = useMemo(() => setsByMuscle(workouts, addDays(ws, -7), addDays(ws, -1)), [workouts, ws]);
  const any = MUSCLES.some((m) => now[m] || prev[m]);
  const LOW = 10, HIGH = 20, MAX = 24;
  const fmtN = (v) => (Number.isInteger(v) ? v : v.toFixed(1));
  const total = MUSCLES.reduce((a, m) => a + now[m], 0);
  return (
    <section className="card" aria-labelledby="mw-h">
      <div className="card-head">
        <h2 id="mw-h">Sets this week</h2>
        <span className="meta">by muscle · since Monday</span>
      </div>
      {!any ? (
        <p className="empty">Finish a workout and the sets you checked off show up here, grouped by muscle.</p>
      ) : (
        <>
          <ul className="muscles">
            {MUSCLES.map((m) => {
              const v = now[m];
              const state = v >= HIGH ? 'over' : v >= LOW ? 'in' : v > 0 ? 'some' : '';
              return (
                <li key={m} className={state}>
                  <span className="mu-name">{m}</span>
                  <span className="mu-bar" aria-hidden="true">
                    <span className="mu-zone" style={{ left: `${(LOW / MAX) * 100}%`, width: `${((HIGH - LOW) / MAX) * 100}%` }} />
                    <i style={{ width: `${Math.min(100, (v / MAX) * 100)}%` }} />
                    {prev[m] > 0 && <b className="mu-prev" style={{ left: `${Math.min(100, (prev[m] / MAX) * 100)}%` }} title={`Last week: ${fmtN(prev[m])}`} />}
                  </span>
                  <span className="mu-n">{fmtN(v)}</span>
                </li>
              );
            })}
          </ul>
          <p className="card-sub">
            {fmtN(total)} sets so far. The shaded band is 10–20 sets a week, a common target for growth; the tick is last week. A muscle that only helps (like triceps on bench) gets half a set.
          </p>
        </>
      )}
    </section>
  );
}

/** Everything you've lifted, most recent first. Tap one for its history. */
function Exercises() {
  const list = useExerciseHistory();
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 6);
  const ex = open && list.find((x) => x.key === open);
  return (
    <section className="card" aria-labelledby="ex-h">
      <div className="card-head">
        <h2 id="ex-h">Exercise history</h2>
        <span className="meta">{list.length}</span>
      </div>
      <ul className="rows">
        {shown.map((x) => {
          const n = x.scores.length;
          const prev = n > 1 ? x.scores[n - 2].score : null;
          const lastS = x.scores[n - 1];
          const trend = prev === null ? null : lastS.score > prev ? 'up' : lastS.score < prev ? 'down' : 'flat';
          return (
            <li key={x.key} className="row">
              <button className="row-title task-open" onClick={() => setOpen(x.key)} aria-label={`${x.name} history`}>
                <span className="title-line">{x.name}</span>
                <span className="task-meta">
                  <span>{x.weighted ? `Best ${x.best.wt}×${x.best.reps}` : `Best ${x.best.score}${x.kind === 'time' ? ` ${x.unit || 'sec'}` : ' reps'}`}</span>
                  <span>{n} session{n === 1 ? '' : 's'}</span>
                </span>
              </button>
              <Spark pts={x.scores} />
              {trend && <span className={`ex-trend ${trend}`} aria-label={`Last session ${trend === 'flat' ? 'the same' : trend}`}>{trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–'}</span>}
            </li>
          );
        })}
      </ul>
      {!all && list.length > shown.length && <button className="mini" onClick={() => setAll(true)}>Show all {list.length}</button>}
      {ex && <ExerciseSheet ex={ex} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Spark({ pts }) {
  const p = pts.slice(-8);
  if (p.length < 2) return <span className="spark" />;
  const v = p.map((x) => x.score);
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const W = 56, H = 22;
  const d = p.map((x, i) => `${(i / (p.length - 1)) * W},${H - 2 - ((x.score - lo) / (hi - lo || 1)) * (H - 4)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={d} />
    </svg>
  );
}
