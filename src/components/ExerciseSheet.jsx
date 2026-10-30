import { fmt, todayISO } from '../lib/dates.js';
import { e1rm } from '../lib/lifting.js';
import { Sheet } from './ui.jsx';

const r1 = (v) => Math.round(v);
const unitOf = (x) => (x.kind === 'time' ? ` ${x.unit || 'sec'}` : '');

/** One exercise's history: a trend chart and every session's sets. */
export default function ExerciseSheet({ ex, onClose }) {
  const today = todayISO();
  const pts = ex.scores;
  const first = pts[0];
  const last = pts.at(-1);
  const change = pts.length > 1 && first.score ? Math.round(((last.score - first.score) / first.score) * 100) : null;
  const sessions = [...ex.sessions].reverse();

  return (
    <Sheet title={ex.name} onClose={onClose}>
      <div className="ex-hist">
        <div className="rv-stats ex-stats">
          {ex.weighted ? (
            <>
              <div><b>{r1(ex.best.score)}</b><span>best est. max (lb)</span></div>
              <div><b>{ex.best.wt}×{ex.best.reps}</b><span>that set</span></div>
            </>
          ) : (
            <div><b>{ex.best.score}{unitOf(ex)}</b><span>best {ex.kind === 'time' ? 'time' : 'reps'}</span></div>
          )}
          <div><b>{pts.length}</b><span>session{pts.length === 1 ? '' : 's'}</span></div>
          {change !== null && (
            <div><b className={change >= 0 ? 'up' : 'down'}>{change > 0 ? '+' : ''}{change}%</b><span>since the first</span></div>
          )}
        </div>

        {pts.length > 1 ? (
          <TrendChart pts={pts} weighted={ex.weighted} />
        ) : (
          <p className="empty">Do it once more to start a trend line.</p>
        )}
        <p className="card-sub">
          {ex.weighted
            ? 'Each dot is that day’s best set as an estimated one-rep max (weight × reps, Epley), so heavier sets and more reps both count.'
            : `Each dot is that day’s best ${ex.kind === 'time' ? 'time' : 'set'}.`}
        </p>

        <h3 className="mini-h">Every session</h3>
        <ul className="rows ex-sessions">
          {sessions.map((s, i) => {
            const best = Math.max(...s.sets.map((x) => e1rm(x.wt, x.reps)));
            return (
              <li key={s.at + i} className="row">
                <span className="row-title">
                  <span className="ex-sets">
                    {s.sets.map((x, j) => (
                      <span key={j} className={ex.weighted && e1rm(x.wt, x.reps) === best ? 'top' : ''}>
                        {x.wt > 0 ? `${x.wt}×${x.reps}` : `${x.reps}${unitOf(ex)}`}
                      </span>
                    ))}
                  </span>
                  <span className="task-meta"><span>{s.workout}</span></span>
                </span>
                <span className="meta">{s.date === today ? 'Today' : fmt(s.date, { month: 'short', day: 'numeric' })}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

function TrendChart({ pts, weighted }) {
  const W = 340, H = 160, L = 34, R = 12, T = 12, B = 22;
  const vals = pts.map((p) => p.score);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(1, (hi - lo) * 0.15);
  lo = Math.max(0, Math.floor(lo - pad));
  hi = Math.ceil(hi + pad);
  const x = (i) => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const bestI = vals.indexOf(Math.max(...vals));
  return (
    <svg className="chart ex-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={weighted ? 'Estimated max over time' : 'Best set over time'}>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      <polyline className="trend" points={pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')} />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r={i === bestI ? 5 : 3} className={i === bestI ? 'end' : 'dot'} />
      ))}
      <text x={L} y={H - 5}>{fmt(pts[0].date, { month: 'short', day: 'numeric' })}</text>
      <text x={W - R} y={H - 5} textAnchor="end">{fmt(pts.at(-1).date, { month: 'short', day: 'numeric' })}</text>
    </svg>
  );
}
