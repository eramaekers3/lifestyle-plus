import { useEffect, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { useGame, XP, prLabel, cheer } from '../lib/game.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { fmt, iso } from '../lib/dates.js';

const SEEN_KEY = 'lifestyleplus.levelSeen';
const readSeen = () => {
  try {
    return +localStorage.getItem(SEEN_KEY) || 0;
  } catch {
    return 0;
  }
};
const writeSeen = (n) => {
  try {
    localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    /* storage unavailable */
  }
};

/** Your level in the top bar: a ring that fills with XP toward the next level. Tap for details. */
export default function LevelBadge() {
  const g = useGame();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);

  // Level up: the badge hops and sparks, once per level on this device.
  useEffect(() => {
    const seen = readSeen();
    if (seen && g.level > seen) {
      setUp(true);
      haptic('big');
      toast(`Level ${g.level}! Next one is ${g.need} XP away.`);
      setTimeout(() => ref.current && cheer(ref.current), 250);
      const t = setTimeout(() => setUp(false), 1400);
      writeSeen(g.level);
      return () => clearTimeout(t);
    }
    if (!seen || g.level < seen) writeSeen(g.level);
  }, [g.level, g.need]);

  const R = 15;
  const C = 2 * Math.PI * R;
  return (
    <>
      <button
        ref={ref}
        className={`lvl-badge${up ? ' up' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Level ${g.level}, ${g.into} of ${g.need} XP to the next level. ${g.today} XP today.`}
      >
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="lvl-track" cx="18" cy="18" r={R} />
          <circle className="lvl-fill" cx="18" cy="18" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - g.pct)} />
        </svg>
        <b aria-hidden="true">{g.level}</b>
      </button>
      {open && <GameSheet g={g} onClose={() => setOpen(false)} />}
    </>
  );
}

function GameSheet({ g, onClose }) {
  return (
    <Sheet title={`Level ${g.level}`} onClose={onClose}>
      <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.need} aria-valuenow={g.into}>
        <i style={{ width: `${Math.round(g.pct * 100)}%` }} />
      </div>
      <p className="sheet-sub lvl-sub">
        {g.into} / {g.need} XP · {g.need - g.into} to level {g.level + 1} · {g.total.toLocaleString()} XP total
      </p>

      <div className="tiles lvl-tiles">
        <div className="tile"><span>Today</span><b>{g.today}</b></div>
        <div className="tile"><span>This week</span><b>{g.week}</b></div>
        <div className="tile"><span>Best day</span><b>{g.bestDay}</b></div>
        <div className="tile"><span>Combo</span><b>{g.combo > 1 ? `×${g.combo}` : '—'}</b></div>
      </div>

      <h3 className="mini-h">Personal records</h3>
      {g.prs.length ? (
        <ul className="rows">
          {g.prs.slice(0, 6).map((p, i) => (
            <li key={`${p.at}${p.name}${i}`} className="row">
              <span className="pr-mark" aria-hidden="true">PR</span>
              <span className="row-title">{prLabel(p)}</span>
              <span className="meta">{fmt(iso(new Date(p.at)), { month: 'short', day: 'numeric' })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Beat your best on any exercise (heavier, or more reps) and it shows up here.</p>
      )}

      <h3 className="mini-h">How XP works</h3>
      <ul className="xp-rules">
        <li><b>+{XP.task}</b> finish a task <span className="meta">{g.counts.task}</span></li>
        <li><b>+{XP.habit}</b> check off a habit <span className="meta">{g.counts.habit}</span></li>
        <li><b>+{XP.workout}</b> save a workout, +{XP.perSet} a set <span className="meta">{g.counts.workout}</span></li>
        <li><b>+{XP.pr}</b> set a personal record <span className="meta">{g.prs.length}</span></li>
        <li><b>+2</b> each combo link: finish things within 15 minutes of each other (up to +10)</li>
      </ul>
    </Sheet>
  );
}
