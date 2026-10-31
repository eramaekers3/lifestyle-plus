import { useMemo, useState } from 'react';
import { Sheet } from './ui.jsx';
import { putMany, useSettings } from '../store.js';
import { useStack } from '../lib/model.js';
import { planDay } from '../lib/autoplan.js';
import { fmtDur, minToLabel, nowMin, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

/** Suggested blocks for a day. Tick the ones you want; tap a block afterwards to adjust it. */
export default function AutoPlanSheet({ date, blocks, events, onClose }) {
  const stack = useStack();
  const { dayStart, dayEnd } = useSettings();
  const from = date === todayISO() ? Math.max(dayStart * 60, nowMin() + 5) : dayStart * 60;
  const plan = useMemo(() => planDay(stack, blocks, events, from, dayEnd * 60), [stack, blocks, events, from, dayEnd]);
  const [off, setOff] = useState(() => new Set(plan.filter((p) => p.optional).map((p) => p.key)));
  const picked = plan.filter((p) => !off.has(p.key));
  const toggle = (key) =>
    setOff((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const add = () => {
    putMany(picked.map(({ start, end, title, taskId, type }) => ['block', { date, start, end, title, taskId, type }]));
    toast(`Added ${picked.length} block${picked.length === 1 ? '' : 's'}`);
    onClose();
  };

  return (
    <Sheet title="Auto-plan" onClose={onClose}>
      <p className="muted small">
        Your Now tasks first, then the top of your backlog, fitted around your events and blocks. Tap a block on the timeline later to move it.
      </p>
      {plan.length === 0 ? (
        <p className="muted">
          {stack.active.length + stack.backlog.length === 0
            ? 'Your stack is empty, so there’s nothing to plan.'
            : 'No free time left today that fits a block, or your tasks already have blocks.'}
        </p>
      ) : (
        <ul className="plan-list">
          {plan.map((p) => (
            <li key={p.key}>
              <label className={`plan-row${off.has(p.key) ? ' off' : ''}`}>
                <input type="checkbox" checked={!off.has(p.key)} onChange={() => toggle(p.key)} />
                <span className="plan-time">{minToLabel(p.start)}<small>{fmtDur(p.end - p.start)}</small></span>
                <span className="plan-title">
                  {p.title}
                  <small>{p.type === 'shallow' ? 'Shallow' : p.fromNow ? 'Deep work · from Now' : 'Deep work · from backlog'}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <button className="btn" onClick={add} disabled={!picked.length}>
          {picked.length ? `Add ${picked.length} block${picked.length === 1 ? '' : 's'}` : 'Nothing picked'}
        </button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
