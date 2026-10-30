import { useEffect, useRef, useState } from 'react';
import { Sheet, Icon } from './ui.jsx';
import { addTask, addCategory, useCategories } from '../lib/model.js';
import { addDays, fmt, minToLabel, todayISO } from '../lib/dates.js';

const STEPS = ['Name', 'Category', 'Due date', 'Due time'];

/**
 * Adding a task, one question at a time: name → category → due date → due time.
 * Category, date and time can all be skipped; skipping the date skips the time too.
 * Everything lands in the backlog.
 */
export default function CaptureSheet({ onClose }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(null);
  const [due, setDue] = useState(null);
  const [time, setTime] = useState('');
  const [saved, setSaved] = useState(null); // the title just added, while the success animation plays

  const save = (t = time) => {
    const [hh, mm] = t ? t.split(':').map(Number) : [];
    addTask(title, { category, due, dueTime: due && t ? hh * 60 + mm : null });
    setSaved(title.trim());
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(onClose, 1100); // let the check play, then leave
  };

  if (saved) {
    return (
      <Sheet title="New task" onClose={onClose}>
        <div className="cap-done" role="status">
          <svg className="cap-check" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="44" />
            <path d="M30 52 L44 66 L71 37" />
          </svg>
          <p className="cap-done-title">{saved}</p>
          <p className="muted small">Added to your backlog</p>
        </div>
      </Sheet>
    );
  }

  const next = () => {
    if (step === 0 && !title.trim()) return;
    if (step === 2 && !due) return save(''); // no date, so no time either
    if (step === 3) return save();
    setStep(step + 1);
  };

  return (
    <Sheet title="New task" onClose={onClose}>
      <ol className="steps-dots" aria-label={`Step ${step + 1} of 4: ${STEPS[step]}`}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'past' : ''} aria-hidden="true" />
        ))}
      </ol>

      {step > 0 && <p className="task-so-far">{title.trim()}</p>}

      <form
        className="cap-step"
        key={step}
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        {step === 0 && <NameStep title={title} setTitle={setTitle} />}
        {step === 1 && <CategoryStep category={category} setCategory={setCategory} />}
        {step === 2 && <DateStep due={due} setDue={setDue} />}
        {step === 3 && <TimeStep due={due} time={time} setTime={setTime} />}

        <div className="cap-nav">
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn cap-next" disabled={step === 0 && !title.trim()}>
            {step === 3 ? (time ? 'Add task' : 'Skip and add') : step === 2 && !due ? 'Skip' : 'Next'}
            {step < 3 && <Icon name="right" size={18} />}
          </button>
        </div>
      </form>

    </Sheet>
  );
}

function NameStep({ title, setTitle }) {
  return (
    <label className="f cap-q" htmlFor="capture-title">
      What needs doing?
      <input
        id="capture-title"
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Call the dentist"
        autoFocus
        autoComplete="off"
        enterKeyHint="next"
      />
    </label>
  );
}

export function CategoryStep({ category, setCategory, label = 'Category', autoAdd = true }) {
  const cats = useCategories();
  const [adding, setAdding] = useState(autoAdd && cats.length === 0);
  const [name, setName] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (adding && ref.current) ref.current.focus();
  }, [adding]);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const existing = cats.find((c) => c.name.toLowerCase() === n.toLowerCase());
    setCategory(existing ? existing.id : addCategory(n).id);
    setName('');
    setAdding(false);
  };

  return (
    <div className="cap-q">
      <p className="cap-label">{label}</p>
      <div className="chips">
        {cats.map((c) => (
          <button
            type="button"
            key={c.id}
            className="chip cat-chip"
            style={{ '--c': c.color }}
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
          >
            <i aria-hidden="true" />
            {c.name}
          </button>
        ))}
        {!adding && (
          <button type="button" className="chip add-chip" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> New category
          </button>
        )}
      </div>
      {adding && (
        <div className="inline" style={{ marginTop: 10 }}>
          <input
            ref={ref}
            id="new-category"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
            }}
            placeholder="School, Work, Home…"
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="button" className="btn ghost" onClick={create} disabled={!name.trim()}>
            Add
          </button>
        </div>
      )}
      {!cats.length && !adding && <p className="hint-quiet">No categories yet. Add your own, or tap Next to skip.</p>}
    </div>
  );
}

export function DateStep({ due, setDue, label = 'When does it need to be done?' }) {
  const today = todayISO();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const later = due && !week.includes(due);
  const [picking, setPicking] = useState(later);
  const dayName = (d, i) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmt(d, { weekday: 'short' }));

  return (
    <div className="cap-q">
      <p className="cap-label">{label}</p>
      <div className="date-grid">
        {week.map((d, i) => (
          <button
            type="button"
            key={d}
            className="date-chip"
            aria-pressed={due === d}
            onClick={() => {
              setDue(due === d ? null : d);
              setPicking(false);
            }}
          >
            <b>{dayName(d, i)}</b>
            <span>{fmt(d, { month: 'short', day: 'numeric' })}</span>
          </button>
        ))}
        <button type="button" className="date-chip later" aria-pressed={!!later || picking} onClick={() => setPicking(true)}>
          <b>Later</b>
          <span>{later ? fmt(due, { month: 'short', day: 'numeric' }) : 'Pick a date'}</span>
        </button>
      </div>
      {picking && (
        <input
          id="due-later"
          className="input"
          type="date"
          style={{ marginTop: 10 }}
          min={addDays(today, 7)}
          value={later ? due : ''}
          onChange={(e) => setDue(e.target.value || null)}
          aria-label="Pick a later due date"
        />
      )}
      <p className="hint-quiet">{due ? `Due ${fmt(due, { weekday: 'long', month: 'long', day: 'numeric' })}. Tap it again to clear.` : 'No due date.'}</p>
    </div>
  );
}

export function TimeStep({ due, time, setTime }) {
  const quick = [9 * 60, 12 * 60, 17 * 60, 23 * 60 + 59];
  const toInput = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return (
    <div className="cap-q">
      <p className="cap-label">What time on {fmt(due, { weekday: 'long' })}?</p>
      <div className="chips">
        {quick.map((m) => (
          <button type="button" key={m} className="chip" aria-pressed={time === toInput(m)} onClick={() => setTime(time === toInput(m) ? '' : toInput(m))}>
            {m === 1439 ? '11:59pm' : minToLabel(m)}
          </button>
        ))}
      </div>
      <input
        id="due-time"
        className="input"
        type="time"
        style={{ marginTop: 10 }}
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label="Due time"
      />
      <p className="hint-quiet">{time ? 'Tap the time again to clear it.' : 'Optional. Without a time, it’s due any time that day.'}</p>
    </div>
  );
}
