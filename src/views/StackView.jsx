import { useState } from 'react';
import { useSettings } from '../store.js';
import { useStack, pullTask, reopenTask, reorderTasks } from '../lib/model.js';
import SortableList from '../components/SortableList.jsx';
import TaskSheet from '../components/TaskSheet.jsx';
import TaskMeta, { PriorityBadge } from '../components/TaskMeta.jsx';
import CaptureSheet from '../components/CaptureSheet.jsx';
import { fmt, iso } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import NowStack from '../components/NowStack.jsx';
import { Icon } from '../components/ui.jsx';
import RecurSheet from '../components/RecurSheet.jsx';
import CardStack from '../components/CardStack.jsx';
import { useRecurs, scheduleLabel } from '../lib/recurring.js';

export default function StackView() {
  const { stackLimit } = useSettings();
  const { active, backlog, done } = useStack();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const room = active.length < stackLimit;

  return (
    <>
      <header className="page-head">
        <h1>Stack</h1>
        <p>Work only on what’s in Now. When a slot opens, pull the next task from the backlog.</p>
      </header>

      <CardStack
        page="stack"
        cards={[
          { id: 'now', title: 'Now', node: <NowStack full /> },
          {
            id: 'backlog',
            title: 'Backlog',
            node: (
              <section className="card" aria-labelledby="bl-h">
        <div className="card-head">
          <h2 id="bl-h">Backlog</h2>
          <span className="meta">{backlog.length} waiting</span>
        </div>
        <button className="btn ghost wide add-task-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add a task
        </button>
        {backlog.length ? (
          <SortableList
            as="ol"
            className="rows backlog"
            items={backlog}
            onReorder={(list) => reorderTasks(list, 'order')}
            rowClass={(t) => `row${t.createdAt && Date.now() - Date.parse(t.createdAt) < 2500 ? ' just-added' : ''}`}
          >
            {(t, grip, i) => (
              <>
                <span className="pos">{i + 1}</span>
                <button className="row-title task-open" onClick={() => setOpen(t.id)} aria-label={`Open “${t.title}”`}>
                  <span className="title-line"><PriorityBadge t={t} />{t.title}</span>
                  <TaskMeta t={t} />
                </button>
                <button className="mini sun" disabled={!room} onClick={() => pullTask(t)}>
                  Pull
                </button>
                {grip}
              </>
            )}
          </SortableList>
        ) : (
          <p className="empty">Nothing waiting. Capture tasks here or with the + button.</p>
        )}
        {!room && backlog.length > 0 && <p className="hint">Now is full, so pulling is paused.</p>}
      </section>
            ),
          },
          { id: 'repeating', title: 'Repeating', node: <Repeating /> },
          {
            id: 'done',
            title: 'Done recently',
            node: done.length > 0 ? (
              <section className="card" aria-labelledby="done-h">
          <div className="card-head">
            <h2 id="done-h">Done recently</h2>
            <span className="meta">{done.length} total</span>
          </div>
          <ul className="rows">
            {done.slice(0, 8).map((t) => (
              <li key={t.id} className="row done-row">
                <span className="done-mark"><Icon name="check" size={14} /></span>
                <span className="row-title">{t.title}</span>
                <span className="meta">{t.doneAt ? fmt(iso(new Date(t.doneAt)), { month: 'short', day: 'numeric' }) : ''}</span>
                <button className="mini" onClick={() => reopenTask(t)}>Undo</button>
              </li>
            ))}
          </ul>
        </section>
            ) : null,
          },
        ]}
      />
      {adding && <CaptureSheet onClose={() => setAdding(false)} />}
      {open && <TaskSheet id={open} onClose={() => setOpen(null)} />}

    </>
  );
}

/** Repeating tasks: each makes a normal task on the days it's scheduled. */
function Repeating() {
  const recurs = useRecurs();
  const [open, setOpen] = useState(null); // template id, or 'new'
  return (
    <section className="card" aria-labelledby="rc-h">
      <div className="card-head">
        <h2 id="rc-h">Repeating</h2>
        <span className="meta">{recurs.length ? `${recurs.length}` : ''}</span>
        <button className="mini add-blk" onClick={() => setOpen('new')}>
          <Icon name="plus" size={14} /> New
        </button>
      </div>
      {recurs.length ? (
        <ul className="rows">
          {recurs.map((r) => (
            <li key={r.id} className="row">
              <span className="rc-icon" aria-hidden="true"><Icon name="repeat" size={16} /></span>
              <button className="row-title task-open" onClick={() => setOpen(r.id)} aria-label={`Edit “${r.title}”`}>
                <span className="title-line">{r.title}</span>
                <span className="task-meta">
                  <span>{scheduleLabel(r)}</span>
                  <span>{r.to === 'now' ? 'to Now' : 'to backlog'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Chores and routines that come back, like laundry on Sundays. They drop into your stack on their own.</p>
      )}
      {open && <RecurSheet id={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </section>
  );
}
