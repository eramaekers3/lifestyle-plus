import { stepPlace, toggleShootStep, useShootFor } from '../lib/shootStack.js';
import { useState } from 'react';
import { remove, useRecord } from '../store.js';
import { setTaskPriority, renameTask, setSteps } from '../lib/model.js';
import { idFor } from '../lib/ids.js';
import { haptic } from '../lib/haptics.js';
import { patch } from '../store.js';
import { CategoryStep, DateStep, EstimateStep, TimeStep } from './CaptureSheet.jsx';
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

      {t.shootStepId && (
        <div className="edit-sec">
          <ShootSteps t={t} />
        </div>
      )}
      {!t.shootId && <OwnSteps t={t} />}

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
          : t.recurId
            ? 'Auto doesn’t flag repeating tasks. Pick a level to set one yourself.'
            : t.due
              ? `Auto: ${NAMES[auto].toLowerCase()}. It goes by the due date and size: !!! if overdue or due today and 1h+, otherwise ! for today; !! for 2h+ due tomorrow.${t.estimate ? '' : ' With no time needed set, it counts as small.'}`
              : 'Auto goes by the due date, and this task has none. Pick a level to set one yourself.'}
      </p>

      <div className="edit-sec">
        <EstimateStep label="Time needed" estimate={t.estimate || null} setEstimate={(m) => patch(t.id, { estimate: m })} />
      </div>

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

      {t.shootId && (
        <div className="edit-sec">
          {t.link && <a className="btn ghost" href={t.link} target="_blank" rel="noreferrer">Open gallery</a>}
          <p className="hint-quiet">
            {t.shootStepId
              ? 'From shoot+. Check off any step above, in any order, and it’s checked off in shoot+ too. Finishing this task checks off this step, and the next open one takes its place.'
              : 'From shoot+. Finishing this task marks the gallery delivered there too.'}
          </p>
        </div>
      )}

      {t.link && !t.shootId && (
        <div className="edit-sec">
          <a className="btn ghost" href={t.link} target="_blank" rel="noreferrer">Open in Canvas</a>
          <p className="hint-quiet">From Canvas{t.course ? ` · ${t.course}` : ''}. Finishing this task checks it off in School too.</p>
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

/** The whole shoot, layered. Tap any step to check it off (or back on), in any order. */
function ShootSteps({ t }) {
  const shoot = useShootFor(t);
  const place = stepPlace(shoot, t.shootStepId);
  if (!place) return null;
  return (
    <>
      <p className="sub-h shoot-steps-h">{shoot.what} · step {place.n} of {place.total}</p>
      <ol className="shoot-steps tappable">
        {place.steps.map((x) => (
          <li key={x.id} className={x.id === t.shootStepId && !x.done ? 'cur' : x.done ? 'done' : 'later'}>
            <button
              type="button"
              aria-pressed={!!x.done}
              onClick={() => {
                haptic('tick');
                toggleShootStep(shoot.id, x.id, !x.done);
              }}
            >
              <i aria-hidden="true" />
              {x.label}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Steps on your own task: it stays one task in your stack, showing the next open step. */
function OwnSteps({ t }) {
  const steps = t.steps || [];
  const [text, setText] = useState('');
  const add = (e) => {
    e.preventDefault();
    const label = text.trim();
    if (!label) return;
    setSteps(t, [...steps, { id: idFor(`step:${t.id}:${Date.now()}`), label, done: false }]);
    setText('');
  };
  const toggle = (x) => {
    haptic('tick');
    setSteps(t, steps.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)));
  };
  const drop = (x) => setSteps(t, steps.filter((y) => y.id !== x.id));
  const next = steps.find((x) => !x.done);
  return (
    <div className="edit-sec">
      <p className="cap-label">Steps</p>
      {steps.length > 0 && (
        <ol className="shoot-steps tappable">
          {steps.map((x) => (
            <li key={x.id} className={x.done ? 'done' : x === next ? 'cur' : 'later'}>
              <button type="button" aria-pressed={!!x.done} onClick={() => toggle(x)}>
                <i aria-hidden="true" />
                {x.label}
              </button>
              <button type="button" className="step-x" onClick={() => drop(x)} aria-label={`Remove step “${x.label}”`}>×</button>
            </li>
          ))}
        </ol>
      )}
      <form className="inline" onSubmit={add}>
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={steps.length ? 'Add another step' : 'Add a step to layer this task'} enterKeyHint="done" />
        <button className="mini sun" disabled={!text.trim()}>Add</button>
      </form>
      <p className="hint-quiet">
        {steps.length
          ? 'Checking this task off in your stack finishes the next step. The last step finishes the task.'
          : 'Break a task into steps. It stays one task in your stack and shows one step at a time.'}
      </p>
    </div>
  );
}
