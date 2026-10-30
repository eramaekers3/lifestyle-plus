import { useEffect, useRef } from 'react';

// Things that already use a sideways drag (or need the finger for themselves) keep it.
const SKIP = [
  'input', 'textarea', 'select', '[contenteditable]',
  '.school-swipe', '.slide-check', '.grip', '.heat-wrap', '.ex-chips', '.tablebox',
  '[data-noswipe]',
].join(',');

/**
 * Swipe sideways to page. The page follows the finger, then slides off and the next one
 * slides in (the caller re-keys it and adds an enter class).
 *
 *   ref      element that listens for the swipe; its first child is what moves
 *   onSwipe  (dir) => void — dir is 1 for next (swiped left), -1 for previous
 *   can      (dir) => bool — false makes that edge feel rubbery and not page
 *   only     optional selector: the swipe must start inside one of these
 *   claim    true for an inner swipe area, so an outer one (tabs) leaves the gesture alone
 */
export function useSwipe(ref, { onSwipe, can = () => true, only, claim = false }) {
  const opts = useRef({});
  opts.current = { onSwipe, can, only, claim };

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let g = null;

    const target = () => root.firstElementChild;

    const start = (e) => {
      g = null;
      if (e.touches.length !== 1 || e.__swipeTaken) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest(SKIP)) return;
      const { only, claim } = opts.current;
      if (only && !t.closest(only)) return;
      if (claim) e.__swipeTaken = true;
      const p = e.touches[0];
      g = { x: p.clientX, y: p.clientY, t: performance.now(), lock: null, dx: 0, el: target(), w: root.offsetWidth || window.innerWidth };
    };

    const move = (e) => {
      if (!g || !g.el) return;
      const p = e.touches[0];
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      if (!g.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (g.lock === 'x') {
          g.el.style.transition = 'none';
          g.el.style.willChange = 'transform';
        }
      }
      if (g.lock !== 'x') return;
      e.preventDefault(); // we own this drag now: no vertical scroll underneath
      const dir = dx < 0 ? 1 : -1;
      g.ok = opts.current.can(dir);
      g.dx = g.ok ? dx : dx * 0.22;
      g.el.style.transform = `translateX(${g.dx}px)`;
      g.el.style.opacity = String(1 - Math.min(0.4, (Math.abs(g.dx) / g.w) * 0.6));
    };

    const end = () => {
      const s = g;
      g = null;
      if (!s || s.lock !== 'x' || !s.el) return;
      const el = s.el;
      const v = s.dx / Math.max(1, performance.now() - s.t); // px per ms
      const dir = s.dx < 0 ? 1 : -1;
      const go = s.ok && (Math.abs(s.dx) > s.w * 0.25 || (Math.abs(v) > 0.3 && Math.abs(s.dx) > 24));

      // The tap that ends a swipe shouldn't also open whatever was under the finger.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      root.addEventListener('click', swallow, true);
      setTimeout(() => root.removeEventListener('click', swallow, true), 350);

      if (!go) {
        el.style.transition = 'transform 0.28s var(--spring, ease-out), opacity 0.28s ease-out';
        el.style.transform = '';
        el.style.opacity = '';
        setTimeout(() => (el.style.transition = el.style.willChange = ''), 300);
        return;
      }
      // Switch right away: the new page mounts on this frame and slides in from the side the
      // finger was heading, so there's no wait between letting go and seeing it.
      opts.current.onSwipe(dir);
      requestAnimationFrame(() => {
        if (!el.isConnected) return; // re-mounted, as expected
        el.style.transition = el.style.transform = el.style.opacity = el.style.willChange = '';
      });
    };

    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    return () => {
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', end);
    };
  }, [ref]);
}
