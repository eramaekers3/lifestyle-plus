import { useMemo, useState } from 'react';
import { useKind } from '../store.js';
import { GROUPS, LIBRARY, groupOf, libraryEntry, toExercise } from '../lib/exercises.js';
import { musclesFor } from '../lib/lifting.js';
import { Icon, Sheet } from './ui.jsx';
import MuscleIcon from './MuscleIcon.jsx';

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Pick exercises by muscle group (or search), several at once.
 *   onAdd(exercises)  called with copies ready to go into a workout
 *   cta(n)            the button's label for n picked
 *   allowNone         the button works with nothing picked (e.g. "Start empty")
 */
export default function ExercisePicker({ top = false, title = 'Add exercises', cta = (n) => (n ? `Add ${n} exercise${n === 1 ? '' : 's'}` : 'Pick exercises to add'), allowNone = false, onAdd, onClose }) {
  const routines = useKind('routine');
  const workouts = useKind('workout');
  const [group, setGroup] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]); // exercise copies, in tap order

  // Your own exercises (from your workouts and history) that aren't in the library.
  const yours = useMemo(() => {
    const seen = new Map();
    const add = (e) => {
      const k = norm(e.name);
      if (!k || k === 'new exercise' || libraryEntry(e.name) || seen.has(k)) return;
      seen.set(k, { name: e.name, sets: e.sets || 3, reps: e.reps || '8–12', rest: e.rest || '90 sec', notes: e.notes || '', kind: e.kind || 'weight', ...(e.unit ? { unit: e.unit } : {}), group: groupOf(e.name, musclesFor), mine: true });
    };
    routines.forEach((r) => (r.exercises || []).forEach(add));
    workouts.forEach((w) => (w.exercises || []).forEach((e) => add({ ...e, sets: e.sets ? e.sets.length : 3 })));
    return [...seen.values()];
  }, [routines, workouts]);

  const all = useMemo(() => [...LIBRARY, ...yours], [yours]);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.id, all.filter((e) => e.group === g.id).length])), [all]);
  const isPicked = (e) => picked.some((p) => norm(p.name) === norm(e.name));
  const toggle = (e) => setPicked((p) => (isPicked(e) ? p.filter((x) => norm(x.name) !== norm(e.name)) : [...p, toExercise(e)]));

  const query = norm(q);
  const results = query ? all.filter((e) => norm(e.name).includes(query) || norm(e.focus).includes(query) || (e.group && e.group.includes(query))) : null;
  const exact = query && all.some((e) => norm(e.name) === query);
  const g = group && GROUPS.find((x) => x.id === group);
  const list = results || (g ? all.filter((e) => e.group === g.id) : null);

  return (
    <Sheet title={title} onClose={onClose} top={top}>
      <div className="picker">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, or type a new exercise"
          aria-label="Search exercises"
          autoComplete="off"
        />

        {!list && (
          <ul className="mus-grid" aria-label="Muscle groups">
            {GROUPS.map((x) => (
              <li key={x.id}>
                <button className={`mus-tile m-${x.id}`} onClick={() => setGroup(x.id)}>
                  <MuscleIcon group={x.id} size={40} />
                  <b>{x.label}</b>
                  <span>{counts[x.id]} exercises</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {list && (
          <>
            {!results && g && (
              <div className="pk-head">
                <button className="icon-btn" onClick={() => setGroup(null)} aria-label="All muscle groups"><Icon name="left" /></button>
                <span className={`pk-ic m-${g.id}`}><MuscleIcon group={g.id} size={40} /></span>
                <div>
                  <b>{g.label}</b>
                  <span>{g.blurb}</span>
                </div>
              </div>
            )}
            <ul className="rows pk-list">
              {list.map((e) => {
                const on = isPicked(e);
                return (
                  <li key={(e.mine ? 'mine:' : '') + e.name} className="row">
                    <button className={`pk-row${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(e)}>
                      <span className={`check${on ? ' on' : ''}`} aria-hidden="true">{on && <Icon name="check" size={16} />}</span>
                      {e.group && <MuscleIcon group={e.group} muscles={e.muscles} size={38} />}
                      <span className="pk-text">
                        <b>{e.name}</b>
                        {e.focus ? (
                          <span className="pk-focus">
                            Targets: {e.focus}
                          </span>
                        ) : (
                          <span className="pk-focus mine">Yours{e.group ? ` · ${e.group}` : ''}</span>
                        )}
                        <span className="pk-scheme">{e.sets} × {e.reps}{e.kind === 'time' ? ` ${e.unit || 'sec'}` : ''}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {query && !exact && (
                <li className="row">
                  <button
                    className="pk-row"
                    onClick={() => {
                      setPicked((p) => [...p, { name: q.trim(), sets: 3, reps: '8–12', rest: '90 sec', notes: '', kind: 'weight' }]);
                      setQ('');
                    }}
                  >
                    <span className="check" aria-hidden="true"><Icon name="plus" size={14} /></span>
                    <span className="pk-text"><b>Add “{q.trim()}”</b><span className="pk-focus mine">New exercise · 3 × 8–12</span></span>
                  </button>
                </li>
              )}
            </ul>
            {results && !results.length && !query && <p className="empty">Nothing matches.</p>}
          </>
        )}

        {picked.length > 0 && (
          <div className="pk-picked" aria-label="Picked">
            {picked.map((p, i) => (
              <button key={p.name + i} className="chip" onClick={() => setPicked((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`}>
                {p.name} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}

        <button className="btn wide pk-go" disabled={!picked.length && !allowNone} onClick={() => onAdd(picked)}>
          {cta(picked.length)}
        </button>
      </div>
    </Sheet>
  );
}
