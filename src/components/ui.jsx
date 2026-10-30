import { useEffect, useMemo, useRef, useState } from 'react';
import { heartSVG } from '../lib/logo.js';
import { createPortal } from 'react-dom';
import { pad } from '../lib/dates.js';
import { useToast } from '../lib/toast.js';

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------- Logo ---------- */
export function HeartMark({ color, size = 30, className = 'heart-mark' }) {
  const html = useMemo(() => heartSVG(color, { id: `hm${String(color).replace(/\W/g, '')}` }), [color]);
  return <span className={className} style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- Icons ---------- */
const paths = {
  plan: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h4" /></>,
  stack: <><path d="M12 3.8 3.5 8.2 12 12.6l8.5-4.4L12 3.8Z" /><path d="m3.5 12.4 8.5 4.4 8.5-4.4" /><path d="m3.5 16.4 8.5 4.4 8.5-4.4" /></>,
  habits: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.3 2.7 2.7L16 9.6" /></>,
  body: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  check: <path d="m5.5 12.5 4 4 9-9.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 18V6M6.5 11.5 12 6l5.5 5.5" />,
  back: <path d="M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12" />,
  out: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" /></>,
  school: <><path d="m2.5 9 9.5-4.5L21.5 9 12 13.5 2.5 9Z" /><path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5" /></>,
  grip: <><circle cx="9" cy="6.5" r="1.3" /><circle cx="15" cy="6.5" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="9" cy="17.5" r="1.3" /><circle cx="15" cy="17.5" r="1.3" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
};
export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/* ---------- Bottom sheet ---------- */

/**
 * The part of the screen you can actually see. On iPhone the keyboard slides over the page instead
 * of shrinking it, so sheets size themselves to this to stay above the keyboard.
 */
function useVisibleArea() {
  const read = () => {
    const vv = window.visualViewport;
    if (!vv) return null;
    return { top: vv.offsetTop, height: vv.height, keyboard: window.innerHeight - vv.height > 120 };
  };
  const [area, setArea] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Only follow real size changes (the keyboard opening or closing), not scrolling, and ignore
    // sub-pixel jitter: reacting to every scroll fights iPhone's own scroll-to-the-text-box and
    // makes the sheet jump back and forth.
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setArea((prev) => {
          const next = read();
          if (prev && next && Math.abs(prev.height - next.height) < 2 && Math.abs(prev.top - next.top) < 2) return prev;
          return next;
        })
      );
    };
    vv.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
    };
  }, []);
  return area;
}

export function Sheet({ title, onClose, children }) {
  const area = useVisibleArea();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Runs once per sheet. (onClose is often a fresh function each render; re-running this on every
  // keystroke would unpin and re-pin the page, which makes it jump.)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    // Pin the page in place while a sheet is open, so iPhone can't scroll it underneath.
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    Object.assign(b, { position: 'fixed', top: `-${y}px`, width: '100%', overflow: 'hidden' });
    return () => {
      window.removeEventListener('keydown', onKey);
      Object.assign(b, prev);
      window.scrollTo(0, y);
    };
  }, []);
  return createPortal(
    <div
      className={`scrim${area && area.keyboard ? ' kb' : ''}`}
      style={area ? { top: area.top, height: area.height, bottom: 'auto', '--vh': `${area.height}px` } : undefined}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>×</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Split-flap clock ---------- */
function Flap({ ch }) {
  const [shown, setShown] = useState(' ');
  const [from, setFrom] = useState(null);
  useEffect(() => {
    if (ch === shown) return;
    setFrom(shown);
    setShown(ch);
    const t = setTimeout(() => setFrom(null), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);
  return (
    <span className="flap" aria-hidden="true">
      <span className="half top"><span>{shown}</span></span>
      <span className="half bot"><span>{from ?? shown}</span></span>
      {from !== null && (
        <>
          <span className="half top flip-top" key={`t${shown}`}><span>{from}</span></span>
          <span className="half bot flip-bot" key={`b${shown}`}><span>{shown}</span></span>
        </>
      )}
    </span>
  );
}

export function FlipClock() {
  const now = new Date(useNow(5000));
  const h = now.getHours() % 12 || 12;
  const m = pad(now.getMinutes());
  const hs = String(h).padStart(2, ' ');
  const ap = now.getHours() >= 12 ? 'pm' : 'am';
  return (
    <div className="flip" role="timer" aria-label={`${h}:${m} ${ap}`}>
      <Flap ch={hs[0]} />
      <Flap ch={hs[1]} />
      <span className="colon" aria-hidden="true">:</span>
      <Flap ch={m[0]} />
      <Flap ch={m[1]} />
      <span className="ampm" aria-hidden="true">{ap}</span>
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toaster() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="toast" key={t.key} role="status">
      {t.text}
    </div>
  );
}
