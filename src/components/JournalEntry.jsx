import { useEffect, useMemo, useRef, useState } from 'react';
import { useKind } from '../store.js';
import { Icon } from './ui.jsx';
import { haptic } from '../lib/haptics.js';
import { useHabits } from '../lib/model.js';
import { iso } from '../lib/dates.js';
import { plural } from '../lib/text.js';
import {
  METRICS, useEntry, setRating, addMoment, editMoment, removeMoment, valueOf, noteOf,
} from '../lib/journal.js';

/**
 * One day's journal: what happened (a list of moments), then the four ratings, each with an
 * optional note. Everything saves as you go.
 *   compact: smaller headings, for the shutdown.
 */
export default function JournalEntry({ date, compact = false, showDay = false }) {
  const entry = useEntry(date);
  return (
    <div className={`journal${compact ? ' compact' : ''}`}>
      {showDay && <DayContext date={date} />}
      <h3 className="jr-sub">What happened</h3>
      <Moments date={date} moments={(entry && entry.moments) || []} />
      <h3 className="jr-sub">Rate the day</h3>
      <div className="jr-ratings">
        {METRICS.map((m) => (
          <Rating key={m.key} date={date} m={m} v={valueOf(entry, m.key)} note={noteOf(entry, m.key)} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Moments ---------- */

function Moments({ date, moments }) {
  const [text, setText] = useState('');
  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addMoment(date, text);
    haptic('tick');
    setText('');
  };
  return (
    <>
      {moments.length > 0 && (
        <ul className="rows jr-moments">
          {moments.map((m) => (
            <Moment key={m.id} date={date} m={m} />
          ))}
        </ul>
      )}
      <form className="inline jr-add" onSubmit={add}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={moments.length ? 'Something else?' : 'Something worth remembering…'}
          enterKeyHint="done"
          aria-label="Add something that happened"
        />
        <button className="btn" disabled={!text.trim()}>Add</button>
      </form>
    </>
  );
}

function Moment({ date, m }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const done = () => {
    setEditing(false);
    const t = text.trim();
    if (!t) removeMoment(date, m.id);
    else if (t !== m.text) editMoment(date, m.id, t);
  };
  return (
    <li className="row">
      <span className="jr-bullet" aria-hidden="true" />
      {editing ? (
        <textarea
          className="input jr-edit"
          rows={2}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), e.currentTarget.blur())}
        />
      ) : (
        <button className="row-title link-row jr-text" onClick={() => { setText(m.text); setEditing(true); }} aria-label={`Edit: ${m.text}`}>
          {m.text}
        </button>
      )}
      <button className="x" onClick={() => removeMoment(date, m.id)} aria-label={`Remove: ${m.text}`}>×</button>
    </li>
  );
}

/* ---------- Ratings ---------- */

function Rating({ date, m, v, note }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || !!note;
  const pick = (n) => {
    setRating(date, m.key, { v: n === v ? null : n });
    haptic('tick');
  };
  return (
    <section className="jr-rate" style={{ '--c': m.color }} aria-label={m.label}>
      <div className="jr-rate-head">
        <b>{m.label}</b>
        <span className="muted small">{m.ask}</span>
      </div>
      <div className="jr-scale" role="radiogroup" aria-label={`${m.label}, 1 (${m.low}) to 5 (${m.high})`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={v === n}
            className={`${v !== null && n <= v ? 'fill' : ''}${v === n ? ' on' : ''}`}
            onClick={() => pick(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="jr-ends" aria-hidden="true">
        <span>{m.low}</span>
        <span>{m.high}</span>
      </div>
      {showNote ? (
        <NoteField date={date} k={m.key} note={note} label={m.label} autoFocus={noteOpen && !note} onEmptyBlur={() => setNoteOpen(false)} />
      ) : (
        <button className="link-btn jr-note-btn" onClick={() => setNoteOpen(true)}>
          <Icon name="plus" size={14} /> Note
        </button>
      )}
    </section>
  );
}

/**
 * A note saves a moment after you stop typing (and when you leave the box), so typing doesn't
 * write to storage on every key. Changes from your other devices show up when you're not typing in it.
 */
function NoteField({ date, k, note, label, autoFocus, onEmptyBlur }) {
  const [text, setText] = useState(note);
  const focused = useRef(false);
  const timer = useRef(null);
  const latest = useRef(note);
  latest.current = text;

  useEffect(() => {
    if (!focused.current) setText(note);
  }, [note]);

  const save = () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (latest.current !== note) setRating(date, k, { note: latest.current });
  };
  // Save anything still waiting when the box goes away.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => timer.current && saveRef.current(), []);

  return (
    <textarea
      className="input jr-note"
      rows={2}
      value={text}
      autoFocus={autoFocus}
      placeholder={`Why? (${label.toLowerCase()})`}
      aria-label={`${label} note`}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        save();
        if (!latest.current.trim()) onEmptyBlur();
      }}
      onChange={(e) => {
        setText(e.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(save, 700);
      }}
    />
  );
}

/* ---------- What else the app knows about that day ---------- */

function DayContext({ date }) {
  const tasks = useKind('task');
  const workouts = useKind('workout');
  const { habits, isDone } = useHabits();
  const done = useMemo(() => tasks.filter((t) => t.status === 'done' && t.doneAt && iso(new Date(t.doneAt)) === date), [tasks, date]);
  const lifts = useMemo(() => workouts.filter((w) => w.date === date), [workouts, date]);
  const tracked = habits.filter((h) => h.mode !== 'avoid');
  const hit = tracked.filter((h) => isDone(h, date)).length;
  const parts = [];
  if (done.length) parts.push(plural(done.length, 'task') + ' done');
  if (tracked.length) parts.push(`${hit}/${tracked.length} habits`);
  lifts.forEach((w) => parts.push(w.name || 'Workout'));
  if (!parts.length) return null;
  return (
    <p className="jr-context">
      <Icon name="check" size={14} /> {parts.join(' · ')}
    </p>
  );
}
