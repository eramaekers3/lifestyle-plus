import { useMemo, useState } from 'react';
import { remove, saveSettings, useKind, useSettings } from '../store.js';
import { addDays, fmt, parse, todayISO, weekStart } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { Sheet } from './ui.jsx';

const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '6m', label: '6M', days: 182 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
];
const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${r1(Math.abs(v))}`;

/** Average of weigh-ins in the 7 days ending on `date`. */
const avg7 = (all, date) => {
  const xs = all.filter((w) => w.date <= date && w.date > addDays(date, -7));
  return xs.length ? xs.reduce((a, w) => a + w.lbs, 0) / xs.length : null;
};

/** Pounds per week from a least-squares line through the 7-day averages. */
function ratePerWeek(points) {
  if (points.length < 4) return null;
  const xs = points.map((p) => parse(p.date).getTime() / (7 * 864e5));
  const ys = points.map((p) => p.avg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : null;
}

/** Weight in depth: any time range, trend per week, a goal with a projected date, and every weigh-in. */
export default function WeightSheet({ onClose }) {
  const weights = useKind('weight');
  const { weightGoal } = useSettings();
  const today = todayISO();
  const all = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const [range, setRange] = useState('3m');
  const [showAll, setShowAll] = useState(false);
  const [goalText, setGoalText] = useState(weightGoal ? String(weightGoal) : '');

  const r = RANGES.find((x) => x.id === range);
  const from = r.days ? addDays(today, -(r.days - 1)) : (all[0] && all[0].date) || today;
  const pts = all.filter((w) => w.date >= from).map((w) => ({ ...w, avg: avg7(all, w.date) }));
  const first = pts[0];
  const last = pts.at(-1);
  const rate = ratePerWeek(pts);
  const change = first && last ? last.avg - first.avg : null;
  const lo = pts.length ? pts.reduce((a, p) => (p.lbs < a.lbs ? p : a)) : null;
  const hi = pts.length ? pts.reduce((a, p) => (p.lbs > a.lbs ? p : a)) : null;

  const goal = weightGoal || null;
  const nowAvg = last ? last.avg : null;
  let projection = null;
  if (goal && nowAvg !== null && rate) {
    const toGo = goal - nowAvg;
    if (Math.abs(toGo) < 0.5) projection = { text: 'You’re at your goal.' };
    else if (Math.sign(toGo) === Math.sign(rate)) {
      const weeks = toGo / rate;
      const when = addDays(today, Math.round(weeks * 7));
      projection = { text: `At this pace, around ${fmt(when, { month: 'short', day: 'numeric', ...(weeks > 40 ? { year: 'numeric' } : {}) })} (${Math.round(weeks)} week${Math.round(weeks) === 1 ? '' : 's'}).` };
    } else projection = { text: `The trend is heading away from ${goal} lb right now.` };
  }

  // Weekly averages, newest first.
  const weeks = useMemo(() => {
    const m = new Map();
    for (const w of pts) {
      const k = weekStart(w.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w.lbs);
    }
    const list = [...m.entries()].map(([k, xs]) => ({ week: k, avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }));
    return list.map((w, i) => ({ ...w, diff: i ? w.avg - list[i - 1].avg : null })).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights, range]);

  // Green when a change moves toward your goal (no colors without a goal: up or down isn't good or bad by itself).
  const toward = (d) => (goal && nowAvg !== null && d && Math.sign(d) === Math.sign(goal - nowAvg) ? ' good' : '');
  const entries = [...pts].reverse();
  const shownEntries = showAll ? entries : entries.slice(0, 10);

  const saveGoal = () => {
    const v = parseFloat(goalText);
    if (!goalText.trim()) {
      saveSettings({ weightGoal: null });
      return;
    }
    if (v > 50 && v < 600 && v !== weightGoal) {
      saveSettings({ weightGoal: Math.round(v * 10) / 10 });
      toast('Goal saved');
    }
  };

  return (
    <Sheet title="Weight" onClose={onClose}>
      <div className="seg wt-range" role="group" aria-label="Time range">
        {RANGES.map((x) => (
          <button key={x.id} aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{x.label}</button>
        ))}
      </div>

      {pts.length < 2 ? (
        <p className="empty">Not enough weigh-ins in this range yet.</p>
      ) : (
        <>
          <div className="rv-stats wt-stats">
            <div><b>{r1(nowAvg)}</b><span>7-day avg</span></div>
            <div><b className={toward(change)}>{signed(change)}</b><span>lb this range</span></div>
            <div><b className={toward(rate)}>{rate === null ? '—' : signed(rate)}</b><span>lb / week</span></div>
          </div>

          <BigChart pts={pts} from={from} today={today} goal={goal} />
          <p className="card-sub wt-legend">
            <span><i className="lg-dot" aria-hidden="true" /> weigh-in</span>
            <span><i className="lg-line" aria-hidden="true" /> 7-day average</span>
            {goal && <span><i className="lg-goal" aria-hidden="true" /> goal</span>}
          </p>

          <div className="wt-facts">
            <span>Low <b>{r1(lo.lbs)}</b> · {fmt(lo.date, { month: 'short', day: 'numeric' })}</span>
            <span>High <b>{r1(hi.lbs)}</b> · {fmt(hi.date, { month: 'short', day: 'numeric' })}</span>
            <span><b>{pts.length}</b> weigh-ins</span>
          </div>
        </>
      )}

      <section className="wt-sec">
        <p className="school-sub">Goal</p>
        <form className="inline" onSubmit={(e) => (e.preventDefault(), saveGoal())}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onBlur={saveGoal}
            placeholder="Goal weight (lb)"
            aria-label="Goal weight in pounds"
          />
          <button className="btn ghost">Save</button>
        </form>
        {goal && nowAvg !== null && (
          <p className="muted small">
            {r1(Math.abs(goal - nowAvg))} lb to {goal > nowAvg ? 'gain' : 'lose'}. {projection ? projection.text : 'A few more weeks of weigh-ins will show a pace.'}
          </p>
        )}
      </section>

      {weeks.length > 1 && (
        <section className="wt-sec">
          <p className="school-sub">Week by week</p>
          <ul className="rows wt-weeks">
            {weeks.slice(0, 12).map((w) => (
              <li key={w.week} className="row">
                <span className="row-title">Week of {fmt(w.week, { month: 'short', day: 'numeric' })}<span className="muted small"> · {w.n} weigh-in{w.n === 1 ? '' : 's'}</span></span>
                <b className="wt-num">{r1(w.avg)}</b>
                <span className={`wt-diff${toward(w.diff)}`}>{w.diff === null ? '' : signed(w.diff)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length > 0 && (
        <section className="wt-sec">
          <p className="school-sub">Weigh-ins</p>
          <ul className="rows wt-entries">
            {shownEntries.map((w, i) => {
              const prev = entries[i + 1];
              const d = prev ? w.lbs - prev.lbs : null;
              return (
                <li key={w.id} className="row">
                  <span className="row-title">
                    {w.date === today ? 'Today' : fmt(w.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {w.source && <span className="muted small"> · {w.source}</span>}
                  </span>
                  <b className="wt-num">{r1(w.lbs)}</b>
                  <span className="wt-diff">{d === null ? '' : signed(d)}</span>
                  <button className="x" onClick={() => (remove(w.id), toast('Weigh-in deleted'))} aria-label={`Delete the weigh-in from ${w.date}`}>×</button>
                </li>
              );
            })}
          </ul>
          {!showAll && entries.length > shownEntries.length && (
            <button className="mini" onClick={() => setShowAll(true)}>Show all {entries.length}</button>
          )}
        </section>
      )}
    </Sheet>
  );
}

function BigChart({ pts, from, today, goal }) {
  const vals = pts.flatMap((p) => [p.lbs, p.avg]).concat(goal ? [goal] : []);
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const start = pts[0].date < addDays(today, -6) ? (from < pts[0].date ? pts[0].date : from) : addDays(today, -6);
  const W = 340, H = 200, L = 36, R = 14, T = 10, B = 22;
  const x0 = parse(start).getTime();
  const span = Math.max(1, parse(today).getTime() - x0);
  const x = (d) => L + (W - L - R) * ((parse(d).getTime() - x0) / span);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const n = hi - lo <= 4 ? 4 : 3;
  const ticks = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const dotR = pts.length > 90 ? 1.6 : pts.length > 40 ? 2.2 : 3;
  const mid = fmt(addDays(start, Math.round(span / 864e5 / 2)), { month: 'short', day: 'numeric' });
  return (
    <svg className="chart wt-chart wt-big" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weigh-ins and 7-day average">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{+v.toFixed(1)}</text>
        </g>
      ))}
      {goal && (
        <g>
          <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} className="goal" />
          <text x={W - R} y={y(goal) - 4} textAnchor="end" className="goal-t">goal {goal}</text>
        </g>
      )}
      <polyline className="trend" points={pts.map((p) => `${x(p.date)},${y(p.avg)}`).join(' ')} />
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.lbs)} r={dotR} className="dot" />)}
      <circle cx={x(pts.at(-1).date)} cy={y(pts.at(-1).lbs)} r="4.5" className="latest" />
      <text x={L} y={H - 5}>{fmt(start, { month: 'short', day: 'numeric' })}</text>
      <text x={(L + W - R) / 2} y={H - 5} textAnchor="middle">{mid}</text>
      <text x={W - R} y={H - 5} textAnchor="end">Today</text>
    </svg>
  );
}
