import { useState } from 'react';
import { patch, useRecord } from '../store.js';
import { newId } from '../lib/ids.js';
import { DAY_NAMES, saveRecur, deleteRecur, scheduleLabel } from '../lib/recurring.js';
import { parse, todayISO } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { Sheet } from './ui.jsx';
import { CategoryStep } from './CaptureSheet.jsx';

const EVERY = [
  { id: 'day', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'week', label: 'Certain days' },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Make or edit a repeating task.
 *   id:       an existing template to edit
 *   fromTask: a task to turn into a repeating one (it becomes today's copy)
 */
export default function RecurSheet({ id, fromTask, onClose }) {
  const existing = useRecord(id || '__none');
  const [f, setF] = useState(() =>
    existing
      ? { ...existing }
      : {
          title: fromTask ? fromTask.title : '',
          every: 'week',
          days: [parse(todayISO()).getDay()],
          to: 'backlog',
          category: fromTask ? fromTask.category || null : null,
        }
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleDay = (d) => set('days', f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]);
  const bad = !f.title.trim() || (f.every === 'week' && !f.days.length);

  const save = (e) => {
    e.preventDefault();
    if (bad) return;
    const rid = (existing && existing.id) || newId();
    // Link the task first, so it counts as the open copy and no duplicate is made for today.
    if (fromTask) patch(fromTask.id, { recurId: rid });
    saveRecur({ ...f, id: rid });
    toast(existing ? 'Repeat updated' : `Repeats: ${scheduleLabel(f).toLowerCase()}`);
    onClose();
  };

  return (
    <Sheet title={existing ? 'Repeating task' : 'New repeating task'} onClose={onClose}>
      <form onSubmit={save} className="recur-form">
        <label className="f" htmlFor="rc-title">
          What
          <input
            id="rc-title"
            className="input"
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Do laundry"
            autoComplete="off"
            autoFocus={!existing && !fromTask}
          />
        </label>

        <p className="cap-label">How often</p>
        <div className="seg recur-seg" role="group" aria-label="How often">
          {EVERY.map((o) => (
            <button type="button" key={o.id} aria-pressed={f.every === o.id} onClick={() => set('every', o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        {f.every === 'week' && (
          <div className="day-pick" role="group" aria-label="Which days">
            {WEEK_ORDER.map((d) => (
              <button type="button" key={d} aria-pressed={f.days.includes(d)} onClick={() => toggleDay(d)}>
                {DAY_NAMES[d].slice(0, 2)}
              </button>
            ))}
          </div>
        )}

        <p className="cap-label">Where it goes</p>
        <div className="seg recur-seg" role="group" aria-label="Where it goes">
          <button type="button" aria-pressed={f.to !== 'now'} onClick={() => set('to', 'backlog')}>Top of backlog</button>
          <button type="button" aria-pressed={f.to === 'now'} onClick={() => set('to', 'now')}>Straight to Now</button>
        </div>
        <p className="hint-quiet">
          {f.to === 'now' ? 'Goes into Now when there’s room, otherwise to the top of the backlog.' : 'Waits at the top of the backlog until you pull it.'}{' '}
          It’s due the day it appears. If the last one isn’t done yet, no new copy is made.
        </p>

        <div className="edit-sec">
          <CategoryStep autoAdd={false} category={f.category || null} setCategory={(c) => set('category', c)} />
        </div>

        <div className="btn-row">
          <button className="btn" disabled={bad}>{existing ? 'Save' : 'Repeat it'}</button>
          {existing && (
            <button
              type="button"
              className={`btn ${confirmDel ? 'danger' : 'ghost'}`}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                deleteRecur(existing);
                toast('Stopped repeating');
                onClose();
              }}
            >
              {confirmDel ? 'Tap again to stop' : 'Stop repeating'}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
