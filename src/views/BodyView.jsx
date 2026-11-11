import { useMemo, useState } from 'react';
import { put, useKind, useRecord } from '../store.js';
import { idFor } from '../lib/ids.js';
import { addDays, fmt, fmtDur, parse, todayISO, weekStart } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { useFitWorkouts } from '../lib/fit.js';
import CardStack from '../components/CardStack.jsx';
import SleepCard from '../components/SleepCard.jsx';
import WeightSheet from '../components/WeightSheet.jsx';

// Workouts are run and logged in fit+. This page shows the ones you finish there (read-only);
// they still earn XP and coins here (see lib/fit.js).
export default function BodyView() {
  const weights = useKind('weight');
  const fit = useFitWorkouts();
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
  const thisWeek = fit.filter((w) => w.date > addDays(today, -7)).length;

  const [lbs, setLbs] = useState('');
  const [weightOpen, setWeightOpen] = useState(false);
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
        <p>{thisWeek} workout{thisWeek === 1 ? '' : 's'} in fit+ in the last 7 days.</p>
      </header>

      <CardStack
        page="body"
        cards={[
          {
            id: 'weight',
            title: 'Weight',
            node: (
              <section className="card wt-card" aria-labelledby="wt-h">
                <div className="card-head"><h2 id="wt-h">Weight</h2>{last && <span className="meta">{last.lbs.toFixed(1)} lb</span>}</div>
                <button className="sl-open wt-open" onClick={() => setWeightOpen(true)} aria-label="Open weight in detail">
                  <div className="hero-row compact">
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
                          <div className="label wt-change">{delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : ''}{Math.abs(delta).toFixed(1)} lb vs. last week</div>
                        )}
                      </div>
                    )}
                  </div>
                  <WeightChart all={ws} today={today} />
                  <p className="card-sub wt-legend">
                    <span><i className="lg-dot" aria-hidden="true" /> weigh-in</span>
                    <span><i className="lg-line" aria-hidden="true" /> 7-day average</span>
                  </p>
                </button>
                {weightOpen && <WeightSheet onClose={() => setWeightOpen(false)} />}
                <form className="inline" onSubmit={logWeight}>
                  <input id="lbs" className="input" type="number" inputMode="decimal" step="0.1" min="50" max="600" value={lbs} onChange={(e) => setLbs(e.target.value)} placeholder="Today’s weight (lb)" />
                  <button className="btn">Log</button>
                </form>
              </section>
            ),
          },
          { id: 'recent', title: 'Workouts from fit+', node: <FitWorkouts fit={fit} today={today} /> },
          { id: 'sleep', title: 'Sleep', node: <SleepCard /> },
          { id: 'health', title: 'Apple Health', node: <HealthCard today={today} /> },
        ]}
      />
    </>
  );
}

/** The last few workouts finished in fit+, with what they earned here. */
function FitWorkouts({ fit, today }) {
  const recent = useMemo(() => [...fit].reverse().slice(0, 6), [fit]);
  const sinceMon = fit.filter((w) => w.date >= weekStart(today) && w.date <= today).length;
  return (
    <section className="card" aria-labelledby="rw-h">
      <div className="card-head"><h2 id="rw-h">Workouts from fit+</h2><span className="meta">{sinceMon} this week</span></div>
      {recent.length ? (
        <ul className="rows">
          {recent.map((w) => (
            <li key={w.id} className="row">
              <span className="row-title">
                <b>{w.name}</b>{' '}
                <span className="muted">
                  · {w.durationMin ? `${w.durationMin} min · ` : ''}{w.sets} sets{w.prs.length ? ` · ${w.prs.length} PR${w.prs.length > 1 ? 's' : ''}` : ''}
                </span>
              </span>
              <span className="meta">{w.date === today ? 'Today' : fmt(w.date, { month: 'short', day: 'numeric' })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Finish a workout in fit+ and it shows up here, with its XP, coins and PRs. Same sign-in in both apps.</p>
      )}
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
  const W = 340, H = 112, L = 34, R = 14, T = 8, B = 20;
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
