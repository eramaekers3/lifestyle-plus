import { layoutBlocks } from '../lib/model.js';
import { minToLabel, nowMin, todayISO, fmtDur } from '../lib/dates.js';
import { useNow } from './ui.jsx';
import { toast } from '../lib/toast.js';

const PX = 0.6; // pixels per minute (36px per hour) — the whole day fits without scrolling

/** A day of time blocks. Tap empty space to add a block there; tap a block to edit it. */
export default function Timeline({ date, blocks, events = [], tasksById, dayStart, dayEnd, onAdd, onEdit }) {
  const start = dayStart * 60;
  const end = dayEnd * 60;
  useNow(30000);
  const isToday = date === todayISO();
  const now = nowMin();

  const hours = [];
  for (let h = dayStart; h <= dayEnd; h++) hours.push(h);

  const tapGrid = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = start + Math.floor((e.clientY - r.top) / PX / 15) * 15;
    onAdd(Math.max(start, Math.min(end - 15, m)));
  };

  const visible = [...blocks, ...events].filter((b) => b.end > start && b.start < end);

  return (
    <div className="tl-wrap">
      <div className="tl" style={{ height: (end - start) * PX }}>
        {hours.map((h) => (
          <div key={h} className="tl-hour" style={{ top: (h * 60 - start) * PX }}>
            <span>{minToLabel(h * 60)}</span>
          </div>
        ))}
        <div className="tl-grid" onClick={tapGrid} role="presentation">
          {layoutBlocks(visible).map(({ b, col, n }) => {
            const s = Math.max(b.start, start);
            const e = Math.min(b.end, end);
            const h = Math.max(17, (e - s) * PX - 2);
            const task = b.taskId && tasksById[b.taskId];
            const short = h < 32;
            const tiny = h < 22;
            const past = isToday && b.end <= now;
            if (b.cal) {
              return (
                <button
                  key={b.id}
                  className={`blk cal t-cal${short ? ' short' : ''}${tiny ? ' tiny' : ''}${past ? ' past' : ''}`}
                  style={{
                    top: (s - start) * PX + 1,
                    height: h,
                    left: `calc(${(col / n) * 100}% + 3px)`,
                    width: `calc(${100 / n}% - 6px)`,
                    '--c': b.color,
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toast(`From ${b.calendar}. Edit it in Apple Calendar.`);
                  }}
                  aria-label={`${b.title}, ${minToLabel(b.start)} to ${minToLabel(b.end)}, from ${b.calendar}`}
                >
                  <span className="b-title">{b.title}</span>
                  <span className="b-time">
                    {minToLabel(b.start)}–{minToLabel(b.end)}
                    {!short && ` · ${b.calendar}`}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={b.id}
                className={`blk t-${b.type}${short ? ' short' : ''}${tiny ? ' tiny' : ''}${past ? ' past' : ''}${isToday && b.start <= now && now < b.end ? ' live' : ''}`}
                style={{
                  top: (s - start) * PX + 1,
                  height: h,
                  left: `calc(${(col / n) * 100}% + 3px)`,
                  width: `calc(${100 / n}% - 6px)`,
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onEdit(b);
                }}
                aria-label={`${b.title}, ${minToLabel(b.start)} to ${minToLabel(b.end)}`}
              >
                <span className="b-title">{b.title}</span>
                <span className="b-time">
                  {minToLabel(b.start)}–{minToLabel(b.end)}
                  {!short && ` · ${fmtDur(b.end - b.start)}`}
                </span>
                {task && !short && h > 50 && (
                  <span className="b-task">
                    {task.status === 'done' ? '✓ ' : '↳ '}
                    {task.title}
                  </span>
                )}
              </button>
            );
          })}
          {isToday && now >= start && now <= end && <div className="nowline" style={{ top: (now - start) * PX }} />}
        </div>
      </div>
    </div>
  );
}
