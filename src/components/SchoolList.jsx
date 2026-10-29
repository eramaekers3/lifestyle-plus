import { fmt, minToLabel, relDay, todayISO } from '../lib/dates.js';
import { setSchoolDone } from '../lib/canvas.js';
import { Icon } from './ui.jsx';

const dueLabel = (i, showDay) => {
  const day = showDay ? (['Today', 'Tomorrow', 'Yesterday'].includes(relDay(i.date)) ? relDay(i.date) : fmt(i.date, { weekday: 'short' })) : '';
  const time = i.time == null ? '' : i.time === 1439 ? '11:59pm' : minToLabel(i.time);
  return [day, time].filter(Boolean).join(' ');
};

/** A list of Canvas homework and tests you can check off. */
export default function SchoolList({ items, showDay = true }) {
  const today = todayISO();
  return (
    <ul className="rows school">
      {items.map((i) => {
        const late = !i.done && i.kind === 'homework' && i.date < today;
        return (
          <li key={i.id} className={`row school-row${i.done ? ' done' : ''}${i.kind === 'test' ? ' is-test' : ''}`}>
            <button
              className={`check${i.done ? ' on' : ''}`}
              onClick={() => setSchoolDone(i, !i.done)}
              aria-label={i.done ? `Mark “${i.title}” not done` : `Mark “${i.title}” done`}
              aria-pressed={i.done}
            >
              {i.done && <Icon name="check" size={16} />}
            </button>
            <span className="row-title">
              <span className="school-title">
                {i.kind === 'test' && <span className="test-tag">Test</span>}
                {i.title}
              </span>
              <span className="school-meta">
                {i.course && <span className="course">{i.course}</span>}
                <span className={late ? 'late' : ''}>{late ? `Past due · ${dueLabel(i, true)}` : dueLabel(i, showDay)}</span>
              </span>
            </span>
            {i.link && (
              <a className="icon-btn open-canvas" href={i.link} target="_blank" rel="noreferrer" aria-label={`Open “${i.title}” in Canvas`}>
                <Icon name="out" size={18} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
