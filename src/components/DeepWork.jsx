import { useEffect, useMemo, useRef, useState } from 'react';
import { useKind } from '../store.js';
import { useStack, completeTask } from '../lib/model.js';
import { useCalendarDays } from '../lib/calendar.js';
import { useSchool, itemsOn } from '../lib/canvas.js';
import { fmtDur, minToLabel, nowMin, todayISO } from '../lib/dates.js';
import { clockText, endDeep, startDeep, suggestDeep, updateDeep, useDeep, useDeepMinutes } from '../lib/deep.js';
import { cheerGain } from '../lib/game.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { Icon, Sheet, useNow } from './ui.jsx';

const LENGTHS = [25, 50, 90];
const SOON = 15; // minutes: when the next thing on the calendar turns urgent

function useToday() {
  const date = todayISO();
  const blocks = useKind('block');
  const tasks = useKind('task');
  const stack = useStack();
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const todays = useMemo(() => blocks.filter((b) => b.date === date), [blocks, date]);
  return { date, tasks, stack, tasksById, blocks: todays };
}

/** The small "Deep work" tab on the home screen: one tap to go deep. */
export function DeepTab() {
  const { date, stack, tasksById, blocks } = useToday();
  useNow(60000); // the suggestion follows your blocks through the day
  const doneToday = useDeepMinutes(date);
  const [picking, setPicking] = useState(false);
  const s = suggestDeep(blocks, stack.active, tasksById);
  const what = s.title ? `${s.title}${s.plannedMin ? ` · ${fmtDur(s.plannedMin)}` : ''}` : 'Open session · no task picked';

  const go = () => {
    haptic('success');
    startDeep(s);
  };

  return (
    <section className="deep-tab" aria-label="Deep work">
      <span className="dt-mark" aria-hidden="true"><Icon name="moon" size={18} /></span>
      <button className="dt-text" onClick={() => setPicking(true)} aria-label={`Deep work: ${what}. Tap to change`}>
        <b>Deep work{doneToday > 0 && <small> · {fmtDur(doneToday)} today</small>}</b>
        <span>{what}</span>
      </button>
      <button className="dt-go" onClick={go}>
        <Icon name="play" size={15} /> Enter
      </button>
      {picking && <DeepSetupSheet initial={s} onClose={() => setPicking(false)} />}
    </section>
  );
}

