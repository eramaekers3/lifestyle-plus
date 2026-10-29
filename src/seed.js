// Example data for a first look. Every record is marked `sample: true`.
// It is removed from this device when you tap "Clear sample data" or sign in.
import { putMany, SETTINGS_ID } from './store.js';
import { idFor, newId } from './lib/ids.js';
import { addDays, todayISO, weekStart, parse } from './lib/dates.js';
import { logId } from './lib/model.js';

export function seed() {
  const t = todayISO();
  const now = Date.now();
  const ago = (min) => new Date(now - min * 60000).toISOString();
  const items = [];
  const add = (kind, data) => items.push([kind, { ...data, sample: true }]);

  add('settings', { id: SETTINGS_ID, stackLimit: 3, dayStart: 7, dayEnd: 23 });

  // Stack
  const report = newId();
  add('task', { id: report, title: 'Outline the project report', status: 'active', pulledAt: ago(200), order: 0 });
  add('task', { title: 'Reply to the group project chat', status: 'active', pulledAt: ago(90), order: 0 });
  [
    'Read chapter 6 before Thursday',
    'Book a haircut',
    'Fix the bike tire',
    'Research summer internships',
    'Update résumé',
    'Plan the weekend trip',
    'Clear out email inbox',
  ].forEach((title, i) => add('task', { title, status: 'backlog', order: i + 1, createdAt: ago(3000 - i * 100) }));
  add('task', { title: 'Submit lab 5', status: 'done', doneAt: ago(60 * 20), order: 0 });
  add('task', { title: 'Email advisor', status: 'done', doneAt: ago(60 * 26), order: 0 });

  // Time blocks for today
  const today = [
    [480, 510, 'Plan the day', 'shallow'],
    [540, 660, 'Project report', 'deep', report],
    [660, 735, 'Class', 'fixed'],
    [735, 780, 'Lunch', 'personal'],
    [780, 840, 'Email and admin', 'shallow'],
    [840, 930, 'Read chapter 6', 'deep'],
    [990, 1050, 'Gym', 'personal'],
    [1230, 1260, 'Shutdown: plan tomorrow', 'shallow'],
  ];
  today.forEach(([start, end, title, type, taskId]) => add('block', { date: t, start, end, title, type, taskId: taskId || '' }));

  // Lighter blocks for the rest of this week
  const ws = weekStart(t);
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    if (d === t) continue;
    const dow = parse(d).getDay();
    if (dow === 0 || dow === 6) {
      add('block', { date: d, start: 600, end: 690, title: 'Long run', type: 'personal' });
      if (dow === 0) add('block', { date: d, start: 1140, end: 1185, title: 'Weekly plan', type: 'shallow' });
      continue;
    }
    add('block', { date: d, start: 540, end: 660, title: 'Deep work', type: 'deep' });
    if (dow % 2 === 1) add('block', { date: d, start: 660, end: 735, title: 'Class', type: 'fixed' });
    add('block', { date: d, start: 780, end: 840, title: 'Email and admin', type: 'shallow' });
    if (dow !== 5) add('block', { date: d, start: 840, end: 930, title: 'Study', type: 'deep' });
    add('block', { date: d, start: 990, end: 1050, title: 'Gym', type: 'personal' });
  }

  // Weekly plan
  add('week', {
    id: idFor(`week:${ws}`),
    week: ws,
    big: ['Finish the project report draft', 'Study for Friday’s exam', 'Three gym sessions'],
    notes: 'Mornings are for deep work. Keep shallow tasks after lunch. No new commitments until the report is done.',
  });

  // Habits with a few weeks of history
  const habits = ['Read 20 min', 'Workout', 'No phone before 9am', 'Plan tomorrow'];
  habits.forEach((name, hi) => {
    const id = newId();
    add('habit', { id, name, order: hi + 1 });
    for (let i = 1; i <= 40; i++) {
      const d = addDays(t, -i);
      if ((i * (hi + 3) + hi) % 7 > 1 && (i + hi) % 9 !== 0) add('habitlog', { id: logId(id, d), habitId: id, date: d, done: true });
    }
    if (hi === 1) add('habitlog', { id: logId(id, t), habitId: id, date: t, done: true });
  });

  // Weigh-ins
  for (let i = 30; i >= 0; i--) {
    const d = addDays(t, -i);
    add('weight', { id: idFor(`w:${d}`), date: d, lbs: +(182.4 - (30 - i) * 0.09 + Math.sin(i * 1.7) * 0.9).toFixed(1) });
  }

  // Workouts
  add('workout', {
    date: addDays(t, -2),
    name: 'Pull',
    sets: [
      { ex: 'Lat pulldown', reps: 10, wt: 120 },
      { ex: 'Lat pulldown', reps: 9, wt: 120 },
      { ex: 'Cable row', reps: 12, wt: 100 },
      { ex: 'Hammer curl', reps: 10, wt: 30 },
    ],
  });
  add('workout', {
    date: t,
    name: 'Push',
    sets: [
      { ex: 'Bench press', reps: 8, wt: 165 },
      { ex: 'Bench press', reps: 7, wt: 165 },
      { ex: 'Incline DB press', reps: 10, wt: 55 },
      { ex: 'Lateral raise', reps: 14, wt: 20 },
    ],
  });

  putMany(items);
}
