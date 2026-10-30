import { useEffect, useRef, useState } from 'react';
import {
  useSession, totalMs, exerciseMs, clock, goToExercise, pauseSession, resumeSession, resetExerciseClock,
  updateRow, addRow, removeRow, editSessionExercise, addSessionExercise, removeSessionExercise, summarize,
  finishSession, discardSession, addSessionExercises, sessionChanged, saveSessionAsRoutine,
} from '../lib/workouts.js';
import { libraryEntry, groupOf, GROUPS } from '../lib/exercises.js';
import { musclesFor } from '../lib/lifting.js';
import MuscleIcon from './MuscleIcon.jsx';
import { useDragDismiss } from '../lib/dragDismiss.js';
import ExercisePicker from './ExercisePicker.jsx';
import { toast } from '../lib/toast.js';
import { Icon, useNow } from './ui.jsx';
import { ExerciseFields } from './RoutineSheet.jsx';

const fmtSet = (e, s) =>
  e.kind === 'weight' ? `${s.wt || 0}×${s.reps}` : e.kind === 'time' ? `${s.reps} ${e.unit || 'sec'}` : `${s.reps}`;

/** A small bar on every screen while a workout is running. Tap it to go back to the workout. */
export function WorkoutPill({ onOpen }) {
  const s = useSession();
  const now = useNow(1000);
  if (!s) return null;
  return (
    <button className={`wo-pill${s.pausedAt ? ' paused' : ''}`} onClick={onOpen} aria-label={`Back to ${s.name}`}>
      <span className="dot" aria-hidden="true" />
      <b>{s.name}</b>
      <span className="t">{clock(totalMs(s, now))}</span>
    </button>
  );
}

