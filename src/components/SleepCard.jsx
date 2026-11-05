import { useMemo, useRef, useState } from 'react';
import { put, remove, useKind } from '../store.js';
import { addDays, fmt, fmtDur, minToLabel, todayISO } from '../lib/dates.js';
import { idFor } from '../lib/ids.js';
import { compareWithApple, levelFor, scoreAll } from '../lib/sleepScore.js';
import { useSwipe } from '../lib/swipe.js';
import { Icon, Sheet } from './ui.jsx';

const GOAL = 8 * 60;
const STAGES = [
  { id: 'deep', code: 'd', label: 'Deep' },
  { id: 'core', code: 'c', label: 'Core' },
  { id: 'rem', code: 'r', label: 'REM' },
  { id: 'awake', code: 'w', label: 'Awake' },
];
const CODE_CLASS = { d: 'st-deep', c: 'st-core', r: 'st-rem', w: 'st-awake', s: 'st-asleep' };

// Clock times as minutes on a night's own axis, where 6pm the evening before is 0 (so midnight is 360).
const onAxis = (m) => (m >= 18 * 60 ? m - 18 * 60 : m + 6 * 60);
const fromAxis = (a) => (((a + 18 * 60) % 1440) + 1440) % 1440;
const nightName = (d, today) =>
  d === today ? 'Last night' : d === addDays(today, -1) ? 'The night before' : `${fmt(addDays(d, -1), { weekday: 'short' })} night`;

function useNights() {
  const health = useKind('health');
  return useMemo(() => Object.fromEntries(health.filter((h) => h.sleepMin).map((h) => [h.date, h])), [health]);
}

/** Apple's own scores, entered by hand for nights you want to compare. */
function useApple() {
  const rows = useKind('applesleep');
  return useMemo(() => Object.fromEntries(rows.map((r) => [r.date, r])), [rows]);
}

/** Sleep from Apple Health: last night, the last 7 nights' schedule with stages, and last night's stages. */
export default function SleepCard() {
  const byDate = useNights();
  const scores = useMemo(() => scoreAll(byDate), [byDate]);
  const today = todayISO();
  const [open, setOpen] = useState(null);
  const nights = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const have = nights.filter((d) => byDate[d]);
  const lastDate = Object.keys(byDate).sort().at(-1);
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
  const spread = bed && timed.length > 2
    ? Math.round(timed.reduce((s, d) => s + Math.abs(onAxis(byDate[d].bedMin) - bed.axis), 0) / timed.length)
    : null;
  const lastLabel = nightName(lastDate, today);
  const hasSegs = have.some((d) => byDate[d].segs && byDate[d].segs.length);

  return (
    <section className="card sleep-card" aria-labelledby="sl-h">
      <div className="card-head">
        <h2 id="sl-h">Sleep</h2>
        <span className="meta">{lastLabel} {fmtDur(last.sleepMin)}</span>
      </div>

      <button className="sl-open" onClick={() => setOpen(lastDate)} aria-label={`Open ${lastLabel.toLowerCase()} in detail`}>
        <div className="hero-row">
          <div>
            <div className="label">{lastLabel}</div>
            <div className="big">{fmtDur(last.sleepMin)}</div>
            {last.bedMin != null && <div className="label sl-window">{minToLabel(last.bedMin)} – {minToLabel(last.wakeMin)}</div>}
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
      </button>

      {scores[lastDate] && <ScoreSummary s={scores[lastDate]} label={lastLabel} week={have.map((d) => scores[d]).filter(Boolean)} onOpen={() => setOpen(lastDate)} />}

      <SleepSchedule nights={nights} byDate={byDate} today={today} onPick={setOpen} />
      {hasSegs && <StageKey />}

      {(bed || spread !== null) && (
        <div className="sl-facts">
          {bed && <span><b>{minToLabel(bed.min)}</b> usual bedtime</span>}
          {wake && <span><b>{minToLabel(wake.min)}</b> usual wake-up</span>}
          {spread !== null && <span><b>±{fmtDur(spread)}</b> bedtime swing</span>}
        </div>
      )}
      <p className="sl-tap">Tap a night for the details; swipe between nights.</p>

      {open && <SleepSheet start={open} byDate={byDate} scores={scores} onClose={() => setOpen(null)} />}
    </section>
  );
}

