import { useEffect, useRef } from 'react';

// Things that use a drag of their own keep it.
const SKIP = '.grip, .slide-check, .school-swipe, .day-pick, textarea, select, [data-nodrag]';

/**
 * Pull a bottom sheet down to close it. Works when the sheet is scrolled to the top (or the drag
 * starts on its handle); otherwise a downward swipe just scrolls, as you'd expect.
 *   ref      the sheet (also its scroll container)
 *   onClose  called after it slides away
 *   scrim    optional: the backdrop, which fades as you pull
 *   key      optional: change it when the element is swapped for another, to re-attach
 */
export function useDragDismiss(ref, onClose, { scrim, key } = {}) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g = null;

    const setScrim = (p) => {
      const s = scrim && scrim.current;
      if (s) s.style.backgroundColor = p == null ? '' : `rgba(14, 17, 22, ${0.55 * (1 - p)})`;
    };

    const start = (e) => {
      g = null;
      if (e.touches.length !== 1) return;
      const t = e.target;
      if (t instanceof Element && t.closest(SKIP)) return;
      const onHandle = t instanceof Element && !!t.closest('.grab-bar, .sheet-head, .live-top');
      const p = e.touches[0];
      g = { x: p.clientX, y: p.clientY, t: performance.now(), lock: null, dy: 0, onHandle, h: el.offsetHeight || window.innerHeight };
    };

    const move = (e) => {
      if (!g) return;
      const p = e.touches[0];
      const dy = p.clientY - g.y;
      const dx = p.clientX - g.x;
      if (!g.lock) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        const down = dy > 0 && Math.abs(dy) > Math.abs(dx);
        g.lock = down && (g.onHandle || el.scrollTop <= 0) ? 'drag' : 'none';
        if (g.lock === 'drag') {
          el.style.transition = 'none';
          // Blur a focused field so the keyboard isn't left floating.
          if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
        }
      }
      if (g.lock !== 'drag') return;
      e.preventDefault();
      g.dy = Math.max(0, dy);
      g.last = { y: dy, t: performance.now() };
      el.style.transform = `translateY(${g.dy}px)`;
      setScrim(Math.min(1, g.dy / g.h));
    };

    const end = () => {
      const s = g;
      g = null;
      if (!s || s.lock !== 'drag') return;
      const v = s.dy / Math.max(1, performance.now() - s.t); // px per ms, overall
      const go = s.dy > Math.min(140, s.h * 0.28) || (v > 0.5 && s.dy > 40);
      if (go) {
        el.style.transition = 'transform 0.2s cubic-bezier(.3,.6,.4,1)';
        el.style.transform = `translateY(${s.h + 40}px)`;
        setScrim(1);
        setTimeout(() => close.current(), 190);
      } else {
        el.style.transition = 'transform 0.3s var(--spring, cubic-bezier(.2,1.3,.4,1))';
        el.style.transform = '';
        setScrim(null);
        setTimeout(() => {
          if (el.isConnected) el.style.transition = '';
        }, 320);
      }
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, scrim, key]);
}
