import { useState } from 'react';
import { remove, useSettings } from '../store.js';
import { useStack, pullTask, moveToTop, reopenTask } from '../lib/model.js';
import TaskMeta from '../components/TaskMeta.jsx';
import CaptureSheet from '../components/CaptureSheet.jsx';
import { fmt, iso } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import NowStack from '../components/NowStack.jsx';
import { Icon } from '../components/ui.jsx';

export default function StackView() {
  const { stackLimit } = useSettings();
  const { active, backlog, done } = useStack();
  const [adding, setAdding] = useState(false);
  const room = active.length < stackLimit;

  return (
    <>
      <header className="page-head">
        <h1>Stack</h1>
        <p>Work only on what’s in Now. When a slot opens, pull the next task from the backlog.</p>
      </header>

      <NowStack full />

      <section className="card" aria-labelledby="bl-h">
        <div className="card-head">
          <h2 id="bl-h">Backlog</h2>
          <span className="meta">{backlog.length} waiting</span>
        </div>
        <button className="btn ghost wide add-task-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add a task
        </button>
        {backlog.length ? (
          <ol className="rows backlog">
            {backlog.map((t, i) => (
              <li key={t.id} className="row">
                <span className="pos">{i + 1}</span>
                <span className="row-title">
                  {t.title}
                  <TaskMeta t={t} />
                </span>
                {i > 0 && (
                  <button className="icon-btn sm" onClick={() => moveToTop(t)} aria-label={`Move “${t.title}” to the top`} title="Move to top">
                    <Icon name="up" size={16} />
                  </button>
                )}
                <button className="mini sun" disabled={!room} onClick={() => pullTask(t)}>
                  Pull
                </button>
                <button
                  className="x"
                  onClick={() => {
                    remove(t.id);
                    toast('Task deleted');
                  }}
                  aria-label={`Delete “${t.title}”`}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">Nothing waiting. Capture tasks here or with the + button.</p>
        )}
        {!room && backlog.length > 0 && <p className="hint">Now is full, so pulling is paused.</p>}
      </section>
      {adding && <CaptureSheet onClose={() => setAdding(false)} />}

      {done.length > 0 && (
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
      )}
    </>
  );
}
