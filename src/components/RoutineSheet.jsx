import { useState } from 'react';
import { patch, remove, useRecord } from '../store.js';
import { KINDS, newExercise, startSession, updateExercise } from '../lib/workouts.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet } from './ui.jsx';
import SortableList from './SortableList.jsx';

/** Fields for one exercise. Used in the workout editor and on the live workout screen. */
export function ExerciseFields({ e, onChange, onRemove }) {
  return (
    <div className="ex-fields">
      <label className="f" htmlFor={`exn-${e.id}`}>
        Exercise
        <input id={`exn-${e.id}`} className="input" value={e.name} onChange={(v) => onChange({ name: v.target.value })} autoComplete="off" />
      </label>
      <div className="ex-grid">
        <label className="f" htmlFor={`exs-${e.id}`}>
          Sets
          <input
            id={`exs-${e.id}`}
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            max="20"
            value={e.sets ?? ''}
            onChange={(v) => onChange({ sets: v.target.value === '' ? '' : Math.max(1, Math.min(20, +v.target.value)) })}
          />
        </label>
        <label className="f" htmlFor={`exr-${e.id}`}>
          {e.kind === 'time' ? 'Target time' : 'Reps'}
          <input id={`exr-${e.id}`} className="input" value={e.reps || ''} onChange={(v) => onChange({ reps: v.target.value })} placeholder="8–12" autoComplete="off" />
        </label>
        <label className="f" htmlFor={`exrest-${e.id}`}>
          Rest
          <input id={`exrest-${e.id}`} className="input" value={e.rest || ''} onChange={(v) => onChange({ rest: v.target.value })} placeholder="90 sec" autoComplete="off" />
        </label>
      </div>
      <div className="ex-kind">
        <div className="seg" role="group" aria-label="What you log">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={(e.kind || 'weight') === k.id} onClick={() => onChange({ kind: k.id, ...(k.id === 'time' && !e.unit ? { unit: 'sec' } : {}) })}>
              {k.label}
            </button>
          ))}
        </div>
        {e.kind === 'time' && (
          <div className="seg" role="group" aria-label="Time unit">
            {['sec', 'min'].map((u) => (
              <button key={u} type="button" aria-pressed={(e.unit || 'sec') === u} onClick={() => onChange({ unit: u })}>
                {u}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="f" htmlFor={`exnotes-${e.id}`}>
        Notes
        <textarea id={`exnotes-${e.id}`} className="input" rows={2} value={e.notes || ''} onChange={(v) => onChange({ notes: v.target.value })} placeholder="Form cues, substitutions…" />
      </label>
      {onRemove && (
        <button type="button" className="link-btn danger-link" onClick={onRemove}>
          Remove exercise
        </button>
      )}
    </div>
  );
}

const scheme = (e) => `${e.sets} × ${e.reps || '—'}${e.kind === 'time' && e.unit && !/\b(sec|min)\b/.test(e.reps || '') ? ` ${e.unit}` : ''}`;

/** View and edit a workout plan: its name, notes and exercises. Every change saves as you go. */
export default function RoutineSheet({ id, onClose, onStart }) {
  const r = useRecord(id);
  const [open, setOpen] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!r) return null;
  const set = (changes) => patch(r.id, changes);

  const addExercise = () => {
    const e = newExercise();
    set({ exercises: [...r.exercises, e] });
    setOpen(e.id);
  };

  return (
    <Sheet title={r.name || 'Workout'} onClose={onClose}>
      <button
        className="btn wide start-btn"
        style={{ marginTop: 0 }}
        onClick={() => {
          startSession(r);
          onClose();
          onStart && onStart();
        }}
        disabled={!r.exercises.length}
      >
        <Icon name="right" size={18} /> Start workout
      </button>

      <label className="f" htmlFor="rt-name" style={{ marginTop: 16 }}>
        Name
        <input id="rt-name" className="input" value={r.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
      </label>
      <label className="f" htmlFor="rt-tag" style={{ marginTop: 10 }}>
        Length and focus
        <input id="rt-tag" className="input" value={r.tagline || ''} onChange={(e) => set({ tagline: e.target.value })} placeholder="45–60 min · Back and biceps" autoComplete="off" />
      </label>
      <label className="f" htmlFor="rt-intro" style={{ marginTop: 10 }}>
        Before you start
        <textarea id="rt-intro" className="input" rows={2} value={r.intro || ''} onChange={(e) => set({ intro: e.target.value })} placeholder="Warm-up, how to run the session…" />
      </label>

      <div className="card-head" style={{ marginTop: 18 }}>
        <h2>Exercises</h2>
        <span className="meta">{r.exercises.length}</span>
      </div>
      {r.exercises.length > 0 && (
        <SortableList items={r.exercises} onReorder={(list) => set({ exercises: list })} className="rows ex-list" rowClass={() => 'row ex-row'}>
          {(e, grip, i) => (
            <div className="ex-item">
              <div className="ex-line">
                <span className="pos">{i + 1}</span>
                <button className="row-title task-open" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                  <b>{e.name || 'Untitled exercise'}</b>
                  <span className="task-meta">
                    <span>{scheme(e)}</span>
                    {e.rest && <span>rest {e.rest}</span>}
                    {e.kind !== 'weight' && <span>{e.kind === 'time' ? 'time' : 'reps only'}</span>}
                  </span>
                </button>
                {grip}
              </div>
              {open === e.id && (
                <ExerciseFields
                  e={e}
                  onChange={(c) => updateExercise(r, e.id, c)}
                  onRemove={() => {
                    set({ exercises: r.exercises.filter((x) => x.id !== e.id) });
                    setOpen(null);
                  }}
                />
              )}
            </div>
          )}
        </SortableList>
      )}
      <button className="btn ghost wide add-task-btn" style={{ marginTop: 10 }} onClick={addExercise}>
        <Icon name="plus" size={18} /> Add exercise
      </button>

      <label className="f" htmlFor="rt-note" style={{ marginTop: 16 }}>
        Coaching note
        <textarea id="rt-note" className="input" rows={3} value={r.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="Swaps, progressions, things to watch…" />
      </label>

      <div className="btn-row">
        <button className="btn" onClick={onClose}>Done</button>
        <button
          className={`btn ${confirmDelete ? 'danger' : 'ghost'}`}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            remove(r.id);
            toast(`Deleted ${r.name}`);
            onClose();
          }}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete workout'}
        </button>
      </div>
    </Sheet>
  );
}
