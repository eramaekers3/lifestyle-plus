import { useCategories } from '../lib/model.js';
import { Icon } from './ui.jsx';
import { addDays, fmt, fmtDur, minToLabel, nowMin, todayISO } from '../lib/dates.js';

/** "Today 3pm", "Tomorrow", "Fri", "Nov 12" — or "Overdue · Tue" once it's passed. */
export function dueLabel(t, today = todayISO()) {
  if (!t.due) return null;
  const time = t.dueTime != null ? (t.dueTime === 1439 ? '11:59pm' : minToLabel(t.dueTime)) : '';
  const late = t.due < today || (t.due === today && t.dueTime != null && t.dueTime < nowMin());
  const day =
    t.due === today ? 'Today' : t.due === addDays(today, 1) ? 'Tomorrow' : t.due < addDays(today, 7) && t.due > today ? fmt(t.due, { weekday: 'short' }) : fmt(t.due, { month: 'short', day: 'numeric' });
  return { text: [late && t.due < today ? `Overdue · ${day}` : day, time].filter(Boolean).join(' '), late };
}

/**
 * Auto priority, from the due date and how big the task is (its time estimate):
 *   overdue                            !!!
 *   due today:     1h or more !!!,  smaller !
 *   due tomorrow:  2h or more !!,   smaller !
 *   due in 2–3 days: 2h or more !,  smaller none
 * Repeating tasks never get an auto priority, and a task with no estimate counts as small.
 */
export const BIG_TODAY = 60;
export const BIG_SOON = 120;
export function priority(t, today = todayISO()) {
  if (t.status === 'done') return 0;
  if (t.priority !== undefined && t.priority !== null) return t.priority; // set by you
  if (!t.due || t.recurId) return 0;
  const est = t.estimate || 0;
  if (t.due < today) return 3;
  if (t.due === today) return est >= BIG_TODAY ? 3 : 1;
  if (t.due === addDays(today, 1)) return est >= BIG_SOON ? 2 : 1;
  if (t.due <= addDays(today, 3)) return est >= BIG_SOON ? 1 : 0;
  return 0;
}
const PRIORITY_LABEL = ['', 'Low priority', 'Medium priority', 'High priority'];

export function PriorityBadge({ t }) {
  const p = priority(t);
  if (!p) return null;
  return (
    <span className={`prio p${p}`} title={PRIORITY_LABEL[p]} aria-label={PRIORITY_LABEL[p]}>
      {'!'.repeat(p)}
    </span>
  );
}

/** A task's category and due date, under its title. Renders nothing when it has neither. */
export default function TaskMeta({ t }) {
  const cats = useCategories();
  const cat = t.category && cats.find((c) => c.id === t.category);
  const due = t.status !== 'done' && dueLabel(t);
  if (!cat && !due && !t.recurId && !t.course && !t.estimate) return null;
  return (
    <span className="task-meta">
      {cat && (
        <span className="cat" style={{ '--c': cat.color }}>
          <i aria-hidden="true" />
          {cat.name}
        </span>
      )}
      {t.course && <span className="course">{t.course.split(/\s+/).slice(0, 2).join(' ')}</span>}
      {due && <span className={due.late ? 'late' : ''}>{due.text}</span>}
      {t.estimate > 0 && t.status !== 'done' && <span className="est">{fmtDur(t.estimate)}</span>}
      {t.recurId && (
        <span className="rc-meta" aria-label="Repeats">
          <Icon name="repeat" size={12} />
        </span>
      )}
    </span>
  );
}
