import { useState } from 'react';
import { useRecord } from '../store.js';
import { FOCUS, QUALITY, closeReview, saveReview, useDeepLogs, usePendingReview } from '../lib/deep.js';
import { fmt, fmtDur, iso, todayISO } from '../lib/dates.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { Sheet } from './ui.jsx';

// One color per step, from rough to great, shared by the review and the log.
const SCALE = ['var(--coral)', '#ffb36b', 'var(--sun)', 'var(--sky)', 'var(--mint)'];

const coinsFor = (mins) => Math.floor(mins / 10);
const timeOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');

/** Shown once a session ends (on the device it ended on). Mounted once, in App. */
export default function DeepReview() {
  const id = usePendingReview();
  const log = useRecord(id || '__none');
  if (!id || !log) return null;
  return <ReviewSheet log={log} key={id} />;
}

function Rating({ label, words, value, onPick }) {
  return (
    <div className="rv-q">
      <p className="cap-label">{label}</p>
      <div className="rv-scale" role="radiogroup" aria-label={label}>
        {words.map((w, i) => (
          <button
            type="button"
            key={w}
            role="radio"
            aria-checked={value === i + 1}
            aria-label={`${i + 1}: ${w}`}
            className="rv-pt"
            style={{ '--c': SCALE[i] }}
            onClick={() => {
              haptic('tick');
              onPick(i + 1);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="rv-word" style={{ '--c': value ? SCALE[value - 1] : 'var(--dim)' }}>{value ? words[value - 1] : 'Tap a number'}</p>
    </div>
  );
}

function ReviewSheet({ log }) {
  const [focus, setFocus] = useState(log.focus || 0);
  const [quality, setQuality] = useState(log.quality || 0);
  const [note, setNote] = useState(log.note || '');
  const coins = coinsFor(log.minutes);
  const earned = coins ? ` · +${coins} coin${coins === 1 ? '' : 's'}` : '';
  const fresh = !log.reviewedAt && Date.now() - log.endedAt < 10 * 60000;

  const done = () => {
    saveReview(log, { focus, quality, note });
    haptic('success');
    toast(`Session reviewed${fresh ? earned : ''}`);
    closeReview();
  };
  const skip = () => {
    if (fresh) toast(`${fmtDur(log.minutes)} of deep work logged${earned}`);
    closeReview();
  };

  return (
    <Sheet title="Session review" onClose={skip}>
      <p className="rv-sum">
        <b>{fmtDur(log.minutes)}</b> of deep work{log.title ? <> on <b>{log.title}</b></> : ''}
        <span className="muted-n">
          {' '}
          · {timeOf(log.startedAt)}–{timeOf(log.endedAt)}
        </span>
      </p>
      <Rating label="How focused were you?" words={FOCUS} value={focus} onPick={setFocus} />
      <Rating label="How good was the work?" words={QUALITY} value={quality} onPick={setQuality} />
      <label className="f full rv-note" htmlFor="rv-note">
        Notes
        <textarea
          id="rv-note"
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: what went well, what pulled you away"
        />
      </label>
      <div className="btn-row">
        <button className="btn" onClick={done} disabled={!focus || !quality}>
          Save review
        </button>
        <button className="btn ghost" onClick={skip}>
          Skip
        </button>
      </div>
    </Sheet>
  );
}

const avgText = (n) => (n == null ? '—' : n.toFixed(1));
const dayLabel = (ms) => {
  const d = iso(new Date(ms));
  return d === todayISO() ? 'Today' : fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Every session with its ratings, and how the last 7 days went. */
export function DeepLogSheet({ onClose }) {
  const g = useDeepLogs();
  const [rating, setRating] = useState(null);
  return (
    <Sheet title="Deep work log" onClose={onClose}>
      <div className="tiles lvl-tiles">
        <div className="tile"><span>7 days</span><b>{fmtDur(g.weekMinutes)}</b></div>
        <div className="tile"><span>Sessions</span><b>{g.weekCount}</b></div>
        <div className="tile"><span>Focus</span><b style={{ color: g.focus ? SCALE[Math.round(g.focus) - 1] : undefined }}>{avgText(g.focus)}</b></div>
        <div className="tile"><span>Quality</span><b style={{ color: g.quality ? SCALE[Math.round(g.quality) - 1] : undefined }}>{avgText(g.quality)}</b></div>
      </div>
      <p className="hint-quiet">Averages are out of 5, from the {g.rated} rated session{g.rated === 1 ? '' : 's'} in the last 7 days.</p>

      {g.all.length ? (
        <ul className="rows rv-log">
          {g.all.slice(0, 40).map((l) => (
            <li key={l.id} className="row">
              <span className="row-title">
                <b>{l.title || 'Open session'}</b>
                <small>
                  {dayLabel(l.startedAt)} · {timeOf(l.startedAt)} · {fmtDur(l.minutes)}
                </small>
                {l.note && <em>{l.note}</em>}
              </span>
              {l.focus && l.quality ? (
                <button className="rv-badges" onClick={() => setRating(l)} aria-label={`Focus ${l.focus}, quality ${l.quality}. Edit review`}>
                  <span style={{ '--c': SCALE[l.focus - 1] }}>F{l.focus}</span>
                  <span style={{ '--c': SCALE[l.quality - 1] }}>Q{l.quality}</span>
                </button>
              ) : (
                <button className="mini" onClick={() => setRating(l)}>Rate</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No sessions yet. Enter deep work from the Today screen.</p>
      )}
      {rating && <LogReview log={rating} onClose={() => setRating(null)} />}
    </Sheet>
  );
}

/** Rating an older session from the log. */
function LogReview({ log, onClose }) {
  const live = useRecord(log.id) || log;
  const [focus, setFocus] = useState(live.focus || 0);
  const [quality, setQuality] = useState(live.quality || 0);
  const [note, setNote] = useState(live.note || '');
  const save = () => {
    saveReview(live, { focus, quality, note });
    haptic('success');
    toast('Review saved');
    onClose();
  };
  return (
    <Sheet title="Session review" onClose={onClose}>
      <p className="rv-sum">
        <b>{fmtDur(live.minutes)}</b>{live.title ? <> on <b>{live.title}</b></> : ''}
        <span className="muted-n"> · {dayLabel(live.startedAt)}, {timeOf(live.startedAt)}</span>
      </p>
      <Rating label="How focused were you?" words={FOCUS} value={focus} onPick={setFocus} />
      <Rating label="How good was the work?" words={QUALITY} value={quality} onPick={setQuality} />
      <label className="f full rv-note" htmlFor="rv-note-old">
        Notes
        <textarea id="rv-note-old" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: what went well, what pulled you away" />
      </label>
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={!focus || !quality}>Save review</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