/** The screen for a workout in progress: total and per-exercise stopwatches, and every set's weight and reps. */
export default function LiveWorkout({ onMinimize }) {
  const s = useSession();
  const now = useNow(250);
  const [editing, setEditing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // exercise id waiting for a second tap
  const chips = useRef(null);
  // Pull the workout screen down (from the top) to tuck it away into the pill; the workout keeps running.
  const liveRef = useRef(null);
  useDragDismiss(liveRef, () => onMinimize(), { key: `${!!s}:${finishing}` });

  // Keep the current exercise's chip in view.
  useEffect(() => {
    const el = chips.current && chips.current.querySelector('[aria-current="step"]');
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [s && s.cur]);

  // The page behind stays put while this screen is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!s) return null;
  const paused = !!s.pausedAt;
  const i = Math.min(s.cur, Math.max(0, s.exercises.length - 1));
  const e = s.exercises[i];
  const doneCount = (x) => x.rows.filter((r) => r.done).length;

  if (finishing) {
    const sum = summarize(s, now);
    return (
      <div className="live" ref={liveRef} role="dialog" aria-modal="true" aria-label="Finish workout">
        <div className="live-finish">
          <p className="eyebrow">Finish workout</p>
          <h1>{s.name}</h1>
          <div className="tiles">
            <div className="tile"><span>Time</span><b>{clock(sum.durationSec * 1000)}</b></div>
            <div className="tile"><span>Sets done</span><b>{sum.sets}</b></div>
            <div className="tile"><span>Exercises</span><b>{sum.exercises.length}</b></div>
            <div className="tile"><span>Volume</span><b>{sum.volume ? `${Math.round(sum.volume).toLocaleString()} lb` : '—'}</b></div>
          </div>
          {!sum.sets && <p className="muted small">No sets are checked off yet, so there’s nothing to save. Check off the sets you did, or discard the workout.</p>}
          <button
            className="btn wide"
            disabled={!sum.sets}
            onClick={() => {
              finishSession();
              toast('Workout saved');
              onMinimize();
            }}
          >
            Save workout
          </button>
          <SaveAsNew s={s} />
          <button className="btn ghost wide" onClick={() => setFinishing(false)}>Keep going</button>
          <button
            className={`link-btn ${confirmDiscard ? 'danger-link' : ''}`}
            onClick={() => {
              if (!confirmDiscard) return setConfirmDiscard(true);
              discardSession();
              toast('Workout discarded');
              onMinimize();
            }}
          >
            {confirmDiscard ? 'Tap again to discard without saving' : 'Discard workout'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="live" ref={liveRef} role="dialog" aria-modal="true" aria-label={`${s.name} in progress`}>
      <div className="grab-bar" aria-hidden="true" />
      <header className="live-top">
        <button className="icon-btn" onClick={onMinimize} aria-label="Minimize workout">
          <Icon name="down" size={20} />
        </button>
        <div className="live-title">
          <span className="eyebrow">{paused ? 'Paused' : 'In progress'}</span>
          <b>{s.name}</b>
        </div>
        <button className="btn finish-btn" onClick={() => setFinishing(true)}>Finish</button>
      </header>

      <section className={`total-clock${paused ? ' paused' : ''}`} aria-label="Workout time">
        <span className="big" role="timer">{clock(totalMs(s, now))}</span>
        <button className="btn ghost" onClick={paused ? resumeSession : pauseSession}>
          <Icon name={paused ? 'play' : 'pause'} size={18} /> {paused ? 'Resume' : 'Pause'}
        </button>
      </section>

      {s.exercises.length > 0 && (
        <nav className="ex-chips" ref={chips} aria-label="Exercises">
          {s.exercises.map((x, j) => {
            const d = doneCount(x);
            return (
              <button
                key={x.id}
                className={`ex-chip${d && d >= x.rows.length ? ' complete' : d ? ' started' : ''}`}
                aria-current={j === i ? 'step' : undefined}
                onClick={() => {
                  goToExercise(j);
                  setEditing(false);
                  setShowNotes(false);
                }}
              >
                <span className="n">{d && d >= x.rows.length ? <Icon name="check" size={12} /> : j + 1}</span>
                {x.name}
              </button>
            );
          })}
        </nav>
      )}

      {e ? (
        <section className="card live-ex" key={e.id}>
          <div className="live-ex-head">
            <div>
              <span className="eyebrow">Exercise {i + 1} of {s.exercises.length}</span>
              <h2>{e.name}</h2>
              <ExFocus e={e} />
              <p className="target">
                {e.target.sets} × {e.target.reps || '—'}
                {e.target.rest && <> · rest {e.target.rest}</>}
              </p>
            </div>
            <div className="live-ex-btns">
              <button className="mini" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                {editing ? 'Done' : 'Edit'}
              </button>
              <button
                className={`mini${confirmRemove === e.id ? ' danger' : ''}`}
                onClick={() => {
                  if (confirmRemove !== e.id) {
                    setConfirmRemove(e.id);
                    setTimeout(() => setConfirmRemove((c) => (c === e.id ? null : c)), 3000);
                    return;
                  }
                  removeSessionExercise(i);
                  setConfirmRemove(null);
                  setEditing(false);
                  toast(`Removed ${e.name}`);
                }}
                aria-label={confirmRemove === e.id ? `Tap again to remove ${e.name}` : `Remove ${e.name} from this workout`}
              >
                {confirmRemove === e.id ? 'Remove?' : 'Remove'}
              </button>
            </div>
          </div>

          {editing ? (
            <ExerciseFields
              e={{ ...e, ...e.target, sets: e.target.sets, notes: e.target.notes }}
              onChange={(c) => {
                const { name, kind, unit, ...rest } = c;
                editSessionExercise(i, {
                  ...(name !== undefined ? { name } : {}),
                  ...(kind !== undefined ? { kind } : {}),
                  ...(unit !== undefined ? { unit } : {}),
                  ...(Object.keys(rest).length ? { target: { ...e.target, ...rest } } : {}),
                });
              }}
              onRemove={() => {
                removeSessionExercise(i);
                setEditing(false);
              }}
            />
          ) : (
            e.target.notes && (
              <button className={`ex-notes${showNotes ? ' open' : ''}`} onClick={() => setShowNotes((v) => !v)}>
                {e.target.notes}
              </button>
            )
          )}

          <div className={`ex-clock${paused ? ' paused' : ''}`}>
            <span className="label">This exercise</span>
            <span className="t" role="timer">{clock(exerciseMs(s, i, now))}</span>
            <button className="icon-btn sm" onClick={() => resetExerciseClock(i)} aria-label="Reset this exercise’s stopwatch" title="Reset">
              <Icon name="back" size={16} />
            </button>
          </div>

          {e.last && e.last.length > 0 && (
            <p className="last-time">Last time: {e.last.map((x) => fmtSet(e, x)).join(', ')}{e.kind === 'weight' ? ' lb' : ''}</p>
          )}

          <div className={`set-table k-${e.kind}`} role="table" aria-label="Sets">
            <div className="set-row head" role="row">
              <span>Set</span>
              {e.kind === 'weight' && <span>lb</span>}
              <span>{e.kind === 'time' ? e.unit || 'sec' : 'Reps'}</span>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </div>
            {e.rows.map((r, k) => (
              <div className={`set-row${r.done ? ' done' : ''}`} role="row" key={k}>
                <span className="set-n">{k + 1}</span>
                {e.kind === 'weight' && (
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={r.wt}
                    placeholder="0"
                    onChange={(v) => updateRow(i, k, { wt: v.target.value.replace(/[^\d.,]/g, '') })}
                    aria-label={`Set ${k + 1} weight in pounds`}
                  />
                )}
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  value={r.reps}
                  placeholder="0"
                  onChange={(v) => updateRow(i, k, { reps: v.target.value.replace(/[^\d.]/g, '') })}
                  aria-label={`Set ${k + 1} ${e.kind === 'time' ? `time in ${e.unit || 'seconds'}` : 'reps'}`}
                />
                <button
                  className={`check${r.done ? ' on' : ''}`}
                  onClick={(ev) => {
                    if (r.done) return updateRow(i, k, { done: false });
                    // An empty set takes the numbers from the set above it; if there are none, type them first.
                    const prev = e.rows[k - 1];
                    const fill = { reps: r.reps || (prev && prev.reps) || '', wt: r.wt || (prev && prev.wt) || '' };
                    const missing = !fill.reps ? 'reps' : e.kind === 'weight' && fill.wt === '' ? 'wt' : null;
                    if (missing) {
                      const inputs = ev.currentTarget.parentElement.querySelectorAll('input');
                      (missing === 'wt' || inputs.length === 1 ? inputs[0] : inputs[1]).focus();
                      toast(missing === 'reps' ? (e.kind === 'time' ? 'Enter the time first' : 'Enter your reps first') : 'Enter the weight first');
                      return;
                    }
                    if (navigator.vibrate) navigator.vibrate(10);
                    updateRow(i, k, { ...fill, done: true });
                  }}
                  aria-pressed={r.done}
                  aria-label={`Set ${k + 1} ${r.done ? 'done' : 'not done'}`}
                >
                  {r.done && <Icon name="check" size={16} />}
                </button>
                <button className="x" onClick={() => removeRow(i, k)} aria-label={`Remove set ${k + 1}`}>×</button>
              </div>
            ))}
          </div>
          <button className="btn ghost wide add-set" onClick={() => addRow(i)}>
            <Icon name="plus" size={16} /> Add set
          </button>

          <div className="live-nav">
            <button className="btn ghost" onClick={() => goToExercise(i - 1)} disabled={i === 0}>
              <Icon name="left" size={18} /> Prev
            </button>
            {i < s.exercises.length - 1 ? (
              <button className="btn" onClick={() => { goToExercise(i + 1); setEditing(false); setShowNotes(false); }}>
                Next <Icon name="right" size={18} />
              </button>
            ) : (
              <button className="btn" onClick={() => setFinishing(true)}>Finish</button>
            )}
          </div>
        </section>
      ) : (
        <p className="empty card">No exercises yet. Add one below.</p>
      )}

      <button className="btn ghost wide add-task-btn" onClick={() => setPicking(true)}>
        <Icon name="plus" size={18} /> Add exercise
      </button>
      {picking && (
        <ExercisePicker
          top
          title="Add to this workout"
          onClose={() => setPicking(false)}
          onAdd={(list) => {
            addSessionExercises(list);
            setPicking(false);
            setEditing(false);
            toast(list.length === 1 ? `Added ${list[0].name}` : `Added ${list.length} exercises`);
          }}
        />
      )}
      <SaveAsNew s={s} key={s.exercises.length} />
      {s.intro && <p className="hint-quiet live-intro">{s.intro}</p>}
    </div>
  );
}

/** Save what you did as a new workout in your list, under a name you pick. */
function SaveAsNew({ s }) {
  const changed = sessionChanged(s);
  const [open, setOpen] = useState(changed);
  const [name, setName] = useState(() => (s.routineId ? `${s.name} (my version)` : ''));
  const [saved, setSaved] = useState(null);
  if (saved) {
    return <p className="save-new done"><Icon name="check" size={16} /> Saved “{saved}” to your workouts.</p>;
  }
  if (!open) {
    return <button className="link-btn save-new-link" onClick={() => setOpen(true)}>Save as a new workout…</button>;
  }
  return (
    <form
      className="save-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !s.exercises.length) return;
        saveSessionAsRoutine(s, name);
        setSaved(name.trim());
      }}
    >
      <p className="muted small">
        {changed ? 'You changed the exercises. ' : ''}Save this lineup as a new workout you can start again later{s.routineId ? `; ${s.name} stays as it was` : ''}.
      </p>
      <div className="inline">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it, e.g. Upper body B" aria-label="New workout name" autoComplete="off" />
        <button className="btn ghost" disabled={!name.trim() || !s.exercises.length}>Save</button>
      </div>
    </form>
  );
}

/** The muscle figure and what the exercise targets, under its name. */
function ExFocus({ e }) {
  const lib = libraryEntry(e.name);
  const focus = e.target.focus || (lib && lib.focus);
  const group = groupOf(e.name, musclesFor);
  if (!focus && !group) return null;
  return (
    <p className="ex-focus">
      {group && <MuscleIcon group={group} muscles={musclesFor(e.name)} size={30} />}
      <span>{focus ? `Targets: ${focus}` : (GROUPS.find((g) => g.id === group) || {}).label}</span>
    </p>
  );
}
