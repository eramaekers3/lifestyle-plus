import { useMemo, useState } from 'react';
import { Icon, Sheet } from '../components/ui.jsx';
import CardStack from '../components/CardStack.jsx';
import JournalEntry from '../components/JournalEntry.jsx';
import { addDays, fmt, todayISO, relDay } from '../lib/dates.js';
import { plural } from '../lib/text.js';
import {
  METRICS, RANGES, MIN_PAIRS, useEntries, filled, inRange, metricSummary, distribution, byWeekday,
  links, strength, journalStreak, bestDays, search, highlight, valueOf,
} from '../lib/journal.js';

const longDay = (d) => fmt(d, { weekday: 'long', month: 'short', day: 'numeric' });
const shortDate = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });

export default function JournalView() {
  const today = todayISO();
  const all = useEntries();
  const entries = useMemo(() => filled(all), [all]);
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(null); // a past day, in a sheet
  const streak = journalStreak(entries, today);
  const label = date === today ? 'Today' : relDay(date) === 'Yesterday' ? 'Yesterday' : shortDate(date);

  return (
    <>
      <header className="page-head">
        <h1>Journal</h1>
        <p>
          {entries.length
            ? `${plural(entries.length, 'day')} written${streak > 1 ? ` · ${streak} days in a row` : ''}. Tap any past day to read it again.`
            : 'Write down what mattered today and rate how it went. The patterns show up after a week or two.'}
        </p>
      </header>

      <CardStack
        page="journal"
        cards={[
          {
            id: 'write',
            title: 'Write',
            node: (
              <section className="card" aria-labelledby="jw-h">
                <div className="card-head">
                  <h2 id="jw-h">{label}</h2>
                  <div className="stepper">
                    <button className="icon-btn sm" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day">
                      <Icon name="left" size={16} />
                    </button>
                    <button className="mini" onClick={() => setDate(today)} disabled={date === today}>Today</button>
                    <button className="icon-btn sm" onClick={() => setDate((d) => addDays(d, 1))} disabled={date >= today} aria-label="Next day">
                      <Icon name="right" size={16} />
                    </button>
                  </div>
                </div>
                <JournalEntry date={date} key={date} showDay />
              </section>
            ),
          },
          { id: 'stats', title: 'Stats', node: <StatsCard entries={entries} onOpen={setOpen} /> },
          { id: 'past', title: 'Past days', node: <PastCard entries={entries} onOpen={setOpen} /> },
        ]}
      />

      {open && <DaySheet date={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ---------- A past day ---------- */

function DaySheet({ date: start, onClose }) {
  const [date, setDate] = useState(start);
  const today = todayISO();
  return (
    <Sheet title={longDay(date)} onClose={onClose}>
      <div className="jr-sheet-nav">
        <button className="mini" onClick={() => setDate((d) => addDays(d, -1))}><Icon name="left" size={14} /> Day before</button>
        <button className="mini" onClick={() => setDate((d) => addDays(d, 1))} disabled={date >= today}>Day after <Icon name="right" size={14} /></button>
      </div>
      <JournalEntry date={date} key={date} showDay />
    </Sheet>
  );
}

/* ---------- Stats ---------- */

function StatsCard({ entries, onOpen }) {
  const [rangeId, setRangeId] = useState('30');
  const [focus, setFocus] = useState('attitude');
  const range = RANGES.find((r) => r.id === rangeId);
  const { cur, prev, from } = useMemo(() => inRange(entries, range), [entries, range]);
  const rated = useMemo(() => cur.filter((e) => METRICS.some((x) => valueOf(e, x.key) !== null)), [cur]);
  const m = METRICS.find((x) => x.key === focus);
  const pairs = useMemo(() => links(rated), [rated]);
  const best = useMemo(() => bestDays(rated), [rated]);

  return (
    <section className="card" aria-labelledby="js-h">
      <div className="card-head">
        <h2 id="js-h">Stats</h2>
        <span className="meta">{plural(rated.length, 'day')} rated</span>
      </div>
      <div className="seg jr-range" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.id} aria-pressed={r.id === rangeId} onClick={() => setRangeId(r.id)}>{r.label}</button>
        ))}
      </div>

      {!rated.length ? (
        <p className="empty">No ratings in this stretch yet.</p>
      ) : (
        <>
          <div className="jr-tiles">
            {METRICS.map((x) => (
              <Tile key={x.key} m={x} s={metricSummary(cur, prev, x.key)} from={from} on={x.key === focus} onPick={() => setFocus(x.key)} showDelta={!!range.days} />
            ))}
          </div>

          <div className="jr-focus" style={{ '--c': m.color }}>
            <h3 className="jr-sub">{m.label} by weekday</h3>
            <Weekdays rows={byWeekday(rated, m.key)} m={m} />
            <h3 className="jr-sub">How often</h3>
            <Spread counts={distribution(rated, m.key)} m={m} />
          </div>

          <h3 className="jr-sub">What moves together</h3>
          {pairs.length ? (
            <ul className="rows jr-links">
              {pairs.map((p) => (
                <li key={p.a.key + p.b.key} className="row">
                  <span className="row-title">
                    {p.r > 0 ? `Higher ${p.a.label} goes with higher ${p.b.label}` : `Higher ${p.a.label} goes with lower ${p.b.label}`}
                    <span className="muted small">{strength(p.r)} link · r = {p.r.toFixed(2)} over {p.n} days</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              {rated.length < MIN_PAIRS
                ? `Patterns show up after ${MIN_PAIRS} rated days (${rated.length} so far).`
                : 'No ratings that clearly move together yet.'}
            </p>
          )}

          {best.length > 0 && (
            <>
              <h3 className="jr-sub">Best days</h3>
              <p className="muted small" style={{ marginTop: -4 }}>Highest Outlook and Energy together.</p>
              <ul className="rows">
                {best.map((e) => (
                  <PastRow key={e.date} e={e} onOpen={onOpen} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ m, s, from, on, onPick, showDelta }) {
  const up = s.delta !== null && s.delta >= 0.05;
  const down = s.delta !== null && s.delta <= -0.05;
  // Pace isn't good or bad, so its change stays neutral.
  const tone = m.neutral || (!up && !down) ? '' : up ? ' good' : ' bad';
  return (
    <button className={`jr-tile${on ? ' on' : ''}`} style={{ '--c': m.color }} aria-pressed={on} onClick={onPick}>
      <span className="jr-tile-l">{m.label}</span>
      <span className="jr-tile-v">
        {s.avg === null ? '–' : s.avg.toFixed(1)}
        <small>/5</small>
      </span>
      {showDelta && s.delta !== null && (up || down) ? (
        <span className={`jr-delta${tone}`}>{up ? '▲' : '▼'} {Math.abs(s.delta).toFixed(1)}</span>
      ) : (
        <span className="jr-delta">{s.n ? plural(s.n, 'day') : ' '}</span>
      )}
      <Spark pts={s.pts} from={from} />
    </button>
  );
}

function Spark({ pts, from }) {
  if (pts.length < 2) return <svg className="jr-spark" viewBox="0 0 100 26" aria-hidden="true" />;
  const t0 = Date.parse(from);
  const t1 = Math.max(Date.parse(pts[pts.length - 1].date), t0 + 1);
  const x = (d) => 2 + ((Date.parse(d) - t0) / (t1 - t0)) * 96;
  const y = (v) => 23 - ((v - 1) / 4) * 20;
  return (
    <svg className="jr-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.map((p) => `${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />
    </svg>
  );
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Weekdays({ rows, m }) {
  const have = rows.filter((r) => r.avg !== null);
  const hi = have.length > 1 ? Math.max(...have.map((r) => r.avg)) : null;
  const lo = have.length > 1 ? Math.min(...have.map((r) => r.avg)) : null;
  return (
    <div className="jr-wd" role="img" aria-label={`${m.label} average by weekday: ${rows.map((r, i) => `${WD[i]} ${r.avg === null ? 'none' : r.avg.toFixed(1)}`).join(', ')}`}>
      {rows.map((r, i) => (
        <div key={i} className={`jr-wd-col${r.avg !== null && r.avg === hi && hi !== lo ? ' hi' : ''}${r.avg !== null && r.avg === lo && hi !== lo ? ' lo' : ''}`}>
          <span className="jr-wd-v">{r.avg === null ? '' : r.avg.toFixed(1)}</span>
          <span className="jr-wd-bar"><i style={{ height: r.avg === null ? 0 : `${(r.avg / 5) * 100}%` }} /></span>
          <span className="jr-wd-d">{WD[i][0]}</span>
        </div>
      ))}
    </div>
  );
}

function Spread({ counts, m }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="jr-spread" role="img" aria-label={`${m.label} scores: ${counts.map((c, i) => `${i + 1}: ${c}`).join(', ')}`}>
      {counts.map((c, i) => (
        <div key={i} className="jr-spread-row">
          <span className="jr-spread-n">{i + 1}</span>
          <span className="jr-spread-bar"><i style={{ width: `${(c / max) * 100}%` }} /></span>
          <span className="jr-spread-c">{c}</span>
        </div>
      ))}
      <div className="jr-ends small"><span>{m.low}</span><span>{m.high}</span></div>
    </div>
  );
}

/* ---------- Past days and search ---------- */

function PastCard({ entries, onOpen }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(14);
  const results = useMemo(() => (q.trim() ? search(entries, q) : null), [entries, q]);
  const past = entries;

  return (
    <section className="card" aria-labelledby="jp-h">
      <div className="card-head">
        <h2 id="jp-h">Past days</h2>
        <span className="meta">{entries.length}</span>
      </div>
      <input
        className="input jr-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything you’ve written"
        aria-label="Search journal"
        enterKeyHint="search"
      />
      {results ? (
        results.length ? (
          <>
            <p className="muted small">{plural(results.length, 'day')} found</p>
            <ul className="rows">
              {results.map(({ entry, hits }) => (
                <li key={entry.date} className="row jr-hit">
                  <button className="row-title link-row" onClick={() => onOpen(entry.date)}>
                    <b>{shortDate(entry.date)}</b>
                    {hits.slice(0, 3).map((h, i) => (
                      <span key={i} className="jr-snip">
                        {h.where !== 'Moment' && <span className="tag">{h.where}</span>}{' '}
                        {highlight(h.text, q).map((p, j) => (p.hit ? <mark key={j}>{p.text}</mark> : <span key={j}>{p.text}</span>))}
                      </span>
                    ))}
                  </button>
                  <Icon name="right" size={16} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="empty">Nothing matches “{q.trim()}”.</p>
        )
      ) : past.length ? (
        <>
          <ul className="rows">
            {past.slice(0, shown).map((e) => (
              <PastRow key={e.date} e={e} onOpen={onOpen} />
            ))}
          </ul>
          {past.length > shown && (
            <button className="link-btn" onClick={() => setShown((n) => n + 30)}>Show older days</button>
          )}
        </>
      ) : (
        <p className="empty">Your past entries show up here.</p>
      )}
    </section>
  );
}

function PastRow({ e, onOpen }) {
  const moments = (e.moments || []).filter((m) => m.text.trim());
  return (
    <li className="row jr-past">
      <button className="row-title link-row" onClick={() => onOpen(e.date)}>
        <b>{shortDate(e.date)}</b>
        {moments.length > 0 && (
          <span className="jr-preview">
            {moments[0].text}
            {moments.length > 1 && <span className="muted"> +{moments.length - 1} more</span>}
          </span>
        )}
        <span className="jr-dots" aria-label={METRICS.map((m) => `${m.label} ${valueOf(e, m.key) ?? 'not rated'}`).join(', ')}>
          {METRICS.map((m) => {
            const v = valueOf(e, m.key);
            return (
              <span key={m.key} className="jr-dot" style={{ '--c': m.color }}>
                <i aria-hidden="true" />
                {m.label.split(' ')[0]} {v ?? '–'}
              </span>
            );
          })}
        </span>
      </button>
      <Icon name="right" size={16} />
    </li>
  );
}
