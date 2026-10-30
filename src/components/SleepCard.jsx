import { useMemo } from 'react';
import { useKind } from '../store.js';
import { addDays, fmt, fmtDur, minToLabel, todayISO } from '../lib/dates.js';

const GOAL = 8 * 60;
const STAGES = [
  { id: 'deep', label: 'Deep' },
  { id: 'core', label: 'Core' },
  { id: 'rem', label: 'REM' },
  { id: 'awake', label: 'Awake' },
];

// Clock times as minutes on a night's own axis, where 6pm the evening before is 0 (so midnight is 360).
const onAxis = (m) => (m >= 18 * 60 ? m - 18 * 60 : m + 6 * 60);
const fromAxis = (a) => (a + 18 * 60) % 1440;

/** Sleep from Apple Health: last night, the last 7 nights' schedule, and last night's stages. */
export default function SleepCard() {
  const health = useKind('health');
  const today = todayISO();
  const byDate = useMemo(() => Object.fromEntries(health.filter((h) => h.sleepMin).map((h) => [h.date, h])), [health]);
  const nights = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const have = nights.filter((d) => byDate[d]);
  const lastDate = [...Object.keys(byDate)].sort().at(-1);
  const last = lastDate && byDate[lastDate];

  if (!last) {
    return (
      <section className="card" aria-labelledby="sl-h">
        <div className="card-head"><h2 id="sl-h">Sleep</h2></div>
        <p className="empty" style={{ marginTop: 0 }}>Sleep from Apple Health shows up here once your Shortcut sends it.</p>
      </section>
    );
  }

  const avg = have.length ? Math.round(have.reduce((a, d) => a + byDate[d].sleepMin, 0) / have.length) : null;
  const timed = have.filter((d) => byDate[d].bedMin != null);
  const avgClock = (key) => {
    if (!timed.length) return null;
    const a = timed.reduce((s, d) => s + onAxis(byDate[d][key]), 0) / timed.length;
    return { min: fromAxis(Math.round(a)), axis: a };
  };
  const bed = avgClock('bedMin');
  const wake = avgClock('wakeMin');
  // How much bedtime moves around, as the typical distance from the average.
  const spread = bed && timed.length > 2
    ? Math.round(timed.reduce((s, d) => s + Math.abs(onAxis(byDate[d].bedMin) - bed.axis), 0) / timed.length)
    : null;
  const lastLabel = lastDate === today ? 'Last night' : fmt(lastDate, { weekday: 'long' });

  return (
    <section className="card sleep-card" aria-labelledby="sl-h">
      <div className="card-head">
        <h2 id="sl-h">Sleep</h2>
        <span className="meta">{lastLabel} {fmtDur(last.sleepMin)}</span>
      </div>

      <div className="hero-row">
        <div>
          <div className="label">{lastLabel}</div>
          <div className="big">{fmtDur(last.sleepMin).replace(/(\d+)h/, '$1h')}</div>
          {last.bedMin != null && (
            <div className="label sl-window">{minToLabel(last.bedMin)} – {minToLabel(last.wakeMin)}</div>
          )}
        </div>
        {avg !== null && (
          <div className="right">
            <div className="label">7-night average</div>
            <div className="delta">{fmtDur(avg)}</div>
            <div className={`label sl-goal${avg >= GOAL - 15 ? ' ok' : ''}`}>
              {avg >= GOAL - 15 ? 'Around your 8h goal' : `${fmtDur(GOAL - avg)} under 8h`}
            </div>
          </div>
        )}
      </div>

      <SleepSchedule nights={nights} byDate={byDate} today={today} />

      {(bed || spread !== null) && (
        <div className="sl-facts">
          {bed && <span><b>{minToLabel(bed.min)}</b> usual bedtime</span>}
          {wake && <span><b>{minToLabel(wake.min)}</b> usual wake-up</span>}
          {spread !== null && <span><b>±{fmtDur(spread)}</b> bedtime swing</span>}
        </div>
      )}

      {last.stages && STAGES.some((s) => last.stages[s.id]) && <Stages stages={last.stages} label={lastLabel} />}
    </section>
  );
}

/** Each night as a bar from bedtime (top) to wake-up (bottom), with hours slept underneath. */
function SleepSchedule({ nights, byDate, today }) {
  const timed = nights.map((d) => byDate[d]).filter((n) => n && n.bedMin != null);
  // Fit the clock range to the data: at least 10pm–8am, in whole hours.
  let top = onAxis(22 * 60);
  let bottom = onAxis(8 * 60);
  for (const n of timed) {
    top = Math.min(top, onAxis(n.bedMin));
    bottom = Math.max(bottom, onAxis(n.wakeMin));
  }
  top = Math.floor(top / 60) * 60;
  bottom = Math.ceil(bottom / 60) * 60;
  const W = 340, H = 190, L = 40, R = 6, T = 8, B = 36;
  const col = (W - L - R) / nights.length;
  const y = (a) => T + (H - T - B) * ((a - top) / (bottom - top));
  const ticks = [];
  const step = bottom - top > 12 * 60 ? 180 : 120;
  for (let a = top; a <= bottom; a += step) ticks.push(a);

  return (
    <svg className="chart sl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bedtime and wake-up for the last 7 nights">
      {ticks.map((a) => (
        <g key={a}>
          <line x1={L} x2={W - R} y1={y(a)} y2={y(a)} className="grid" />
          <text x={L - 6} y={y(a) + 4} textAnchor="end">{minToLabel(fromAxis(a))}</text>
        </g>
      ))}
      {nights.map((d, i) => {
        const n = byDate[d];
        const cx = L + col * i + col / 2;
        const w = Math.min(22, col * 0.56);
        return (
          <g key={d}>
            {n && n.bedMin != null ? (
              <rect
                x={cx - w / 2}
                y={y(onAxis(n.bedMin))}
                width={w}
                height={Math.max(4, y(onAxis(n.wakeMin)) - y(onAxis(n.bedMin)))}
                rx={w / 2.6}
                className={`sl-bar${n.sleepMin >= GOAL - 15 ? ' good' : n.sleepMin < 6 * 60 ? ' short' : ''}`}
              />
            ) : (
              <rect x={cx - w / 2} y={y(top) + 4} width={w} height={H - T - B - 8} rx={w / 2.6} className="sl-none" />
            )}
            <text x={cx} y={H - 20} textAnchor="middle" className="sl-hrs">{n ? (n.sleepMin / 60).toFixed(1) : '–'}</text>
            <text x={cx} y={H - 5} textAnchor="middle" className={d === today ? 'sl-today' : ''}>{fmt(d, { weekday: 'narrow' })}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Last night's time in each stage, as one bar and a legend. */
function Stages({ stages, label }) {
  const parts = STAGES.map((s) => ({ ...s, min: stages[s.id] || 0 })).filter((s) => s.min > 0);
  const total = parts.reduce((a, p) => a + p.min, 0);
  return (
    <div className="sl-stages">
      <p className="school-sub">Stages · {label.toLowerCase()}</p>
      <div className="sl-stack" role="img" aria-label={parts.map((p) => `${p.label} ${fmtDur(p.min)}`).join(', ')}>
        {parts.map((p) => (
          <i key={p.id} className={`st-${p.id}`} style={{ flexGrow: p.min }} />
        ))}
      </div>
      <ul className="sl-legend">
        {parts.map((p) => (
          <li key={p.id}>
            <i className={`st-${p.id}`} aria-hidden="true" />
            <span>{p.label}</span>
            <b>{fmtDur(p.min)}</b>
            <span className="pct">{Math.round((p.min / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
