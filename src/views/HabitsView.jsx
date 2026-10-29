import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { putMany } from '../store.js';
import { Icon } from '../components/ui.jsx';
import { useHabits, toggleHabit, habitStats, addHabit, resumeHabit, dayClass } from '../lib/model.js';
import { addDays, fmt, parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import HabitHistorySheet from '../components/HabitHistorySheet.jsx';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const codeLabel = (h, code) =>
  ({ d: h.mode === 'avoid' ? 'clean' : 'done', p: 'partly done', s: 'skipped', m: h.mode === 'avoid' ? 'slipped' : 'not done' })[code];

const HOLD_MS = 550;

/**
 * Today's big check-off. Press and hold until it fills to mark it, so a stray tap can't.
 * Holding again undoes it. Enter or Space toggles it from a keyboard.
 */
function HoldCheck({ h, code, onDone }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const avoid = h.mode === 'avoid';
  const on = code === 'd';
  const label = avoid ? (on ? 'Clean today' : 'Slipped today') : on ? 'Done today' : 'Hold to check off';
  const hint = avoid ? (on ? 'Hold to mark a slip' : 'Hold to undo') : on ? 'Hold to undo' : '';

  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  const start = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      if (navigator.vibrate) navigator.vibrate(15);
      onDone();
    }, HOLD_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      className={`hold-check${on ? ' on' : ''}${avoid ? ' avoid' : ''}${holding ? ' holding' : ''}`}
      style={{ '--hold': `${HOLD_MS}ms` }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onDone())}
      aria-pressed={on}
      aria-label={`${h.name} today: ${label}. ${hint || 'Press and hold to check off.'}`}
    >
      <span className="fill" aria-hidden="true" />
      <span className="tick" aria-hidden="true">{on ? <Icon name="check" size={18} /> : avoid ? '×' : null}</span>
      <span className="txt">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

/**
 * Habits two to a row. Drag a card by its grip to reorder (arrow keys work on the grip too).
 * The new order is saved to each habit, so the Day view's habit chips follow it.
 */
