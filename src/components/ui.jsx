import { useEffect, useState } from 'react';
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
};
export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
