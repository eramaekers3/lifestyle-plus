// Auto-plan: suggests time blocks for a day from your stack, fitted into the free time between
// your calendar events and the blocks you already have. Nothing is saved until you pick them.
// Times are minutes after midnight.

const STEP = 15; // blocks start on the quarter hour
const BUFFER = 10; // breathing room before and after events and between suggestions
const MIN_BLOCK = 30; // shorter gaps aren't worth a deep work block
const DEFAULT_LEN = 60;
const MAX_LEN = 120; // Newport-style deep sessions; longer tasks get the first two hours
const EXTRA_BACKLOG = 2; // after Now, suggest this many from the top of the backlog

const up = (m) => Math.ceil(m / STEP) * STEP;

/** Free stretches of the day: [[start, end], ...] after taking out everything busy. */
export function freeGaps(busy, from, to) {
  const spans = busy
    .map((b) => [Math.max(from, b.start - BUFFER), Math.min(to, b.end + BUFFER)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let at = from;
  for (const [s, e] of spans) {
    if (s > at) gaps.push([at, s]);
    at = Math.max(at, e);
  }
  if (to > at) gaps.push([at, to]);
  return gaps.map(([s, e]) => [up(s), e]).filter(([s, e]) => e - s >= MIN_BLOCK);
}

/**
 * Suggested blocks: Now tasks first (in your order), then the top of the backlog, each in the
 * earliest gap that fits, plus one short block to batch email and admin.
 *   tasks:  { active, backlog } from useStack
 *   blocks: this day's blocks;  events: this day's timed calendar events
 *   from/to: when the day starts and ends (from = now, for today)
 */
export function planDay({ active, backlog }, blocks, events, from, to) {
  const planned = new Set(blocks.map((b) => b.taskId).filter(Boolean));
  const queue = [...active, ...backlog.slice(0, EXTRA_BACKLOG)].filter((t) => !planned.has(t.id));
  const gaps = freeGaps([...blocks, ...events], up(from), to);
  const out = [];

  for (const t of queue) {
    const want = Math.min(MAX_LEN, t.estimate || DEFAULT_LEN);
    const g = gaps.find(([s, e]) => e - s >= Math.min(want, MIN_BLOCK + STEP));
    if (!g) continue;
    const len = Math.min(want, Math.floor((g[1] - g[0]) / STEP) * STEP);
    out.push({ key: t.id, start: g[0], end: g[0] + len, title: t.title, taskId: t.id, type: 'deep', fromNow: active.includes(t) });
    g[0] = up(g[0] + len + BUFFER);
  }

  const admin = gaps.find(([s, e]) => e - s >= 30);
  if (admin) out.push({ key: 'admin', start: admin[0], end: admin[0] + 30, title: 'Email and admin', taskId: '', type: 'shallow', optional: true });

  return out.sort((a, b) => a.start - b.start);
}
