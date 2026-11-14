import { useEffect, useMemo, useRef, useState } from 'react';
import { MUSCLES, READY_SECS, markStretched, useStretch, useStretched, whyLine } from '../lib/stretch.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet } from './ui.jsx';

const clock = (secs) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hold = (s) => (s.sides ? `${s.secs} sec each side` : `${s.secs} sec`);

/**
 * Tonight's stretch: about 5 minutes, built from today's and yesterday's training.
 * `compact` is the shutdown version (no card around it).
 */
export default function StretchCard({ date, compact = false }) {
  const plan = useStretch(date);
  const done = useStretched(date);
  const [playing, setPlaying] = useState(false);
  const mins = Math.round(plan.secs / 60);

  const body = (
    <>
      <p className="muted small st-why">{whyLine(plan)}</p>
      {plan.focus.length > 0 && (
        <div className="st-focus">
          {plan.focus.map((f) => <span key={f} className="st-tag">{f}</span>)}
        </div>
      )}
      <ol className="st-list">
        {plan.items.map((s) => (
          <li key={s.id}>
            <span className="st-name">{s.name}</span>
            <span className="st-hold">{hold(s)}</span>
          </li>
        ))}
      </ol>
      <button className={`btn wide st-go${done ? ' ghost' : ''}`} onClick={() => setPlaying(true)}>
        <Icon name={done ? 'repeat' : 'play'} size={18} /> {done ? 'Stretched ✓ · Go again' : `Start · ${mins} min`}
      </button>
      {playing && <StretchPlayer plan={plan} date={date} onClose={() => setPlaying(false)} />}
    </>
  );

  if (compact) return body;
  return (
    <section className="card st-card" aria-labelledby="st-h">
      <div className="card-head"><h2 id="st-h">Tonight’s stretch</h2><span className="meta">{done ? 'done ✓' : `~${mins} min`}</span></div>
      {body}
    </section>
  );
}

/** Builds the timeline: get ready, hold (side 1), switch, hold (side 2), next… */
function stepsOf(items) {
  const out = [];
  items.forEach((s, i) => {
    out.push({ kind: 'ready', s, i, secs: READY_SECS, label: 'Get into position' });
    if (s.sides) {
      out.push({ kind: 'hold', s, i, secs: s.secs, label: 'Side 1' });
      out.push({ kind: 'ready', s, i, secs: READY_SECS, label: 'Switch sides' });
      out.push({ kind: 'hold', s, i, secs: s.secs, label: 'Side 2' });
    } else out.push({ kind: 'hold', s, i, secs: s.secs, label: 'Hold' });
  });
  return out;
}

function StretchPlayer({ plan, date, onClose }) {
  const steps = useMemo(() => stepsOf(plan.items), [plan.items]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(steps[0].secs);
  const [finished, setFinished] = useState(false);
  const endRef = useRef(Date.now() + steps[0].secs * 1000);
  const lastTick = useRef(null);

  // Keep the screen on while stretching (iOS 16.4+; ignored where unsupported).
  useEffect(() => {
    let lock = null;
    const get = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    get();
    const vis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, []);

  const go = (n) => {
    if (n >= steps.length) {
      setFinished(true);
      markStretched(date);
      haptic('big');
      toast('Stretch done. Good night.');
      return;
    }
    const i = Math.max(0, n);
    setAt(i);
    setLeft(steps[i].secs);
    endRef.current = Date.now() + steps[i].secs * 1000;
    lastTick.current = null;
    haptic(steps[i].kind === 'hold' ? 'success' : 'tick');
  };

  useEffect(() => {
    if (paused || finished) return undefined;
    const id = setInterval(() => {
      const rem = (endRef.current - Date.now()) / 1000;
      setLeft(rem);
      const whole = Math.ceil(rem);
      if (steps[at].kind === 'hold' && whole <= 3 && whole > 0 && lastTick.current !== whole) {
        lastTick.current = whole;
        haptic('tick');
      }
      if (rem <= 0) go(at + 1);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, paused, finished]);

  const toggle = () => {
    if (paused) endRef.current = Date.now() + left * 1000;
    setPaused(!paused);
    haptic('tick');
  };

  const step = steps[at];
  const next = plan.items[step.i + 1];
  const remaining = steps.slice(at + 1).reduce((a, s) => a + s.secs, 0) + Math.max(0, left);
  const pct = Math.min(1, Math.max(0, 1 - left / step.secs));

  if (finished) {
    return (
      <Sheet title="Stretch" onClose={onClose} top>
        <div className="st-player st-finish">
          <Icon name="moon" size={36} />
          <h2>Done.</h2>
          <p className="muted">{plan.items.length} stretches, {Math.round(plan.secs / 60)} minutes. Lights out soon.</p>
          <button className="btn wide" onClick={onClose}>Close</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Stretch" onClose={onClose} top>
      <div className={`st-player${step.kind === 'ready' ? ' ready' : ''}${paused ? ' paused' : ''}`}>
        <div className="st-dots" aria-label={`Stretch ${step.i + 1} of ${plan.items.length}`}>
          {plan.items.map((s, i) => <i key={s.id} className={i < step.i ? 'done' : i === step.i ? 'on' : ''} />)}
        </div>
        <div className="eyebrow st-phase">{step.label}</div>
        <h2 className="st-title" key={`${step.i}`}>{step.s.name}</h2>
        <div className="st-targets">{Object.keys(step.s.t).slice(0, 3).map((m) => MUSCLES[m]).join(' · ')}</div>
        <div className="st-ring" style={{ '--p': pct }} role="timer" aria-live="off">
          <span className="st-time">{clock(left)}</span>
        </div>
        <p className="st-cue">{step.s.cue}</p>
        <div className="live-nav st-nav">
          <button className="btn ghost" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Back"><Icon name="left" size={18} /></button>
          <button className="btn" onClick={toggle}><Icon name={paused ? 'play' : 'pause'} size={18} /> {paused ? 'Resume' : 'Pause'}</button>
          <button className="btn ghost" onClick={() => go(at + 1)} aria-label="Skip"><Icon name="right" size={18} /></button>
        </div>
        <p className="muted small st-next">
          {next ? <>Next: <b>{next.name}</b> · </> : <>Last one · </>}
          {clock(remaining)} left
        </p>
      </div>
    </Sheet>
  );
}
