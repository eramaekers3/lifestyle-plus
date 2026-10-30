import { useState } from 'react';
import { remove, useRecord } from '../store.js';
import { setTaskPriority, renameTask, useCategories } from '../lib/model.js';
import { toast } from '../lib/toast.js';
import { Sheet } from './ui.jsx';
import { priority, dueLabel } from './TaskMeta.jsx';

const LEVELS = [
  { p: null, label: 'Auto', hint: 'from the due date' },
  { p: 0, label: 'None' },
  { p: 1, label: '!' },
  { p: 2, label: '!!' },
  { p: 3, label: '!!!' },
];
const NAMES = ['No priority', 'Low', 'Medium', 'High'];

/** Tap a task to open it: rename it, set its priority, or delete it. */
export default function TaskSheet({ id, onClose }) {
  const t = useRecord(id);
  const cats = useCategories();
  const [title, setTitle] = useState(t ? t.title : '');
  if (!t) return null;
  const cat = t.category && cats.find((c) => c.id === t.category);
  const due = dueLabel(t);
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

      {(cat || due) && (
        <p className="muted small" style={{ marginTop: 14 }}>
          {cat && <>Category: <b>{cat.name}</b>{due ? ' · ' : ''}</>}
          {due && <>Due <b>{due.text}</b></>}
        </p>
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