function HabitGrid({ habits, paused, children }) {
  const gridRef = useRef(null);
  const cells = useRef(new Map());
  const prevRects = useRef(null);
  const [order, setOrder] = useState(null); // ids while dragging, otherwise null
  const [drag, setDrag] = useState(null); // { id, grabX, grabY, x, y }
  const ids = order || habits.map((h) => h.id);
  const byId = useMemo(() => Object.fromEntries(habits.map((h) => [h.id, h])), [habits]);

  // Where a cell sits in the grid, ignoring any drag transform.
  const home = (el) => {
    const g = gridRef.current.getBoundingClientRect();
    return { left: g.left + el.offsetLeft, top: g.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };

  // After a reorder: slide the other cards from their old spots (FLIP), and keep the dragged one under the finger.
  useLayoutEffect(() => {
    const before = prevRects.current;
    prevRects.current = null;
    for (const [id, el] of cells.current) {
      if (!el) continue;
      if (drag && id === drag.id) {
        const r = home(el);
        el.style.transform = `translate(${drag.x - drag.grabX - r.left}px, ${drag.y - drag.grabY - r.top}px) scale(1.03)`;
        continue;
      }
      el.style.transform = '';
      const b = before && before.get(id);
      if (!b) continue;
      const r = home(el);
      const dx = b.left - r.left;
      const dy = b.top - r.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.22s var(--ease-out)';
        el.style.transform = '';
      });
    }
  });

  const snapshot = () => {
    const m = new Map();
    for (const [id, el] of cells.current) if (el) m.set(id, home(el));
    return m;
  };

  const moveTo = (id, index) => {
    const cur = order || habits.map((h) => h.id);
    const from = cur.indexOf(id);
    if (from === index || index < 0 || index >= cur.length) return cur;
    prevRects.current = snapshot();
    const next = [...cur];
    next.splice(from, 1);
    next.splice(index, 0, id);
    setOrder(next);
    return next;
  };

  const save = (next) => {
    const changed = [];
    next.forEach((id, i) => byId[id] && byId[id].order !== i + 1 && changed.push(['habit', { ...byId[id], order: i + 1 }]));
    paused.forEach((h, i) => h.order !== next.length + i + 1 && changed.push(['habit', { ...h, order: next.length + i + 1 }]));
    if (changed.length) putMany(changed);
  };

  const onDown = (id) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const el = cells.current.get(id);
    const r = home(el);
    setOrder(habits.map((h) => h.id));
    setDrag({ id, grabX: e.clientX - r.left, grabY: e.clientY - r.top, x: e.clientX, y: e.clientY });
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const onMove = (e) => {
    if (!drag) return;
    const d = { ...drag, x: e.clientX, y: e.clientY };
    // Which cell is the finger over? (Measured from home spots, so the dragged card itself doesn't count.)
    let target = -1;
    ids.forEach((id, i) => {
      const el = cells.current.get(id);
      if (!el) return;
      const r = home(el);
      if (e.clientX >= r.left && e.clientX < r.left + r.w && e.clientY >= r.top && e.clientY < r.top + r.h) target = i;
    });
    if (target !== -1) moveTo(drag.id, target);
    setDrag(d);
    // Scroll the page when dragging near the top or bottom edge.
    if (e.clientY < 90) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 150) window.scrollBy(0, 10);
  };

  const onUp = () => {
    if (!drag) return;
    const el = cells.current.get(drag.id);
    if (el) {
      el.style.transition = 'transform 0.2s var(--ease-out)';
      el.style.transform = '';
      setTimeout(() => el && (el.style.transition = ''), 220);
    }
    save(order || ids);
    setDrag(null);
    setOrder(null);
  };

  // Follow the finger on the whole window: reordering moves cards around the page, which would
  // otherwise make the browser drop the drag.
  const handlers = useRef({});
  handlers.current = { onMove, onUp };
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => handlers.current.onMove(e);
    const up = () => handlers.current.onUp();
    const block = (e) => e.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block, { passive: false }); // no page scroll while dragging
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', block);
    };
  }, [dragging]);

  const onKey = (id) => (e) => {
    const i = ids.indexOf(id);
    const step = { ArrowLeft: -1, ArrowUp: -2, ArrowRight: 1, ArrowDown: 2 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = moveTo(id, Math.max(0, Math.min(ids.length - 1, i + step)));
    save(next);
    setOrder(null);
  };

  return (
    <div className="habit-grid" ref={gridRef}>
      {ids.map((id) => {
        const h = byId[id];
        if (!h) return null;
        const grip = (
          <button
            className="grip"
            aria-label={`Move ${h.name}. Drag, or use the arrow keys.`}
            onPointerDown={onDown(id)}
            onKeyDown={onKey(id)}
          >
            <Icon name="grip" size={18} />
          </button>
        );
        return (
          <section
            key={id}
            ref={(el) => (el ? cells.current.set(id, el) : cells.current.delete(id))}
            className={`card habit${drag && drag.id === id ? ' dragging' : ''}`}
          >
            {children(h, grip)}
          </section>
        );
      })}
    </div>
  );
}

