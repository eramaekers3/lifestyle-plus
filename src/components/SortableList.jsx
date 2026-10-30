import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';

/**
 * A vertical list you can reorder by dragging each row's grip (arrow keys work on the grip too).
 *   items:     the things to list (each with an id)
 *   onReorder: called with the items in their new order when a drag ends
 *   children:  (item, grip, index) => the row's contents; put `grip` where the handle should go
 */
export default function SortableList({ items, onReorder, className = 'rows', rowClass = () => 'row', children, as: Tag = 'ul' }) {
  const listRef = useRef(null);
  const rows = useRef(new Map());
  const prev = useRef(null);
  const [order, setOrder] = useState(null);
  const [drag, setDrag] = useState(null); // { id, grabY, y }
  const byId = Object.fromEntries(items.map((t) => [t.id, t]));
  const ids = (order || items.map((t) => t.id)).filter((id) => byId[id]);

  const home = (el) => {
    const r = listRef.current.getBoundingClientRect();
    return { top: r.top + el.offsetTop, h: el.offsetHeight };
  };

  // Slide the other rows into place (FLIP) and keep the dragged row under the finger.
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = null;
    for (const [id, el] of rows.current) {
      if (!el) continue;
      if (drag && id === drag.id) {
        el.style.transform = `translateY(${drag.y - drag.grabY - home(el).top}px)`;
        continue;
      }
      el.style.transform = '';
      const b = before && before.get(id);
      if (b === undefined) continue;
      const dy = b - home(el).top;
      if (!dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.2s var(--ease-out)';
        el.style.transform = '';
      });
    }
  });

  const move = (id, to) => {
    const cur = order || items.map((t) => t.id);
    const from = cur.indexOf(id);
    if (from === to || to < 0 || to >= cur.length) return cur;
    prev.current = new Map([...rows.current].filter(([, el]) => el).map(([k, el]) => [k, home(el).top]));
    const next = [...cur];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    return next;
  };

  const down = (id) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const el = rows.current.get(id);
    setOrder(items.map((t) => t.id));
    setDrag({ id, grabY: e.clientY - home(el).top, y: e.clientY });
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const onMove = (e) => {
    if (!drag) return;
    let target = -1;
    ids.forEach((id, i) => {
      const el = rows.current.get(id);
      if (!el) return;
      const r = home(el);
      if (e.clientY >= r.top && e.clientY < r.top + r.h) target = i;
    });
    if (target !== -1) move(drag.id, target);
    setDrag({ ...drag, y: e.clientY });
    if (e.clientY < 90) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 150) window.scrollBy(0, 10);
  };

  const finish = (next) => onReorder(next.map((id) => byId[id]).filter(Boolean));

  const onUp = () => {
    if (!drag) return;
    const el = rows.current.get(drag.id);
    if (el) {
      el.style.transition = 'transform 0.18s var(--ease-out)';
      el.style.transform = '';
      setTimeout(() => el && (el.style.transition = ''), 200);
    }
    finish(ids);
    setDrag(null);
    setOrder(null);
  };

  // Track the finger on the whole window: rows move around the page while you drag.
  const h = useRef({});
  h.current = { onMove, onUp };
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const mv = (e) => h.current.onMove(e);
    const up = () => h.current.onUp();
    const block = (e) => e.preventDefault();
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block, { passive: false });
    return () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', block);
    };
  }, [dragging]);

  const key = (id) => (e) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = move(id, ids.indexOf(id) + step);
    finish(next);
    setOrder(null);
  };

  return (
    <Tag className={`${className} sortable`} ref={listRef}>
      {ids.map((id, i) => {
        const t = byId[id];
        const grip = (
          <button className="grip" aria-label={`Move “${t.title}”. Drag, or use the arrow keys.`} onPointerDown={down(id)} onKeyDown={key(id)}>
            <Icon name="grip" size={18} />
          </button>
        );
        return (
          <li
            key={id}
            ref={(el) => (el ? rows.current.set(id, el) : rows.current.delete(id))}
            className={`${rowClass(t)}${drag && drag.id === id ? ' dragging' : ''}`}
          >
            {children(t, grip, i)}
          </li>
        );
      })}
    </Tag>
  );
}
