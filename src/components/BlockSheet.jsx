import { useState } from 'react';
import { Sheet } from './ui.jsx';
import { put, remove } from '../store.js';
import { BLOCK_TYPES, useStack } from '../lib/model.js';
import { minToLabel, fmtDur } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

const TIMES = Array.from({ length: 24 * 4 + 1 }, (_, i) => i * 15);
const DURATIONS = [30, 60, 90, 120];

export default function BlockSheet({ block, onClose }) {
  const { active, backlog } = useStack();
  const [f, setF] = useState({ title: '', type: 'deep', taskId: '', ...block });
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const linkable = [...active, ...backlog];
  const bad = f.end <= f.start;
  const [showAll, setShowAll] = useState(false);
  const picked = linkable.find((t) => t.id === f.taskId);
  // While typing (and nothing picked yet), narrow the stack to tasks that match.
  const q = picked ? '' : f.title.trim().toLowerCase();
  const match = (t) => !q || t.title.toLowerCase().includes(q);
  const nowOpts = active.filter(match);
  const backOpts = backlog.filter(match);
  const BACK_MAX = 6;
  const backShown = showAll || q ? backOpts : backOpts.slice(0, BACK_MAX);

  const pick = (t) =>
    setF((x) => {
      if (x.taskId === t.id) {
        // Unlink; clear the title too if it was just the task's name.
        return { ...x, taskId: '', title: x.title === t.title ? '' : x.title };
      }
      const prev = linkable.find((p) => p.id === x.taskId);
      const keepTitle = x.title.trim() && !(prev && x.title === prev.title) && !t.title.toLowerCase().includes(x.title.trim().toLowerCase());
      return { ...x, taskId: t.id, title: keepTitle ? x.title : t.title };
    });

  const taskChip = (t) => (
    <button
      type="button"
      key={t.id}
      className="chip task-chip"
      aria-pressed={f.taskId === t.id}
      onClick={() => pick(t)}
    >
      {f.taskId === t.id && <span className="tick" aria-hidden="true">✓</span>}
      <span className="tc-title">{t.title}</span>
    </button>
  );

  const save = (e) => {
    e.preventDefault();
    if (bad) return;
    const task = linkable.find((t) => t.id === f.taskId);
    const title = f.title.trim() || (task ? task.title : 'Untitled block');
    put('block', { ...f, title });
    toast(block.id ? 'Block updated' : 'Block added');
    onClose();
  };

  return (
    <Sheet title={block.id ? 'Edit block' : 'New block'} onClose={onClose}>
      <form className="form-grid" onSubmit={save}>
        <label className="f full" htmlFor="blk-title">
          What
          <input
            id="blk-title"
            className="input"
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={linkable.length ? 'Type, or pick from your stack below' : 'e.g. Write report intro'}
            autoComplete="off"
            autoFocus={!block.id}
          />
        </label>

        {linkable.length > 0 && (
          <div className="f full stack-pick">
            <span className="f-label">
              From your stack
              {picked && <span className="muted-n">Linked — tap again to unlink</span>}
            </span>
            {nowOpts.length > 0 && (
              <>
                <span className="sp-group">Now</span>
                <div className="chips">{nowOpts.map(taskChip)}</div>
              </>
            )}
            {backOpts.length > 0 && (
              <>
                <span className="sp-group">Backlog</span>
                <div className="chips">
                  {backShown.map(taskChip)}
                  {backShown.length < backOpts.length && (
                    <button type="button" className="chip more-chip" onClick={() => setShowAll(true)}>
                      +{backOpts.length - backShown.length} more
                    </button>
                  )}
                </div>
              </>
            )}
            {!nowOpts.length && !backOpts.length && <span className="muted-n">No stack tasks match “{f.title.trim()}”</span>}
          </div>
        )}

        <div className="f full">
          Kind
          <div className="chips">
            {BLOCK_TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`chip type-chip t-${t.id}`}
                aria-pressed={f.type === t.id}
                onClick={() => set('type', t.id)}
              >
                <i aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="f" htmlFor="blk-start">
          Starts
          <select
            id="blk-start"
            className="input"
            value={f.start}
            onChange={(e) => {
              const s = +e.target.value;
              setF((x) => ({ ...x, start: s, end: Math.min(1440, s + Math.max(15, x.end - x.start)) }));
            }}
          >
            {TIMES.slice(0, -1).map((m) => (
              <option key={m} value={m}>{minToLabel(m)}</option>
            ))}
          </select>
        </label>
        <label className="f" htmlFor="blk-end">
          Ends
          <select id="blk-end" className="input" value={f.end} onChange={(e) => set('end', +e.target.value)}>
            {TIMES.slice(1).map((m) => (
              <option key={m} value={m}>{m === 1440 ? 'midnight' : minToLabel(m)}</option>
            ))}
          </select>
        </label>

        <div className="f full">
          <span className="f-label">Length {bad ? <span className="err">End time must be after the start</span> : <span className="muted-n">{fmtDur(f.end - f.start)}</span>}</span>
          <div className="chips">
            {DURATIONS.map((d) => (
              <button
                type="button"
                key={d}
                className="chip"
                aria-pressed={f.end - f.start === d}
                onClick={() => set('end', Math.min(1440, f.start + d))}
              >
                {fmtDur(d)}
              </button>
            ))}
          </div>
        </div>

        <div className="btn-row full">
          <button className="btn" disabled={bad}>{block.id ? 'Save' : 'Add block'}</button>
          {block.id && (
            <button
              type="button"
              className={`btn ${confirmDel ? 'danger' : 'ghost'}`}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                remove(block.id);
                toast('Block deleted');
                onClose();
              }}
            >
              {confirmDel ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
