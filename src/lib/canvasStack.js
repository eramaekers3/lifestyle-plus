// Canvas work in your stack. Homework and tests due in the next two weeks become backlog tasks,
// and stay in step with Canvas both ways:
//   - finishing the task checks the item off in School (and the other way around)
//   - when Canvas says it's submitted (with a token), the task is finished for you
//   - a new due date in Canvas moves the task's due date
// Each item makes its task once (a stable id), so deleting a task you don't need keeps it gone.
import { useEffect } from 'react';
import { exists, get, list, patch, put, useKind, useSettings, useSyncStatus } from '../store.js';
import { idFor } from './ids.js';
import { addDays, todayISO } from './dates.js';
import { useSchool, setSchoolDone } from './canvas.js';
import { addCategory } from './model.js';

const AHEAD_DAYS = 14;
export const canvasTaskId = (item) => idFor(`canvas-task:${item.id}`);

function schoolCategory() {
  const cats = list('category');
  const found = cats.find((c) => c.name.trim().toLowerCase() === 'school');
  return (found || addCategory('School')).id;
}

const titleFor = (item) => (item.kind === 'test' ? `Study for ${item.title}` : item.title);

export function syncCanvasTasks(items, today = todayISO()) {
  const backlog = list('task').filter((t) => t.status === 'backlog').map((t) => t.order ?? 0);
  let top = (backlog.length ? Math.min(...backlog) : 1) - 1;
  let cat = null;

  for (const item of items) {
    const id = canvasTaskId(item);
    const task = get(id);

    if (!task) {
      // New: only work that's still open and due soon (or a little overdue), and never one you deleted.
      if (item.done || exists(id)) continue;
      if (item.date > addDays(today, AHEAD_DAYS) || item.date < addDays(today, -7)) continue;
      cat = cat || schoolCategory();
      put('task', {
        id,
        title: titleFor(item),
        status: 'backlog',
        order: top--,
        due: item.kind === 'test' ? addDays(item.date, -1) : item.date,
        ...(item.time != null && item.kind !== 'test' ? { dueTime: item.time } : {}),
        category: cat,
        canvasId: item.id,
        course: item.course || '',
        link: item.link || '',
        canvasDone: false,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const taskDone = task.status === 'done';
    const changes = {};
    if (item.done !== !!task.canvasDone) {
      // Canvas (or the School list) changed since we last looked: follow it.
      changes.canvasDone = item.done;
      if (item.done && !taskDone) Object.assign(changes, { status: 'done', doneAt: new Date().toISOString() });
      if (!item.done && taskDone) Object.assign(changes, { status: 'backlog', doneAt: null });
    } else if (taskDone !== item.done) {
      // You finished (or reopened) the task: check the item off in School to match.
      setSchoolDone(item, taskDone);
      changes.canvasDone = taskDone;
    }
    const due = item.kind === 'test' ? addDays(item.date, -1) : item.date;
    if (task.due !== due) changes.due = due;
    if (Object.keys(changes).length) patch(id, changes);
  }
}

/** Keeps Canvas work and your stack in step. Mount once; waits for sync so other devices' deletes count. */
export function useCanvasTasks() {
  const { canvas, canvasToStack } = useSettings();
  const items = useSchool();
  const tasks = useKind('task');
  const sync = useSyncStatus();
  const settled = ['synced', 'local', 'signed-out', 'error', 'offline'].includes(sync.state);
  const on = !!(canvas && canvas.url) && canvasToStack !== false;
  useEffect(() => {
    if (on && settled && items.length) syncCanvasTasks(items);
  }, [on, settled, items, tasks]);
}
