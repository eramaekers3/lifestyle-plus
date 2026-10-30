import { useCategories } from '../lib/model.js';
import { addDays, fmt, minToLabel, nowMin, todayISO } from '../lib/dates.js';

/** "Today 3pm", "Tomorrow", "Fri", "Nov 12" — or "Overdue · Tue" once it's passed. */
export function dueLabel(t, today = todayISO()) {
  if (!t.due) return null;
  const time = t.dueTime != null ? (t.dueTime === 1439 ? '11:59pm' : minToLabel(t.dueTime)) : '';
  const late = t.due < today || (t.due === today && t.dueTime != null && t.dueTime < nowMin());
  const day =
    t.due === today ? 'Today' : t.due === addDays(today, 1) ? 'Tomorrow' : t.due < addDays(today, 7) && t.due > today ? fmt(t.due, { weekday: 'short' }) : fmt(t.due, { month: 'short', day: 'numeric' });
  return { text: [late && t.due < today ? `Overdue · ${day}` : day, time].filter(Boolean).join(' '), late };
}

/** A task's category and due date, under its title. Renders nothing when it has neither. */
export default function TaskMeta({ t }) {
  const cats = useCategories();
  const cat = t.category && cats.find((c) => c.id === t.category);
  const due = t.status !== 'done' && dueLabel(t);
  if (!cat && !due) return null;
  return (
    <span className="task-meta">
      {cat && (
        <span className="cat" style={{ '--c': cat.color }}>
          <i aria-hidden="true" />
          {cat.name}
        </span>
      )}
      {due && <span className={due.late ? 'late' : ''}>{due.text}</span>}
    </span>
  );
}
