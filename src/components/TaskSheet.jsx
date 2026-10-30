import { useState } from 'react';
import { remove, useRecord } from '../store.js';
import { setTaskPriority, renameTask } from '../lib/model.js';
import { patch } from '../store.js';
import { CategoryStep, DateStep, TimeStep } from './CaptureSheet.jsx';
import { toast } from '../lib/toast.js';
import { Sheet } from './ui.jsx';
import { priority } from './TaskMeta.jsx';
import RecurSheet from './RecurSheet.jsx';
import { Icon } from './ui.jsx';
import { scheduleLabel } from '../lib/recurring.js';

const LEVELS = [
  { p: null, label: 'Auto', hint: 'from the due date' },
  { p: 0, label: 'None' },
  { p: 1, label: '!' },
  { p: 2, label: '!!' },
  { p: 3, label: '!!!' },
];
const NAMES = ['No priority', 'Low', 'Medium', 'High'];

const toInput = (m) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const fromInput = (v) => {
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

/** Tap a task to open it and change anything: name, priority, category, due date and time, or delete it. */
export default function TaskSheet({ id, onClose }) {
  const t = useRecord(id);
  const [title, setTitle] = useState(t ? t.title : '');
  const [repeat, setRepeat] = useState(false);
  const recur = useRecord((t && t.recurId) || '__none');
  if (!t) return null;
  const manual = t.priority !== undefined && t.priority !== null;
  const auto = priority({ ...t, priority: null });
  const close = () => {
    renameTask(t, title);
    onClose();
  };

  return (
    <Sheet title="Task" onClose={close}>
      <label className="f" htmlFor="task-title">
        Name
        <input id="task-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => renameTask(t, title)} autoComplete="off" />
      </label>

      <p className="cap-label" style={{ marginTop: 16 }}>Priority</p>
      <div className="seg prio-seg" role="group" aria-label="Priority">
        {LEVELS.map((l) => (
          <button key={l.label} aria-pressed={manual ? t.priority === l.p : l.p === null} onClick={() => setTaskPriority(t, l.p)}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="hint-quiet">
        {manual
          ? `${NAMES[t.priority]}, set by you. Auto would be ${NAMES[auto].toLowerCase()}.`
          : t.due
            ? `Auto: ${NAMES[auto].toLowerCase()} — !!! due today, !! tomorrow, ! in 2–3 days.`
            : 'Auto goes by the due date, and this task has none. Pick a level to set one yourself.'}
      </p>

      <div className="edit-sec">
        <CategoryStep autoAdd={false} category={t.category || null} setCategory={(c) => patch(t.id, { category: c })} />
      </div>

      <div className="edit-sec">
        <DateStep
          label="Due date"
          due={t.due || null}
          setDue={(d) => patch(t.id, d ? { due: d } : { due: null, dueTime: null })}
        />
      </div>

      {t.due && (
        <div className="edit-sec">
          <TimeStep due={t.due} time={toInput(t.dueTime)} setTime={(v) => patch(t.id, { dueTime: fromInput(v) })} />
        </div>
      )}

      <div className="edit-sec">
        <p className="cap-label">Repeat</p>
        <button className="mini repeat-btn" onClick={() => setRepeat(true)}>
          <Icon name="repeat" size={14} /> {recur ? `${scheduleLabel(recur)} · edit` : 'Make this repeat'}
        </button>
      </div>
      {repeat && (
        <RecurSheet id={recur ? recur.id : null} fromTask={recur ? null : { ...t, title }} onClose={() => setRepeat(false)} />
      )}

      <div className="btn-row">
        <button className="btn" onClick={close}>Done</button>
        <button
          className="btn ghost"
          onClick={() => {
            remove(t.id);
            toast('Task deleted');
            onClose();
          }}
        >
          Delete task
        </button>
      </div>
    </Sheet>
  );
}
