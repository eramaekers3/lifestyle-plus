import { useEffect, useRef, useState } from 'react';
import { fmt, minToLabel, relDay, todayISO } from '../lib/dates.js';
import { setSchoolDone } from '../lib/canvas.js';
import { toast } from '../lib/toast.js';
import { Icon } from './ui.jsx';

const dueLabel = (i, showDay) => {
  const day = showDay ? (['Today', 'Tomorrow', 'Yesterday'].includes(relDay(i.date)) ? relDay(i.date) : fmt(i.date, { weekday: 'short' })) : '';
  const time = i.time == null ? '' : i.time === 1439 ? '11:59pm' : minToLabel(i.time);
  return [day, time].filter(Boolean).join(' ');
};

const SWIPE_AT = 0.35; // fraction of the row's width that counts as a swipe

/**
 * One Canvas item. Swipe it sideways to mark it done (it slides off the list), or tap the box.
 * Swiping a done item marks it not done again.
 */
function SchoolRow({ i, showDay, today }) {
  const ref = useRef(null);
  const g = useRef(null); // { x, y, w, swiping, dx }
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(0); // -1 / 1 while sliding off
  const late = !i.done && i.kind === 'homework' && i.date < today;

  // When the item flips (or an Undo brings it back) and the row is still on screen, put it back in place.
  useEffect(() => {
    setLeaving(0);
    setDx(0);
    const el = ref.current;
    if (el) {
      el.classList.remove('collapsing');
      el.style.height = '';
    }
  }, [i.done]);

  const commit = (done, dir) => {
    const el = ref.current;
    setLeaving(dir);
    if (navigator.vibrate) navigator.vibrate(12);
    // Slide off, then fold the row's space shut, then save.
    setTimeout(() => {
      if (el) {
        el.style.height = `${el.offsetHeight}px`;
        void el.offsetHeight;
        el.classList.add('collapsing');
      }
      setTimeout(() => {
        setSchoolDone(i, done);
        toast(done ? `Done: ${i.title}` : `Not done: ${i.title}`, { label: 'Undo', run: () => setSchoolDone(i, !done) });
      }, 200);
    }, 180);
  };

  const down = (e) => {
    if (leaving || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest('a')) return; // the Open in Canvas link
    g.current = { x: e.clientX, y: e.clientY, w: ref.current.offsetWidth, swiping: false, dx: 0, id: e.pointerId };
  };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return (g.current = null); // scrolling, not swiping
      if (Math.abs(mx) < 10) return;
      s.swiping = true;
      ref.current.setPointerCapture(s.id);
    }
    s.dx = mx;
    setDx(mx);
  };
  const up = () => {
    const s = g.current;
    g.current = null;
    if (!s || !s.swiping) return;
    if (Math.abs(s.dx) > s.w * SWIPE_AT) commit(!i.done, Math.sign(s.dx));
    else setDx(0);
    ref.current.dataset.swiped = '1'; // swallow the click that follows a swipe
    setTimeout(() => ref.current && delete ref.current.dataset.swiped, 0);
  };

  const offset = leaving ? `${leaving * 110}%` : `${dx}px`;
  const reveal = leaving ? 1 : Math.min(1, Math.abs(dx) / ((ref.current && ref.current.offsetWidth * SWIPE_AT) || 120));

  return (
    <li
      ref={ref}
      className={`school-swipe${i.done ? ' done' : ''}${dx > 0 || leaving > 0 ? ' from-left' : ''}${dx || leaving ? ' moving' : ''}`}
      style={{ '--reveal': reveal }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        g.current = null;
        setDx(0);
      }}
      onClickCapture={(e) => ref.current.dataset.swiped && (e.stopPropagation(), e.preventDefault())}
    >
      <span className="swipe-under" aria-hidden="true">
        <Icon name={i.done ? 'back' : 'check'} size={20} />
        {i.done ? 'Not done' : 'Done'}
      </span>
      <div
        className={`row school-row${i.done ? ' done' : ''}${i.kind === 'test' ? ' is-test' : ''}`}
        style={{ transform: `translateX(${offset})`, transition: g.current && g.current.swiping ? 'none' : undefined }}
      >
        <button
          className={`check${i.done ? ' on' : ''}`}
          onClick={() => commit(!i.done, 1)}
          aria-label={i.done ? `Mark “${i.title}” not done` : `Mark “${i.title}” done`}
          aria-pressed={i.done}
        >
          {i.done && <Icon name="check" size={16} />}
        </button>
        <span className="row-title">
          <span className="school-title">
            {i.kind === 'test' && <span className="test-tag">Test</span>}
            {i.title}
          </span>
          <span className="school-meta">
            {i.course && <span className="course">{i.course}</span>}
            <span className={late ? 'late' : ''}>{late ? `Past due · ${dueLabel(i, true)}` : dueLabel(i, showDay)}</span>
          </span>
        </span>
        {i.link && (
          <a className="icon-btn open-canvas" href={i.link} target="_blank" rel="noreferrer" aria-label={`Open “${i.title}” in Canvas`}>
            <Icon name="out" size={18} />
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * A list of Canvas homework and tests. Swipe an item to check it off and it leaves the list;
 * finished items are tucked behind "Show done".
 */
export default function SchoolList({ items, showDay = true }) {
  const today = todayISO();
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const shown = showDone ? items : open;
  return (
    <>
      {shown.length > 0 && (
        <ul className="rows school">
          {shown.map((i) => (
            <SchoolRow key={i.id} i={i} showDay={showDay} today={today} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <button className="link-btn show-done" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Hide done' : `${done.length} done · Show`}
        </button>
      )}
    </>
  );
}