function StageKey() {
  return (
    <div className="sl-key" aria-hidden="true">
      {STAGES.map((s) => (
        <span key={s.id}><i className={`st-${s.id}`} />{s.label}</span>
      ))}
    </div>
  );
}

/** Each night as a bar from bedtime (top) to wake-up (bottom), colored by stage as the night went. */
function SleepSchedule({ nights, byDate, today, onPick }) {
  const timed = nights.map((d) => byDate[d]).filter((n) => n && n.bedMin != null);
  let top = onAxis(22 * 60);
  let bottom = onAxis(8 * 60);
  for (const n of timed) {
    top = Math.min(top, onAxis(n.bedMin));
    bottom = Math.max(bottom, onAxis(n.wakeMin));
  }
  top = Math.floor(top / 60) * 60;
  bottom = Math.ceil(bottom / 60) * 60;
  const W = 340, H = 196, L = 40, R = 6, T = 8, B = 36;
  const col = (W - L - R) / nights.length;
  const y = (a) => T + (H - T - B) * ((a - top) / (bottom - top));
  const ticks = [];
  const step = bottom - top > 12 * 60 ? 180 : 120;
  for (let a = top; a <= bottom; a += step) ticks.push(a);

  return (
    <svg className="chart sl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bedtime, wake-up and sleep stages for the last 7 nights">
      <defs>
        {nights.map((d, i) => {
          const n = byDate[d];
          if (!n || n.bedMin == null) return null;
          const cx = L + col * i + col / 2;
          const w = Math.min(22, col * 0.56);
          return (
            <clipPath key={d} id={`slc-${d}`}>
              <rect x={cx - w / 2} y={y(onAxis(n.bedMin))} width={w} height={Math.max(4, y(onAxis(n.wakeMin)) - y(onAxis(n.bedMin)))} rx={w / 2.6} />
            </clipPath>
          );
        })}
      </defs>
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
        const segs = n && n.segs && n.segs.length ? n.segs : null;
        return (
          <g key={d} className={n ? 'sl-night' : ''} onClick={n ? () => onPick(d) : undefined}>
            {/* A wide invisible target so the whole column is tappable. */}
            {n && <rect x={L + col * i} y={T} width={col} height={H - T} className="sl-hit" />}
            {n && n.bedMin != null ? (
              segs ? (
                <g clipPath={`url(#slc-${d})`}>
                  {segs.map(([a, b, c], k) => (
                    <rect key={k} x={cx - w / 2} y={y(a) - 0.4} width={w} height={Math.max(1, y(b) - y(a) + 0.8)} className={`seg ${CODE_CLASS[c]}`} />
                  ))}
                </g>
              ) : (
                <rect
                  x={cx - w / 2}
                  y={y(onAxis(n.bedMin))}
                  width={w}
                  height={Math.max(4, y(onAxis(n.wakeMin)) - y(onAxis(n.bedMin)))}
                  rx={w / 2.6}
                  className={`sl-bar${n.sleepMin >= GOAL - 15 ? ' good' : n.sleepMin < 6 * 60 ? ' short' : ''}`}
                />
              )
            ) : (
              <rect x={cx - w / 2} y={y(top) + 4} width={w} height={H - T - B - 8} rx={w / 2.6} className="sl-none" />
            )}
            <text x={cx} y={H - 20} textAnchor="middle" className={`sl-hrs${n && n.sleepMin >= GOAL - 15 ? ' good' : ''}`}>{n ? (n.sleepMin / 60).toFixed(1) : '–'}</text>
            <text x={cx} y={H - 5} textAnchor="middle" className={d === today ? 'sl-today' : ''}>{fmt(d, { weekday: 'narrow' })}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- One night in detail ---------- */

/** One night at a time; swipe or use the arrows to go between nights. */
function SleepSheet({ start, byDate, scores, onClose }) {
  const today = todayISO();
  const apple = useApple();
  const dates = Object.keys(byDate).sort();
  const [date, setDate] = useState(start);
  const [enter, setEnter] = useState(0);
  const i = dates.indexOf(date);
  const go = (dir) => {
    const next = dates[i + dir];
    if (!next) return;
    setEnter(dir);
    setDate(next);
  };
  const pager = useRef(null);
  useSwipe(pager, { onSwipe: go, can: (dir) => !!dates[i + dir], claim: true });
  const n = byDate[date];
  // The 7 nights before this one, for comparison.
  const prior = dates.slice(Math.max(0, i - 7), i).map((d) => byDate[d]);
  const avg = prior.length ? Math.round(prior.reduce((a, x) => a + x.sleepMin, 0) / prior.length) : null;

  return (
    <Sheet title="Sleep" onClose={onClose}>
      <div className="sl-nav">
        <button className="icon-btn" onClick={() => go(-1)} disabled={i <= 0} aria-label="Previous night"><Icon name="left" /></button>
        <div className="sl-nav-t">
          <b>{nightName(date, today)}</b>
          <span>{fmt(addDays(date, -1), { weekday: 'short', month: 'short', day: 'numeric' })} → {fmt(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        <button className="icon-btn" onClick={() => go(1)} disabled={i >= dates.length - 1} aria-label="Next night"><Icon name="right" /></button>
      </div>
      <div className="pager" ref={pager}>
        <div key={date} className={`sl-night-page${enter ? (enter > 0 ? ' enter-next' : ' enter-prev') : ''}`}>
          <div className="rv-stats sl-stats">
            <div><b>{fmtDur(n.sleepMin)}</b><span>asleep</span></div>
            {n.bedMin != null && <div><b>{minToLabel(n.bedMin)}</b><span>fell asleep</span></div>}
            {n.wakeMin != null && <div><b>{minToLabel(n.wakeMin)}</b><span>woke up</span></div>}
            {avg !== null && (
              <div>
                <b className={n.sleepMin >= avg ? 'up' : 'down'}>{n.sleepMin >= avg ? '+' : '−'}{fmtDur(Math.abs(n.sleepMin - avg))}</b>
                <span>vs. week before</span>
              </div>
            )}
          </div>

          {scores[date] && <ScoreDetail s={scores[date]} n={n} date={date} apple={apple[date]} />}
          <ScoreTrend scores={scores} end={date} onPick={setDate} />
          <AppleMatch scores={scores} apple={apple} />

          {n.segs && n.segs.length ? (
            <>
              <p className="school-sub">Through the night</p>
              <Hypnogram segs={n.segs} />
            </>
          ) : (
            <p className="muted small">Stage timing shows up for nights synced from now on.</p>
          )}

          {n.stages && STAGES.some((s) => n.stages[s.id]) && <Stages stages={n.stages} />}

          {n.segs && n.segs.length > 0 && <NightNotes n={n} />}
        </div>
      </div>
      <p className="sl-tap" style={{ textAlign: 'center' }}>Swipe left or right for other nights.</p>
    </Sheet>
  );
}

/** Apple-style stage chart: Awake on top, then REM, Core, Deep, across the night. */
function Hypnogram({ segs }) {
  const ROW = { w: 0, r: 1, c: 2, d: 3, s: 2 };
  const NAMES = ['Awake', 'REM', 'Core', 'Deep'];
  const from = Math.floor((segs[0][0] - 10) / 60) * 60;
  const to = Math.ceil((Math.max(...segs.map((s) => s[1])) + 10) / 60) * 60;
  const W = 340, H = 168, L = 46, R = 16, T = 6, B = 22;
  const rowH = (H - T - B) / 4;
  const x = (a) => L + (W - L - R) * ((a - from) / (to - from));
  const ticks = [];
  const step = to - from > 9 * 60 ? 120 : 60;
  for (let a = from; a <= to; a += step) ticks.push(a);
  const order = [...segs].sort((p, q) => p[0] - q[0]);
  return (
    <svg className="chart sl-hyp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sleep stages through the night">
      {NAMES.map((name, r) => (
        <g key={name}>
          <rect x={L} y={T + r * rowH} width={W - L - R} height={rowH} className={r % 2 ? 'band' : 'band alt'} />
          <text x={L - 6} y={T + r * rowH + rowH / 2 + 4} textAnchor="end">{name}</text>
        </g>
      ))}
      {ticks.map((a) => (
        <text key={a} x={x(a)} y={H - 5} textAnchor="middle">{minToLabel(fromAxis(a))}</text>
      ))}
      {/* Thin lines joining one stage to the next, like the Health app. */}
      {order.slice(1).map((s, k) => {
        const p = order[k];
        const y1 = T + ROW[p[2]] * rowH + rowH / 2;
        const y2 = T + ROW[s[2]] * rowH + rowH / 2;
        return y1 === y2 ? null : <line key={k} x1={x(s[0])} x2={x(s[0])} y1={y1} y2={y2} className="hyp-join" />;
      })}
      {order.map(([a, b, c], k) => (
        <rect key={k} x={x(a)} y={T + ROW[c] * rowH + 3} width={Math.max(1.2, x(b) - x(a))} height={rowH - 6} rx="2.5" className={`seg ${CODE_CLASS[c]}`} />
      ))}
    </svg>
  );
}

/** Time in each stage, as one bar and a legend. */
function Stages({ stages }) {
  const parts = STAGES.map((s) => ({ ...s, min: stages[s.id] || 0 })).filter((s) => s.min > 0);
  const total = parts.reduce((a, p) => a + p.min, 0);
  return (
    <div className="sl-stages">
      <p className="school-sub">Time in each stage</p>
      <div className="sl-stack" role="img" aria-label={parts.map((p) => `${p.label} ${fmtDur(p.min)}`).join(', ')}>
        {parts.map((p) => <i key={p.id} className={`st-${p.id}`} style={{ flexGrow: p.min }} />)}
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

/** A few plain facts worked out from the stage timeline. */
function NightNotes({ n }) {
  const segs = n.segs;
  const wakes = segs.filter((s) => s[2] === 'w' && s[1] - s[0] >= 2);
  const firstDeep = segs.find((s) => s[2] === 'd');
  const remByHalf = (() => {
    const mid = (segs[0][0] + segs[segs.length - 1][1]) / 2;
    const rem = segs.filter((s) => s[2] === 'r');
    const late = rem.reduce((a, s) => a + Math.max(0, s[1] - Math.max(s[0], mid)), 0);
    const all = rem.reduce((a, s) => a + s[1] - s[0], 0);
    return all ? Math.round((late / all) * 100) : null;
  })();
  const notes = [];
  notes.push(wakes.length ? `Woke up ${wakes.length} time${wakes.length === 1 ? '' : 's'} (2 min or longer).` : 'No wake-ups of 2 minutes or longer.');
  if (firstDeep) notes.push(`First deep sleep about ${fmtDur(Math.max(0, firstDeep[0] - segs[0][0]))} after falling asleep.`);
  if (remByHalf !== null) notes.push(`${remByHalf}% of REM came in the second half of the night.`);
  return (
    <ul className="sl-notes">
      {notes.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

/* ---------- Sleep score ---------- */

const PARTS = [
  { id: 'duration', label: 'Duration', max: 50 },
  { id: 'bedtime', label: 'Bedtime', max: 30 },
  { id: 'interruptions', label: 'Interruptions', max: 20 },
];

/** The score as a ring, colored by level. */
function ScoreRing({ score, size = 76 }) {
  const lv = levelFor(score);
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ss-ring lv-${lv.cls}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Sleep score ${score}, ${lv.label}`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ss-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ss-fill"
        strokeDasharray={`${(c * score) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="ss-num" style={{ fontSize: size * 0.34 }}>{score}</text>
    </svg>
  );
}

function PartBars({ s }) {
  return (
    <ul className="ss-parts">
      {PARTS.map((p) => (
        <li key={p.id}>
          <span>{p.label}</span>
          <i className="ss-bar"><i style={{ width: `${(s[p.id].pts / p.max) * 100}%` }} /></i>
          <b>{s[p.id].pts}<small>/{p.max}</small></b>
        </li>
      ))}
    </ul>
  );
}

/** Last night's score on the card, with the three parts and the week's average. */
function ScoreSummary({ s, label, week, onOpen }) {
  const avg = week.length > 1 ? Math.round(week.reduce((a, x) => a + x.score, 0) / week.length) : null;
  return (
    <button className="ss-card" onClick={onOpen} aria-label={`${label} sleep score ${s.score}, ${s.level.label}. Open details`}>
      <ScoreRing score={s.score} />
      <div className="ss-side">
        <div className="ss-head">
          <span className="label">Sleep score</span>
          <b className={`ss-level lv-${s.level.cls}`}>{s.level.label}</b>
          {avg !== null && <span className="ss-avg">7-night avg <b>{avg}</b></span>}
        </div>
        <PartBars s={s} />
      </div>
    </button>
  );
}


/** One night's score, with what went into each part in plain words. */
function ScoreDetail({ s, n, date, apple }) {
  const d = s.duration;
  const b = s.bedtime;
  const it = s.interruptions;
  const why = {
    duration: d.staged
      ? `${fmtDur(n.sleepMin)} asleep (${d.total}/40) · deep ${Math.round(d.deepShare * 100)}% (${d.deep}/5) · REM ${Math.round(d.remShare * 100)}% (${d.rem}/5)`
      : `${fmtDur(n.sleepMin)} asleep. No Apple Watch stages, so deep and REM aren't counted against you.`,
    bedtime: b.off === null
      ? 'Needs a few more nights to know your usual bedtime.'
      : Math.abs(b.off) < 5
        ? `Fell asleep right on your usual ${minToLabel(b.usual)}.`
        : `Fell asleep ${fmtDur(Math.abs(b.off))} ${b.off > 0 ? 'later' : 'earlier'} than your usual ${minToLabel(b.usual)} (last ${b.nights} nights).`,
    interruptions: it.estimated
      ? `${fmtDur(it.awake)} awake. Wake-up count needs Apple Watch stage timing.`
      : it.wakes
        ? `${it.wakes} wake-up${it.wakes === 1 ? '' : 's'}, ${fmtDur(it.awake)} awake in the night.`
        : it.awake ? `Only brief stirs, ${fmtDur(it.awake)} awake.` : 'Slept straight through.',
  };
  return (
    <div className="ss-detail">
      <div className="ss-top">
        <ScoreRing score={s.score} size={92} />
        <div>
          <span className="label">Sleep score</span>
          <b className={`ss-level big lv-${s.level.cls}`}>{s.level.label}</b>
          {apple && <AppleLine s={s} apple={apple} />}
        </div>
      </div>
      <ul className="ss-why">
        {PARTS.map((p) => (
          <li key={p.id}>
            <div className="ss-why-h"><span>{p.label}</span><b>{s[p.id].pts}<small>/{p.max}</small></b></div>
            <i className="ss-bar"><i style={{ width: `${(s[p.id].pts / p.max) * 100}%` }} /></i>
            <p>{why[p.id]}</p>
          </li>
        ))}
      </ul>
      <AppleEntry date={date} apple={apple} />
    </div>
  );
}

function AppleLine({ s, apple }) {
  const total = apple.duration + apple.bedtime + apple.interruptions;
  const diff = s.score - total;
  return (
    <span className="ss-apple-line">
      Apple: <b>{total}</b> · {diff === 0 ? 'exact match' : `this app is ${diff > 0 ? '+' : '−'}${Math.abs(diff)}`}
    </span>
  );
}

/** Type in Apple's three numbers from the Health app to see how close this score is. */
function AppleEntry({ date, apple }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({ duration: '', bedtime: '', interruptions: '' });
  const id = idFor(`as:${date}`);
  const start = () => {
    setVals(apple ? { duration: apple.duration, bedtime: apple.bedtime, interruptions: apple.interruptions } : { duration: '', bedtime: '', interruptions: '' });
    setEditing(true);
  };
  const save = (e) => {
    e.preventDefault();
    const out = {};
    for (const p of PARTS) {
      const v = parseInt(vals[p.id], 10);
      if (!Number.isFinite(v) || v < 0 || v > p.max) return;
      out[p.id] = v;
    }
    put('applesleep', { id, date, ...out });
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className="ss-apple">
        <button className="btn ghost small" onClick={start}>{apple ? 'Edit Apple’s score' : 'Compare with Apple’s score'}</button>
        {apple && <button className="btn ghost small" onClick={() => remove(id)}>Remove</button>}
      </div>
    );
  }
  return (
    <form className="ss-apple-form" onSubmit={save}>
      <p className="muted small">From Health → Sleep → Sleep Score, tap this night and type in its three parts.</p>
      <div className="ss-apple-inputs">
        {PARTS.map((p) => (
          <label key={p.id}>
            <span>{p.label}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="0"
              max={p.max}
              value={vals[p.id]}
              onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))}
              placeholder={`/${p.max}`}
              required
            />
          </label>
        ))}
      </div>
      <div className="ss-apple">
        <button className="btn small">Save</button>
        <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

/** The last 14 nights' scores as bars, ending on the night being shown. */
function ScoreTrend({ scores, end, onPick }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(end, i - 13));
  if (days.filter((d) => scores[d]).length < 2) return null;
  const W = 340, H = 112, L = 22, R = 4, T = 14, B = 18;
  const col = (W - L - R) / days.length;
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  return (
    <>
      <p className="school-sub">Score, last 14 nights</p>
      <svg className="chart ss-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sleep scores for the last 14 nights">
        {[40, 60, 80].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 4} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const s = scores[d];
          const x = L + col * i + col * 0.18;
          const w = col * 0.64;
          return (
            <g key={d} className={s ? 'ss-col' : ''} onClick={s ? () => onPick(d) : undefined}>
              {s ? (
                <>
                  <rect x={x} y={y(s.score)} width={w} height={y(0) - y(s.score)} rx={Math.min(4, w / 2)} className={`ss-b lv-${s.level.cls}${d === end ? ' on' : ''}`} />
                  {d === end && <text x={x + w / 2} y={y(s.score) - 4} textAnchor="middle" className="ss-b-n">{s.score}</text>}
                </>
              ) : (
                <rect x={x} y={y(0) - 2} width={w} height={2} className="ss-b none" />
              )}
              <text x={x + w / 2} y={H - 4} textAnchor="middle" className={d === end ? 'sl-today' : ''}>{fmt(d, { weekday: 'narrow' })}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

/** How close this score has been to Apple's, once you've entered Apple's numbers for some nights. */
function AppleMatch({ scores, apple }) {
  const m = compareWithApple(scores, Object.values(apple));
  if (!m) return null;
  const part = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`;
  return (
    <div className="ss-match">
      <p className="school-sub">Compared with Apple ({m.nights} night{m.nights === 1 ? '' : 's'})</p>
      <p className="small">
        Off by <b>{m.total.toFixed(1)}</b> points on average. By part, this app runs{' '}
        duration <b>{part(m.duration)}</b>, bedtime <b>{part(m.bedtime)}</b>, interruptions <b>{part(m.interruptions)}</b>.
      </p>
    </div>
  );
}