export default function HabitsView() {
  const idx = useHabits();
  const { habits, paused, all, lookup } = idx;
  const [name, setName] = useState('');
  const [mode, setMode] = useState('build');
  const [open, setOpen] = useState(null);
  const today = todayISO();
  // The six days before today; today gets its own big hold-to-check button.
  const days = Array.from({ length: 6 }, (_, i) => addDays(today, i - 6));

  const stats = useMemo(() => Object.fromEntries(all.map((h) => [h.id, habitStats(h, idx)])), [all, idx]);
  const since = all.length ? all.reduce((m, h) => (idx.startOf(h) < m ? idx.startOf(h) : m), today) : today;
  const totalDone = all.reduce((a, h) => a + stats[h.id].done, 0);

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    addHabit(name, mode, all.length ? Math.max(...all.map((h) => h.order ?? 0)) + 1 : 1);
    setName('');
    toast('Habit added');
  };

  const openHabit = open && all.find((h) => h.id === open);

  return (
    <>
      <header className="page-head">
        <h1>Habits</h1>
        <p>
          {totalDone
            ? `${totalDone.toLocaleString()} check-ins since ${fmt(since, { month: 'short', year: 'numeric' })}. Tap a habit for its full history.`
            : 'The last two weeks. Tap any day to fix it.'}
        </p>
      </header>

      <HabitGrid habits={habits} paused={paused}>
        {(h, grip) => {
        const s = stats[h.id];
        return (
          <>
            <div className="habit-top">
              <button className="habit-name" onClick={() => setOpen(h.id)} aria-label={`${h.name}: open history`}>
                <h3>{h.name}</h3>
              </button>
              {grip}
            </div>
            <div className="habit-sub">
              <span className="streak-badge" aria-label={`${s.streak} day streak`}>
                <b>{s.streak}</b>day{s.streak === 1 ? '' : 's'}
              </span>
              {h.mode === 'avoid' && <span className="tag">Avoid</span>}
              <span className="stats" aria-label={`Best streak ${s.best}, ${s.rate}% in the last 30 days`}>
                best <strong>{s.best}</strong> · <strong>{s.rate}%</strong>
              </span>
            </div>
            <div className="days">
              {days.map((d) => {
                const code = lookup(h, d).code;
                const before = d < idx.startOf(h);
                return (
                  <button
                    key={d}
                    className={`day${before ? '' : dayClass(h, code)}${d === today ? ' today' : ''}`}
                    aria-pressed={code === 'd'}
                    aria-label={`${h.name}, ${fmt(d, { weekday: 'long', month: 'short', day: 'numeric' })}: ${before ? 'before you started' : codeLabel(h, code)}`}
                    onClick={() => toggleHabit(h, d, code === 'd')}
                  >
                    {DOW[parse(d).getDay()]}
                  </button>
                );
              })}
            </div>
            <HoldCheck h={h} code={lookup(h, today).code} onDone={() => toggleHabit(h, today, lookup(h, today).code === 'd')} />
          </>
        );
        }}
      </HabitGrid>

      {!habits.length && <p className="empty card">No habits yet. Add one below, or import your history from Streaks in Settings.</p>}

      <section className="card">
        <div className="card-head"><h2>New habit</h2></div>
        <div className="seg" role="group" aria-label="Habit type" style={{ marginBottom: 10 }}>
          <button aria-pressed={mode === 'build'} onClick={() => setMode('build')}>Build</button>
          <button aria-pressed={mode === 'avoid'} onClick={() => setMode('avoid')}>Avoid</button>
        </div>
        <form className="inline" onSubmit={add}>
          <input
            id="habit-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'build' ? 'Stretch 10 min' : 'No coffee'}
            autoComplete="off"
          />
          <button className="btn">Add</button>
        </form>
        <p className="hint-quiet">
          {mode === 'build' ? 'Check it off each day you do it.' : 'Every day counts as clean until you mark a slip.'}
        </p>
      </section>

      {paused.length > 0 && (
        <section className="card" aria-labelledby="paused-h">
          <div className="card-head">
            <h2 id="paused-h">Paused</h2>
            <span className="meta">{paused.length}</span>
          </div>
          <ul className="rows">
            {paused.map((h) => (
              <li key={h.id} className="row">
                <button className="row-title link-row" onClick={() => setOpen(h.id)}>
                  <b>{h.name}</b>
                  <span className="muted small"> · best {stats[h.id].best} · {stats[h.id].done} days done</span>
                </button>
                <button className="mini" onClick={() => { resumeHabit(h); toast(`${h.name} resumed`); }}>Resume</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openHabit && <HabitHistorySheet habit={openHabit} idx={idx} onClose={() => setOpen(null)} />}
    </>
  );
}