/** Pick the task and length before going in, or change them mid-session. */
function DeepSetupSheet({ initial, running, onClose }) {
  const { stack } = useToday();
  const [taskId, setTaskId] = useState(initial.taskId || '');
  const [plannedMin, setPlanned] = useState(initial.plannedMin || null);
  const tasks = [...stack.active, ...stack.backlog.slice(0, 6)];
  const task = tasks.find((t) => t.id === taskId);
  const lengths = [...new Set([...(task && task.estimate ? [task.estimate] : []), ...LENGTHS])].sort((a, b) => a - b);

  const pick = (t) => {
    if (taskId === t.id) return setTaskId('');
    setTaskId(t.id);
    if (t.estimate) setPlanned(t.estimate);
  };
  const go = () => {
    const title = task ? task.title : taskId ? initial.title : '';
    if (running) {
      updateDeep(running, { taskId, title, plannedMin });
    } else {
      haptic('success');
      startDeep({ taskId, title, plannedMin, blockId: taskId === initial.taskId ? initial.blockId : '' });
    }
    onClose();
  };

  return (
    <Sheet title={running ? 'Session' : 'Deep work'} onClose={onClose}>
      <p className="cap-label">Working on</p>
      {tasks.length ? (
        <div className="chips">
          {tasks.map((t) => (
            <button type="button" key={t.id} className="chip task-chip" aria-pressed={taskId === t.id} onClick={() => pick(t)}>
              <span className="tc-title">{t.title}</span>
              {t.estimate > 0 && <span className="tc-est">{fmtDur(t.estimate)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="hint-quiet">Your stack is empty, so this will be an open session.</p>
      )}

      <p className="cap-label" style={{ marginTop: 16 }}>For how long</p>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={!plannedMin} onClick={() => setPlanned(null)}>Open</button>
        {lengths.map((m) => (
          <button type="button" key={m} className="chip" aria-pressed={plannedMin === m} onClick={() => setPlanned(m)}>
            {fmtDur(m)}
          </button>
        ))}
      </div>
      <p className="hint-quiet">{plannedMin ? 'You’ll get a nudge when the time’s up. The clock keeps going until you end it.' : 'The clock counts up until you end it.'}</p>

      <div className="btn-row">
        <button className="btn deep-btn" onClick={go}>{running ? 'Save' : 'Enter deep work'}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

/** The home screen while you're in deep work: the clock, the task, and only what you need to know. */
export function DeepFocus({ s }) {
  const { date, tasks, tasksById, blocks } = useToday();
  const now = useNow(1000);
  const school = useSchool();
  const cal = useCalendarDays()[date] || { timed: [] };
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const task = s.taskId && tasksById[s.taskId];
  const taskDone = task && task.status === 'done';

  const elapsed = now - s.startedAt;
  const planned = s.plannedMin ? s.plannedMin * 60000 : 0;
  const over = planned && elapsed >= planned;
  const pct = planned ? Math.min(1, elapsed / planned) : 0;

  // A single nudge when the planned time runs out (not again after a reload).
  const nudged = useRef(over);
  useEffect(() => {
    if (over && !nudged.current) {
      nudged.current = true;
      haptic('success');
      toast(`${fmtDur(s.plannedMin)} done. Keep going, or end the session.`);
    }
    if (!over) nudged.current = false;
  }, [over, s.plannedMin]);

  // What could pull you out: the next event or block, and what's due today.
  const m = nowMin();
  const next = [...cal.timed.map((e) => ({ ...e, kind: 'event' })), ...blocks.filter((b) => b.id !== s.blockId).map((b) => ({ ...b, kind: 'block' }))]
    .filter((e) => e.start > m)
    .sort((a, b) => a.start - b.start)[0];
  const inMin = next ? next.start - m : null;
  const dueTasks = tasks.filter((t) => t.status !== 'done' && t.due === date && t.id !== s.taskId);
  const dueSchool = itemsOn(school, date).filter((i) => !i.done);
  const due = [
    ...dueSchool.map((i) => ({ id: i.id, title: i.title, time: i.time })),
    ...dueTasks.map((t) => ({ id: t.id, title: t.title, time: t.dueTime })),
  ].sort((a, b) => (a.time ?? 1440) - (b.time ?? 1440));

  const end = () => {
    if (!confirmEnd) return setConfirmEnd(true);
    const mins = endDeep(s);
    haptic('success');
    const coins = Math.floor(mins / 10);
    toast(mins >= 1 ? `${fmtDur(mins)} of deep work logged${coins ? ` · +${coins} coin${coins === 1 ? '' : 's'}` : ''}` : 'Session ended');
  };
  const finishTask = (e) => {
    if (!task || taskDone) return;
    completeTask(task);
    haptic('success');
    cheerGain(e.currentTarget, 'task');
  };

  return (
    <section className={`deep-focus${over ? ' over' : ''}`} aria-label="Deep work">
      <div className="df-top">
        <span className="df-live"><i aria-hidden="true" />Deep work</span>
        <span className="df-since">since {minToLabel(Math.round((s.startedAt - new Date(s.startedAt).setHours(0, 0, 0, 0)) / 60000))}</span>
      </div>

      <div className="df-clock" role="timer" aria-label={`${clockText(elapsed)} elapsed`}>{clockText(elapsed)}</div>
      {planned > 0 && (
        <div className="df-goal">
          <div className="df-bar" aria-hidden="true"><i style={{ width: `${pct * 100}%` }} /></div>
          <span>{over ? `${fmtDur(s.plannedMin)} reached · +${clockText(elapsed - planned)}` : `${fmtDur(Math.ceil((planned - elapsed) / 60000))} left of ${fmtDur(s.plannedMin)}`}</span>
        </div>
      )}

      <div className={`df-task${taskDone ? ' done' : ''}`}>
        {task ? (
          <>
            <button className={`check${taskDone ? ' on' : ''}`} onClick={finishTask} aria-label={`Mark “${task.title}” done`} disabled={taskDone}>
              {taskDone && <Icon name="check" size={16} />}
            </button>
            <button className="df-task-title" onClick={() => setEditing(true)}>
              {task.title}
              <small>{taskDone ? 'Done. Pick the next task, or end the session.' : 'Tap to switch task'}</small>
            </button>
          </>
        ) : (
          <button className="df-task-title" onClick={() => setEditing(true)}>
            {s.title || 'Open session'}
            <small>Tap to pick a task</small>
          </button>
        )}
      </div>

      <ul className="df-know" aria-label="Need to know">
        <li className={inMin != null && inMin <= SOON ? 'urgent' : ''}>
          <Icon name="bell" size={16} />
          {next ? (
            <span>
              <b>{next.title || 'Untitled block'}</b> at {minToLabel(next.start)}
              <em>{inMin <= 0 ? 'now' : `in ${fmtDur(inMin)}`}</em>
            </span>
          ) : (
            <span>Nothing else on the calendar today</span>
          )}
        </li>
        {due.slice(0, 3).map((d) => (
          <li key={d.id} className={d.time != null && d.time - m <= 60 ? 'urgent' : ''}>
            <Icon name="pin" size={16} />
            <span>
              <b>{d.title}</b> due {d.time != null ? (d.time === 1439 ? 'tonight' : `at ${minToLabel(d.time)}`) : 'today'}
            </span>
          </li>
        ))}
        {due.length > 3 && <li className="more">+{due.length - 3} more due today</li>}
      </ul>

      <div className="df-actions">
        <button className={`btn ${confirmEnd ? 'danger' : 'ghost'}`} onClick={end} onBlur={() => setConfirmEnd(false)}>
          {confirmEnd ? 'Tap again to end' : 'End session'}
        </button>
      </div>
      {editing && <DeepSetupSheet initial={s} running={s} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** On other tabs, a pill with the clock that takes you back to the session. */
export function DeepPill() {
  const s = useDeep();
  const now = useNow(1000);
  if (!s) return null;
  return (
    <a className="deep-pill" href="#plan" aria-label="Back to deep work">
      <span className="dot" aria-hidden="true" />
      <b>{s.title || 'Deep work'}</b>
      <span className="t">{clockText(now - s.startedAt)}</span>
    </a>
  );
}
