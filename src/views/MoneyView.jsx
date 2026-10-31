import { useEffect, useMemo, useState } from 'react';
import { useSyncStatus } from '../store.js';
import { addDays, fmt, todayISO } from '../lib/dates.js';
import {
  useFinance, useBankSync, syncBanks, connectBank, removeBank, setTxnKind, total, money, monthRange, addMonths,
  catLabel, CAT_COLORS, KINDS, merchantOf,
} from '../lib/finance.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet } from '../components/ui.jsx';
import CardStack from '../components/CardStack.jsx';
import { decideRecurring, setCounted } from '../lib/subscriptions.js';

const thisMonth = () => todayISO().slice(0, 7);
const monthName = (ym, opts = { month: 'long' }) => fmt(`${ym}-01`, opts);

export default function MoneyView() {
  const f = useFinance();
  const bank = useBankSync();
  const sync = useSyncStatus();
  const [txn, setTxn] = useState(null);
  const [sub, setSub] = useState(null);
  const signedIn = !!sync.email;

  useEffect(() => {
    if (signedIn && f.items.length) syncBanks(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, f.items.length]);

  if (!f.accounts.length) {
    return (
      <>
        <header className="page-head">
          <h1>Money</h1>
          <p>Connect your banks to see net worth, spending, income, investing and giving in one place.</p>
        </header>
        <Accounts f={f} bank={bank} signedIn={signedIn} />
      </>
    );
  }

  const net = f.snapshots.at(-1);
  return (
    <>
      <header className="page-head">
        <h1>Money</h1>
        <p>
          {bank.syncing ? 'Updating from your banks…' : bank.lastSync ? `Updated ${new Date(bank.lastSync).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : 'From your connected banks.'}
          {bank.error && <span className="err"> {bank.error}</span>}
        </p>
      </header>
      <CardStack
        page="money"
        cards={[
          { id: 'net', title: 'Net worth', node: <NetWorth f={f} net={net} /> },
          { id: 'spend', title: 'Spending', node: <Spending f={f} onTxn={setTxn} /> },
          { id: 'subs', title: 'Subscriptions', node: <Subscriptions f={f} onSub={setSub} /> },
          { id: 'income', title: 'Income', node: <Income f={f} onTxn={setTxn} /> },
          { id: 'invest', title: 'Investing', node: <Investing f={f} /> },
          { id: 'giving', title: 'Giving', node: <Giving f={f} onTxn={setTxn} /> },
          { id: 'txns', title: 'Transactions', node: <Transactions f={f} onTxn={setTxn} /> },
          { id: 'accounts', title: 'Accounts', node: <Accounts f={f} bank={bank} signedIn={signedIn} /> },
        ]}
      />
      {txn && <TxnSheet t={f.txns.find((x) => x.txnId === txn) || null} onClose={() => setTxn(null)} onSub={(id) => (setTxn(null), setSub(id))} />}
      {sub && <SubSheet s={f.recurring.find((x) => x.id === sub) || null} f={f} onTxn={(id) => (setSub(null), setTxn(id))} onClose={() => setSub(null)} />}
    </>
  );
}

/* ---------- Net worth ---------- */

function NetWorth({ f, net }) {
  const snaps = f.snapshots;
  const today = todayISO();
  const ago = [...snaps].reverse().find((s) => s.date <= addDays(today, -30)) || snaps[0];
  const change = net && ago && ago !== net ? net.net - ago.net : null;
  const parts = net
    ? [
        { label: 'Cash', v: net.cash, c: '#7fdca0' },
        { label: 'Investments', v: net.invest, c: '#7cc4ff' },
        { label: 'Credit cards', v: -net.credit, c: '#ff8a7a' },
        { label: 'Loans', v: -net.loans, c: '#ff9a4a' },
      ].filter((p) => p.v)
    : [];
  const max = Math.max(1, ...parts.map((p) => Math.abs(p.v)));
  return (
    <section className="card" aria-labelledby="nw-h">
      <div className="card-head">
        <h2 id="nw-h">Net worth</h2>
        {net && <span className="meta">{money(net.net)}</span>}
      </div>
      {net ? (
        <>
          <div className="hero-row">
            <div>
              <div className="label">Everything you own minus what you owe</div>
              <div className="big money-big">{money(net.net)}</div>
            </div>
            {change !== null && (
              <div className="right">
                <div className="label">Since {fmt(ago.date, { month: 'short', day: 'numeric' })}</div>
                <div className={`delta ${change >= 0 ? 'pos' : 'neg'}`}>{change >= 0 ? '+' : '−'}{money(Math.abs(change))}</div>
              </div>
            )}
          </div>
          {snaps.length > 1 ? <LineChart pts={snaps.map((s) => ({ date: s.date, v: s.net }))} /> : <p className="muted small">The history chart starts today and grows a point each day the app updates.</p>}
          <ul className="nw-parts">
            {parts.map((p) => (
              <li key={p.label}>
                <span>{p.label}</span>
                <span className="nw-bar"><i style={{ width: `${(Math.abs(p.v) / max) * 100}%`, background: p.c }} /></span>
                <b className={p.v < 0 ? 'neg' : ''}>{p.v < 0 ? '−' : ''}{money(Math.abs(p.v))}</b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty">Updating…</p>
      )}
    </section>
  );
}

function LineChart({ pts, color = 'var(--sky)' }) {
  const W = 340, H = 130, L = 46, R = 8, T = 8, B = 20;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  const pad = Math.max(50, (hi - lo) * 0.12);
  lo -= pad;
  hi += pad;
  const x = (i) => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const short = (v) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);
  return (
    <svg className="chart money-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net worth over time">
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{short(v)}</text>
        </g>
      ))}
      <polyline points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} style={{ stroke: color }} />
      <circle cx={x(pts.length - 1)} cy={y(pts.at(-1).v)} r="4" style={{ fill: color }} className="end-dot" />
      <text x={L} y={H - 4}>{fmt(pts[0].date, { month: 'short', day: 'numeric' })}</text>
      <text x={W - R} y={H - 4} textAnchor="end">Today</text>
    </svg>
  );
}

/* ---------- Spending ---------- */

function MonthNav({ ym, setYm }) {
  const cur = thisMonth();
  return (
    <div className="mo-nav">
      <button className="icon-btn sm" onClick={() => setYm(addMonths(ym, -1))} aria-label="Previous month"><Icon name="left" size={16} /></button>
      <b>{ym === cur ? 'This month' : monthName(ym, { month: 'long', year: 'numeric' })}</b>
      <button className="icon-btn sm" onClick={() => setYm(addMonths(ym, 1))} disabled={ym >= cur} aria-label="Next month"><Icon name="right" size={16} /></button>
    </div>
  );
}

function Spending({ f, onTxn }) {
  const [ym, setYm] = useState(thisMonth());
  const [cat, setCat] = useState(null);
  const [from, to] = monthRange(ym);
  const [pFrom, pTo] = monthRange(addMonths(ym, -1));
  const isCur = ym === thisMonth();
  const day = isCur ? +todayISO().slice(8, 10) : 31;
  const prevSameDay = `${addMonths(ym, -1)}-${String(Math.min(day, +pTo.slice(8))).padStart(2, '0')}`;
  const spent = total(f.txns, 'spend', from, to);
  const prev = total(f.txns, 'spend', pFrom, isCur ? prevSameDay : pTo);
  const month = f.txns.filter((t) => t.kind === 'spend' && t.date >= from && t.date <= to);
  const byCat = useMemo(() => {
    const m = new Map();
    for (const t of month) m.set(t.cat, (m.get(t.cat) || 0) + t.amount);
    return [...m.entries()].map(([c, v]) => ({ c, v })).filter((x) => x.v > 0.5).sort((a, b) => b.v - a.v);
  }, [month]);
  const byMerchant = useMemo(() => {
    const m = new Map();
    for (const t of month) m.set(merchantOf(t), (m.get(merchantOf(t)) || 0) + t.amount);
    return [...m.entries()].map(([n, v]) => ({ n, v })).filter((x) => x.v > 0.5).sort((a, b) => b.v - a.v).slice(0, 5);
  }, [month]);
  const max = Math.max(1, ...byCat.map((x) => x.v));
  const shown = cat ? month.filter((t) => t.cat === cat) : null;

  return (
    <section className="card" aria-labelledby="sp-h">
      <div className="card-head">
        <h2 id="sp-h">Spending</h2>
        <span className="meta">{money(spent)}</span>
      </div>
      <MonthNav ym={ym} setYm={(v) => (setYm(v), setCat(null))} />
      <div className="hero-row">
        <div>
          <div className="label">{isCur ? 'Spent so far' : 'Spent'}</div>
          <div className="big money-big">{money(spent)}</div>
        </div>
        <div className="right">
          <div className="label">{isCur ? `${monthName(addMonths(ym, -1))} by this day` : monthName(addMonths(ym, -1))}</div>
          <div className="delta">{money(prev)}</div>
          {prev > 0 && <div className={`label mo-cmp ${spent <= prev ? 'pos' : 'neg'}`}>{spent <= prev ? '▼' : '▲'} {money(Math.abs(spent - prev))}</div>}
        </div>
      </div>
      <CumulativeChart txns={f.txns} ym={ym} />
      <div className="sl-key">
        <span><i style={{ background: 'var(--coral)' }} />{monthName(ym)}, day by day</span>
        <span><i style={{ background: 'var(--muted)' }} />{monthName(addMonths(ym, -1))}</span>
      </div>
      {byCat.length > 0 && (
        <>
          <p className="school-sub">By category · tap one for its purchases</p>
          <ul className="cat-bars">
            {byCat.map(({ c, v }) => (
              <li key={c}>
                <button className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>
                  <span className="cb-name">{catLabel(c)}</span>
                  <span className="cb-bar"><i style={{ width: `${(v / max) * 100}%`, background: CAT_COLORS[c] || CAT_COLORS.OTHER }} /></span>
                  <b>{money(v)}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {shown ? (
        <TxnList txns={shown} onTxn={onTxn} />
      ) : (
        byMerchant.length > 0 && (
          <>
            <p className="school-sub">Top places</p>
            <ul className="rows top-merch">
              {byMerchant.map((m) => (
                <li key={m.n} className="row"><span className="row-title">{m.n}</span><b>{money(m.v)}</b></li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  );
}

/** Spending added up day by day, this month against last month. */
function CumulativeChart({ txns, ym }) {
  const series = (m) => {
    const [from, to] = monthRange(m);
    const days = +to.slice(8);
    const perDay = Array(days).fill(0);
    for (const t of txns) if (t.kind === 'spend' && t.date >= from && t.date <= to) perDay[+t.date.slice(8) - 1] += t.amount;
    let run = 0;
    return perDay.map((v) => (run += v));
  };
  const cur = series(ym);
  const prev = series(addMonths(ym, -1));
  const isCur = ym === thisMonth();
  const upto = isCur ? +todayISO().slice(8, 10) : cur.length;
  const W = 340, H = 110, L = 8, R = 8, T = 8, B = 16;
  const max = Math.max(1, ...prev, ...cur.slice(0, upto));
  const x = (i) => L + (W - L - R) * (i / 30);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const line = (arr, n) => arr.slice(0, n).map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="chart cum-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending through the month compared with last month">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="grid" />
      <polyline points={line(prev, prev.length)} className="prev" />
      <polyline points={line(cur, upto)} className="cur" />
      <text x={L} y={H - 2}>1st</text>
      <text x={W - R} y={H - 2} textAnchor="end">end of month</text>
    </svg>
  );
}

/* ---------- Income ---------- */

/** Bars per month for a few kinds side by side. */
function MonthBars({ txns, kinds, months = 6, colors }) {
  const cur = thisMonth();
  const list = Array.from({ length: months }, (_, i) => addMonths(cur, i - months + 1));
  const vals = list.map((m) => kinds.map((k) => Math.max(0, total(txns, k, ...monthRange(m)))));
  const max = Math.max(1, ...vals.flat());
  const W = 340, H = 120, T = 6, B = 18;
  const col = W / list.length;
  const bw = Math.min(16, (col * 0.7) / kinds.length);
  return (
    <svg className="chart month-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kinds.join(' and ')} by month`}>
      {list.map((m, i) => (
        <g key={m}>
          {vals[i].map((v, k) => {
            const h = ((H - T - B) * v) / max;
            const x = col * i + col / 2 - (bw * kinds.length) / 2 + k * bw;
            return <rect key={k} x={x + 1} y={H - B - h} width={bw - 2} height={Math.max(v ? 2 : 0, h)} rx="3" style={{ fill: colors[k] }} />;
          })}
          <text x={col * i + col / 2} y={H - 4} textAnchor="middle" className={m === cur ? 'sl-today' : ''}>{monthName(m, { month: 'short' })}</text>
        </g>
      ))}
    </svg>
  );
}

function Income({ f, onTxn }) {
  const [ym, setYm] = useState(thisMonth());
  const [src, setSrc] = useState(null);
  const cur = thisMonth();
  const [from, to] = monthRange(ym);
  const inc = total(f.txns, 'income', from, to);
  // Savings rate and average over the last 3 full months, so one odd month doesn't swing it.
  const rFrom = monthRange(addMonths(cur, -3))[0];
  const rTo = monthRange(addMonths(cur, -1))[1];
  const i3 = total(f.txns, 'income', rFrom, rTo);
  const out3 = total(f.txns, 'spend', rFrom, rTo) + total(f.txns, 'giving', rFrom, rTo);
  const rate = i3 > 0 ? Math.round(((i3 - out3) / i3) * 100) : null;
  const month = f.txns.filter((t) => t.kind === 'income' && t.date >= from && t.date <= to);
  const bySource = useMemo(() => {
    const m = new Map();
    for (const t of month) {
      const n = merchantOf(t);
      const e = m.get(n) || { n, v: 0, count: 0, repeat: null };
      e.v -= t.amount;
      e.count += 1;
      e.repeat = e.repeat || t.repeat || null;
      m.set(n, e);
    }
    return [...m.values()].filter((x) => x.v > 0.5).sort((a, b) => b.v - a.v);
  }, [month]);
  const steadyTotal = bySource.filter((x) => x.repeat).reduce((s, x) => s + x.v, 0);
  const steady = f.recurring.filter((r) => r.dir === 'in' && r.active && r.kind === 'income');
  const max = Math.max(1, ...bySource.map((x) => x.v));
  const COLORS = ['#7fdca0', '#7cc4ff', '#ffcf5c', '#bba9ff', '#ff9a4a', '#5fd3c6', '#ff86b8'];
  const shown = src ? month.filter((t) => merchantOf(t) === src) : null;
  return (
    <section className="card" aria-labelledby="in-h">
      <div className="card-head">
        <h2 id="in-h">Income</h2>
        <span className="meta">{money(inc)}</span>
      </div>
      <MonthNav ym={ym} setYm={(v) => (setYm(v), setSrc(null))} />
      <div className="hero-row">
        <div>
          <div className="label">{ym === cur ? 'So far this month' : 'Earned'}</div>
          <div className="big money-big">{money(inc)}</div>
        </div>
        {rate !== null && (
          <div className="right">
            <div className="label">Last 3 months</div>
            <div className={`delta ${rate >= 0 ? 'pos' : 'neg'}`}>{rate >= 0 ? `${rate}% kept` : `${money(out3 - i3)} short`}</div>
            <div className="label mo-cmp">{rate >= 0 ? 'of income not spent or given' : `spent and gave ${money(out3)} on ${money(i3)} income`}</div>
          </div>
        )}
      </div>
      <div className="rv-stats money-stats">
        <div><b>{money(i3 / 3)}</b><span>average month</span></div>
        <div><b>{inc > 0 ? `${Math.round((steadyTotal / inc) * 100)}%` : '—'}</b><span>steady pay</span></div>
        <div><b>{bySource.length}</b><span>source{bySource.length === 1 ? '' : 's'}</span></div>
      </div>
      {bySource.length > 0 ? (
        <>
          <p className="school-sub">Where it came from · tap one for its deposits</p>
          <div className="inc-split" aria-hidden="true">
            {bySource.map((x, i) => <i key={x.n} style={{ flex: x.v, background: COLORS[i % COLORS.length] }} />)}
          </div>
          <ul className="cat-bars">
            {bySource.map((x, i) => (
              <li key={x.n}>
                <button className={src === x.n ? 'on' : ''} onClick={() => setSrc(src === x.n ? null : x.n)}>
                  <span className="cb-name">{x.n}</span>
                  <span className="cb-bar"><i style={{ width: `${(x.v / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></span>
                  <b>{money(x.v)}<small> {Math.round((x.v / inc) * 100)}%</small></b>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted small">No income this month yet.</p>
      )}
      {shown && <TxnList txns={shown} onTxn={onTxn} />}
      {!shown && steady.length > 0 && (
        <>
          <p className="school-sub">Steady pay</p>
          <ul className="rows">
            {steady.map((r) => (
              <li key={r.id} className="row">
                <span className="row-title">
                  {r.name}
                  <span className="task-meta"><span>{r.cadence.every}</span><span>next {fmt(r.next, { month: 'short', day: 'numeric' })}</span></span>
                </span>
                <span className="hold-v"><b className="pos">{r.varies ? '~' : '+'}{money(r.amount, r.varies ? false : true)}</b><span>≈ {money(r.perMonth)}/mo</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="school-sub">Last 6 months</p>
      <MonthBars txns={f.txns} kinds={['income', 'spend']} colors={['var(--mint)', 'var(--coral)']} />
      <div className="sl-key"><span><i style={{ background: 'var(--mint)' }} />Income</span><span><i style={{ background: 'var(--coral)' }} />Spending</span></div>
    </section>
  );
}

/* ---------- Subscriptions ---------- */

function Subscriptions({ f, onSub }) {
  const [showOld, setShowOld] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // What counts toward the total is your choice (tap one); by default only things you buy.
  const outs = f.recurring.filter((r) => r.dir === 'out' && r.counted);
  const active = outs.filter((r) => r.active);
  const stopped = outs.filter((r) => !r.active);
  const other = f.recurring.filter((r) => r.dir === 'out' && !r.counted && r.active);
  const otherMonth = other.reduce((s, r) => s + r.perMonth, 0);
  const perMonth = active.reduce((s, r) => s + r.perMonth, 0);
  const soon = active.filter((r) => r.next <= addDays(todayISO(), 7));
  const soonTotal = soon.reduce((s, r) => s + r.amount, 0);
  const Row = ({ r }) => (
    <li className="row">
      <button className="row-title task-open" onClick={() => onSub(r.id)}>
        <span className="title-line">
          {r.name}
          {!r.sure && <span className="tag">Maybe</span>}
          {r.oldAmount && <span className={`tag ${r.amount > r.oldAmount ? 'neg' : 'pos'}`}>{r.amount > r.oldAmount ? '▲' : '▼'} was {money(r.oldAmount, true)}</span>}
        </span>
        <span className="task-meta">
          <span>{r.cadence.label}</span>
          <span>{r.active ? `next ${fmt(r.next, { month: 'short', day: 'numeric' })}` : `last ${fmt(r.last, { month: 'short', day: 'numeric' })}`}</span>
          {r.kind !== 'spend' && <span className={`k-${r.kind}`}>{KIND_LABEL[r.kind]}</span>}
        </span>
      </button>
      <span className="hold-v"><b>{money(r.amount, true)}</b>{r.cadence.id !== 'monthly' && <span>≈ {money(r.perMonth, true)}/mo</span>}</span>
    </li>
  );
  return (
    <section className="card" aria-labelledby="sb-h">
      <div className="card-head">
        <h2 id="sb-h">Subscriptions</h2>
        <span className="meta">{money(perMonth)}/mo</span>
      </div>
      {!outs.length && !other.length ? (
        <p className="muted small">Nothing repeating yet. When the same place charges about the same amount on a steady schedule (twice for monthly, three times for weekly), it shows up here.</p>
      ) : (
        <>
          <div className="rv-stats money-stats">
            <div><b>{money(perMonth)}</b><span>a month</span></div>
            <div><b>{money(perMonth * 12)}</b><span>a year</span></div>
            <div><b>{money(soonTotal)}</b><span>next 7 days</span></div>
          </div>
          <ul className="rows txn-list">{active.map((r) => <Row key={r.id} r={r} />)}</ul>
          {!active.length && <p className="muted small">No active subscriptions right now.</p>}
          {stopped.length > 0 && (
            <>
              <button className="mini" onClick={() => setShowOld(!showOld)}>{showOld ? 'Hide' : 'Show'} {stopped.length} that stopped</button>
              {showOld && <ul className="rows txn-list muted-rows">{stopped.map((r) => <Row key={r.id} r={r} />)}</ul>}
            </>
          )}
        </>
      )}
      {other.length > 0 && (
        <>
          <p className="school-sub">Not in the total · {money(otherMonth)}/mo</p>
          <ul className="rows txn-list">{other.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      )}
      {f.hiddenRecurring.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowHidden(!showHidden)}>{f.hiddenRecurring.length} marked “not a subscription”</button>
          {showHidden && (
            <ul className="rows">
              {f.hiddenRecurring.map((d) => (
                <li key={d.id} className="row">
                  <span className="row-title">{d.name}</span>
                  <button className="mini" onClick={() => (decideRecurring({ ...d, confirmed: false, state: null, countChosen: typeof d.count === 'boolean', counted: d.count }, null), toast('Back on the list'))}>Undo</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function SubSheet({ s, f, onTxn, onClose }) {
  if (!s) return null;
  const txns = f.txns.filter((t) => s.txnIds.includes(t.txnId));
  const paid = txns.reduce((a, t) => a + Math.abs(t.amount), 0);
  return (
    <Sheet title={s.name} onClose={onClose}>
      <div className="rv-stats money-stats">
        <div><b>{money(s.amount, true)}</b><span>{s.cadence.every}</span></div>
        <div><b>{money(s.perYear)}</b><span>a year</span></div>
        <div><b>{s.active ? fmt(s.next, { month: 'short', day: 'numeric' }) : 'Stopped?'}</b><span>{s.active ? 'next charge' : `last ${fmt(s.last, { month: 'short', day: 'numeric' })}`}</span></div>
      </div>
      <p className="muted small">
        {s.count} {s.dir === 'in' ? 'deposits' : 'charges'} since {fmt(s.first, { month: 'short', day: 'numeric', year: 'numeric' })}, {money(paid, true)} in all
        {s.oldAmount && ` · went from ${money(s.oldAmount, true)} to ${money(s.amount, true)} on ${fmt(s.changedOn, { month: 'short', day: 'numeric' })}`}
        {s.accountName && ` · ${s.accountName}`}
      </p>
      <div className="chips" style={{ marginTop: 12 }}>
        <button className="chip" aria-pressed={s.confirmed} onClick={() => (decideRecurring(s, s.confirmed ? null : 'yes'), toast(s.confirmed ? 'Back to automatic' : 'Marked as a subscription'))}>
          {s.dir === 'in' ? 'Yes, steady pay' : 'Yes, a subscription'}
        </button>
        <button className="chip" onClick={() => (decideRecurring(s, 'no'), toast('Hidden'), onClose())}>Not a subscription</button>
      </div>
      {s.dir === 'out' && (
        <label className="toggle" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={s.counted} onChange={(e) => (setCounted(s, e.target.checked), toast(e.target.checked ? 'Counted in the subscription total' : 'Left out of the subscription total'))} />
          <span>Count in subscription total</span>
        </label>
      )}
      <p className="cap-label" style={{ marginTop: 14 }}>History</p>
      <TxnList txns={txns} onTxn={onTxn} />
    </Sheet>
  );
}

/* ---------- Investing ---------- */

function Investing({ f }) {
  const inv = f.accounts.filter((a) => a.type === 'investment');
  const value = inv.reduce((s, a) => s + (Number(a.current) || 0), 0);
  const withCost = f.holdings.filter((h) => h.cost != null && h.value != null);
  const gain = withCost.reduce((s, h) => s + (h.value - h.cost), 0);
  const cost = withCost.reduce((s, h) => s + h.cost, 0);
  const year = todayISO().slice(0, 4);
  const added = total(f.txns, 'invest', `${year}-01-01`, `${year}-12-31`);
  const top = [...f.holdings].sort((a, b) => (b.value || 0) - (a.value || 0));
  const [all, setAll] = useState(false);
  return (
    <section className="card" aria-labelledby="iv-h">
      <div className="card-head">
        <h2 id="iv-h">Investing</h2>
        <span className="meta">{money(value)}</span>
      </div>
      {!inv.length ? (
        <p className="empty" style={{ marginTop: 0 }}>Connect Robinhood under Accounts to see your investments.</p>
      ) : (
        <>
          <div className="rv-stats money-stats">
            <div><b>{money(value)}</b><span>invested now</span></div>
            {withCost.length > 0 && <div><b className={gain >= 0 ? 'pos' : 'neg'}>{gain >= 0 ? '+' : '−'}{money(Math.abs(gain))}</b><span>{cost ? `${gain >= 0 ? '+' : ''}${((gain / cost) * 100).toFixed(1)}% overall` : 'gain'}</span></div>}
            <div><b>{money(added)}</b><span>added in {year}</span></div>
          </div>
          {top.length > 0 && (
            <ul className="rows holdings">
              {(all ? top : top.slice(0, 6)).map((h) => {
                const g = h.cost ? ((h.value - h.cost) / h.cost) * 100 : null;
                return (
                  <li key={h.id} className="row">
                    <span className="row-title">
                      <b>{h.secType === 'cash' || /^CUR:/.test(h.ticker) ? 'Cash' : h.ticker || h.name}</b>
                      <span className="task-meta">
                        {h.secType === 'cash' || /^CUR:/.test(h.ticker) ? <span>Not invested yet</span> : <><span>{h.ticker ? h.name : h.secType}</span><span>{+Number(h.qty).toFixed(4)} shares</span></>}
                      </span>
                    </span>
                    <span className="hold-v">
                      <b>{money(h.value)}</b>
                      {g !== null && <span className={g >= 0 ? 'pos' : 'neg'}>{g >= 0 ? '+' : ''}{g.toFixed(1)}%</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {!all && top.length > 6 && <button className="mini" onClick={() => setAll(true)}>Show all {top.length}</button>}
        </>
      )}
    </section>
  );
}

/* ---------- Giving ---------- */

function Giving({ f, onTxn }) {
  const year = todayISO().slice(0, 4);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const given = total(f.txns, 'giving', from, to);
  const inc = total(f.txns, 'income', from, to);
  const gifts = f.txns.filter((t) => t.kind === 'giving' && t.date >= from);
  return (
    <section className="card" aria-labelledby="gv-h">
      <div className="card-head">
        <h2 id="gv-h">Giving</h2>
        <span className="meta">{money(given)} in {year}</span>
      </div>
      <div className="rv-stats money-stats">
        <div><b>{money(given)}</b><span>given in {year}</span></div>
        <div><b>{inc > 0 ? `${((given / inc) * 100).toFixed(1)}%` : '—'}</b><span>of income</span></div>
        <div><b>{gifts.length}</b><span>gift{gifts.length === 1 ? '' : 's'}</span></div>
      </div>
      <MonthBars txns={f.txns} kinds={['giving']} months={12} colors={['var(--mint)']} />
      {gifts.length ? (
        <TxnList txns={gifts.slice(0, 8)} onTxn={onTxn} />
      ) : (
        <p className="muted small">Donations show up here automatically. If one is missed (a church or a Venmo to a cause), tap it under Transactions and mark it as Giving.</p>
      )}
    </section>
  );
}

/* ---------- Transactions ---------- */

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));

function TxnList({ txns, onTxn }) {
  return (
    <ul className="rows txn-list">
      {txns.map((t) => (
        <li key={t.txnId} className="row">
          <button className="row-title task-open" onClick={() => onTxn(t.txnId)}>
            <span className="title-line">{merchantOf(t)}{t.pending && <span className="tag">Pending</span>}{t.repeat && <span className="tag">{t.repeat.cadence.label}</span>}</span>
            <span className="task-meta">
              <span>{fmt(t.date, { month: 'short', day: 'numeric' })}</span>
              <span className={`k-${t.kind}`}>{t.kind === 'spend' ? catLabel(t.cat) : KIND_LABEL[t.kind]}</span>
              <span>{t.account.name}</span>
            </span>
          </button>
          <b className={`txn-amt${t.amount < 0 ? ' in' : ''}`}>{t.amount < 0 ? '+' : ''}{money(Math.abs(t.amount), true)}</b>
        </li>
      ))}
    </ul>
  );
}

function Transactions({ f, onTxn }) {
  const [q, setQ] = useState('');
  const [n, setN] = useState(25);
  const s = q.trim().toLowerCase();
  const list = s ? f.txns.filter((t) => `${t.name} ${t.merchant} ${catLabel(t.cat)}`.toLowerCase().includes(s)) : f.txns;
  return (
    <section className="card" aria-labelledby="tx-h">
      <div className="card-head">
        <h2 id="tx-h">Transactions</h2>
        <span className="meta">{f.txns.length}</span>
      </div>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search transactions" />
      <TxnList txns={list.slice(0, n)} onTxn={onTxn} />
      {list.length > n && <button className="mini" onClick={() => setN(n + 50)}>Show more</button>}
    </section>
  );
}

function TxnSheet({ t, onClose, onSub }) {
  const [all, setAll] = useState(false);
  if (!t) return null;
  const pick = (kind) => {
    setTxnKind(t, kind, all);
    toast(all ? `Every ${merchantOf(t)} is now ${KIND_LABEL[kind] || 'back to automatic'}` : 'Updated');
  };
  return (
    <Sheet title={merchantOf(t)} onClose={onClose}>
      <div className="rv-stats money-stats">
        <div><b className={t.amount < 0 ? 'pos' : ''}>{t.amount < 0 ? '+' : ''}{money(Math.abs(t.amount), true)}</b><span>{t.amount < 0 ? 'money in' : 'money out'}</span></div>
        <div><b>{fmt(t.date, { month: 'short', day: 'numeric' })}</b><span>{t.pending ? 'pending' : 'date'}</span></div>
        <div><b>{t.account.name}</b><span>{t.account.institution}</span></div>
      </div>
      <p className="muted small">{t.name} · {catLabel(t.cat)}</p>
      {t.repeat && (
        <button className="link-btn" onClick={() => onSub(t.repeat.id)}>
          Repeats {t.repeat.cadence.every}{t.repeat.active ? ` · next ${fmt(t.repeat.next, { month: 'short', day: 'numeric' })}` : ''} ›
        </button>
      )}
      <p className="cap-label" style={{ marginTop: 14 }}>Count it as</p>
      <div className="chips">
        {KINDS.map((k) => (
          <button key={k.id} className="chip" aria-pressed={t.kind === k.id} onClick={() => pick(k.id)}>{k.label}</button>
        ))}
      </div>
      <label className="toggle" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span>Do this for every transaction from {merchantOf(t)}</span>
      </label>
      {(t.overridden || t.ruled) && (
        <button className="link-btn" onClick={() => (setTxnKind(t, null, t.ruled), toast('Back to automatic'))}>Reset to automatic</button>
      )}
    </Sheet>
  );
}

/* ---------- Accounts ---------- */

const TYPE_LABEL = { depository: 'Cash', credit: 'Credit card', loan: 'Loan', investment: 'Investments', other: 'Other' };

function Accounts({ f, bank, signedIn }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const connect = async (itemId = null) => {
    setBusy(true);
    try {
      const name = await connectBank(itemId);
      if (name) toast(`${name} connected`);
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  };
  const byItem = new Map();
  for (const a of f.accounts) {
    if (!byItem.has(a.itemId)) byItem.set(a.itemId, []);
    byItem.get(a.itemId).push(a);
  }
  const itemInfo = Object.fromEntries(f.items.map((i) => [i.itemId, i]));
  const standalone = typeof window !== 'undefined' && (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);

  return (
    <section className="card" aria-labelledby="ac-h">
      <div className="card-head">
        <h2 id="ac-h">Accounts</h2>
        <span className="meta">{f.accounts.length}</span>
        {f.items.length > 0 && (
          <button className="mini add-blk" onClick={() => syncBanks(true)} disabled={bank.syncing}>{bank.syncing ? 'Updating…' : 'Update'}</button>
        )}
      </div>
      {[...byItem.entries()].map(([itemId, accts]) => {
        const info = itemInfo[itemId] || {};
        return (
          <div key={itemId} className="bank">
            <div className="bank-head">
              <b>{accts[0].institution}</b>
              {info.status === 'login' ? (
                <button className="mini sun" onClick={() => connect(itemId)} disabled={busy}>Sign in again</button>
              ) : (
                <button
                  className={`mini${confirm === itemId ? ' danger' : ''}`}
                  onClick={async () => {
                    if (confirm !== itemId) return setConfirm(itemId);
                    setConfirm(null);
                    await removeBank(itemId).catch((e) => toast(e.message));
                    toast('Disconnected');
                  }}
                >
                  {confirm === itemId ? 'Tap to disconnect' : 'Remove'}
                </button>
              )}
            </div>
            {info.status === 'login' && <p className="err small">This bank needs you to sign in again before it can update.</p>}
            {info.status === 'partial' && info.error && <p className="muted small">{info.error}</p>}
            <ul className="rows">
              {accts.map((a) => (
                <li key={a.id} className="row">
                  <span className="row-title">
                    {a.name}{a.mask ? ` ••${a.mask}` : ''}
                    <span className="task-meta"><span>{TYPE_LABEL[a.type] || a.type}{a.subtype ? ` · ${a.subtype}` : ''}</span></span>
                  </span>
                  <b className={a.type === 'credit' || a.type === 'loan' ? 'neg' : ''}>{money(a.current, true)}</b>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!signedIn ? (
        <p className="muted small">Sign in (Settings) first, so your banks are tied to your account and show on every device.</p>
      ) : (
        <>
          <button className="btn wide" onClick={() => connect()} disabled={busy}>
            <Icon name="plus" size={18} /> {f.accounts.length ? 'Connect another bank' : 'Connect a bank'}
          </button>
          {standalone && (
            <p className="muted small">Tip: for banks that send you to their own site to sign in (like Capital One), connect from Safari instead of the Home Screen app. Once connected, everything shows here too.</p>
          )}
          <p className="muted small">Banks connect through Plaid. lifestyle+ can only read balances and transactions; it can’t move money. Your bank login goes to Plaid, never to this app.</p>
        </>
      )}
      {bank.error && <p className="err">{bank.error}</p>}
    </section>
  );
}
