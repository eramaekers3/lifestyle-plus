import { useState } from 'react';
import { useSettings } from '../store.js';
import { useStack, pullTask, completeTask, sendBack, reorderTasks } from '../lib/model.js';
import SortableList from './SortableList.jsx';
import TaskSheet from './TaskSheet.jsx';
import { toast } from '../lib/toast.js';
import { Icon } from './ui.jsx';
import TaskMeta, { PriorityBadge } from './TaskMeta.jsx';

export function TaskRow({ t, showBack, grip, onOpen }) {
  const [leaving, setLeaving] = useState(false);
  const fresh = t.pulledAt && Date.now() - Date.parse(t.pulledAt) < 1500;
  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      completeTask(t);
      toast('Done. That frees a slot.');
    }, 520);
  };
  return (
    <div className={`task-body${leaving ? ' leaving' : ''}${fresh ? ' fresh' : ''}`}>
      <button className={`check${leaving ? ' on' : ''}`} onClick={finish} aria-label={`Mark “${t.title}” done`}>
        {leaving && <Icon name="check" size={16} />}
      </button>
      <button className="row-title task-open" onClick={() => onOpen(t.id)} aria-label={`Open “${t.title}”`}>
        <span className="title-line"><PriorityBadge t={t} />{t.title}</span>
        <TaskMeta t={t} />
      </button>
      {showBack && !leaving && (
        <button className="mini" onClick={() => sendBack(t)} title="Send back to the backlog">
          Back
        </button>
      )}
      {grip}
    </div>
  );
}

/** The short list of what you're working on now, with a slot limit. */
export default function NowStack({ full = false }) {
  const { stackLimit } = useSettings();
  const { active, backlog } = useStack();
  const free = stackLimit - active.length;
  const next = backlog[0];
  const [open, setOpen] = useState(null);

  return (
    <section className="card now-card" aria-labelledby="now-h">
      <div className="card-head">
        <h2 id="now-h">Now</h2>
        <span className="slots" aria-label={`${active.length} of ${stackLimit} slots used`}>
          {Array.from({ length: Math.max(stackLimit, active.length) }, (_, i) => (
            <i key={i} className={i < active.length ? (i < stackLimit ? 'on' : 'over') : ''} />
          ))}
        </span>
      </div>

      {active.length > 0 && (
        <SortableList items={active} onReorder={(list) => reorderTasks(list, 'nowOrder')} rowClass={() => 'row task'}>
          {(t, grip) => <TaskRow t={t} showBack={full} grip={full ? grip : null} onOpen={setOpen} />}
        </SortableList>
      )}

      {free > 0 &&
        (next ? (
          <button className="pull-btn" onClick={() => pullTask(next)}>
            <span className="pull-label">
              Pull next · {free} slot{free === 1 ? '' : 's'} open
            </span>
            <span className="pull-title">{next.title}</span>
          </button>
        ) : (
          <p className="empty">Your backlog is empty. Tap + to capture a task.</p>
        ))}
      {free <= 0 && <p className="hint">Stack is full. Finish something before you pull more.</p>}

      {!full && (
        <a className="link" href="#stack">
          Backlog · {backlog.length} waiting →
        </a>
      )}
      {open && <TaskSheet id={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
