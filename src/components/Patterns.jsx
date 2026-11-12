import { useState } from 'react';
import { describe, useInsights, WINDOW } from '../lib/insights.js';
import { Icon } from './ui.jsx';

/** How sleep, workouts, deep work, the journal, XP and spending line up over the last 8 weeks. */
export default function Patterns({ max = 4 }) {
  const { insights, missing } = useInsights();
  const [all, setAll] = useState(false);

  if (!insights.length) {
    return (
      <p className="muted small" style={{ marginTop: 0 }}>
        {missing.length
          ? `Patterns show up once there’s a bit more to compare: ${missing.join(' and ')}.`
          : 'Nothing clearly stands out yet. Keep rating your days and it’ll fill in.'}
      </p>
    );
  }

  const shown = all ? insights : insights.slice(0, max);
  return (
    <>
      <ul className="rows pt-list">
        {shown.map((ins) => {
          const d = describe(ins);
          return (
            <li key={ins.id} className="row pt-row">
              <span className={`pt-arrow${d.up ? '' : ' down'}`} aria-hidden="true">
                <Icon name="up" size={15} />
              </span>
              <span className="row-title">
                <span>{d.lead}</span>
                <span className="muted small">
                  {d.change} · {ins.nA} vs {ins.nB} days
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {insights.length > max && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${insights.length}`}
        </button>
      )}
      <p className="muted small pt-note">From the last {WINDOW / 7} weeks. Patterns, not proof of what caused what.</p>
    </>
  );
}
