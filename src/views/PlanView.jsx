import { useState } from 'react';
import { addDays, todayISO, weekStart } from '../lib/dates.js';
import { Icon } from '../components/ui.jsx';
import DayView from './DayView.jsx';
import WeekView from './WeekView.jsx';

export default function PlanView() {
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(todayISO());
  const step = (n) => setDate((d) => addDays(d, mode === 'day' ? n : 7 * n));
  const today = todayISO();
  const atToday = mode === 'day' ? date === today : weekStart(date) === weekStart(today);

  return (
    <>
      <div className="plan-bar">
        <div className="seg" role="group" aria-label="Plan view">
          <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Day</button>
          <button aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Week</button>
        </div>
        <div className="stepper">
          <button className="icon-btn" onClick={() => step(-1)} aria-label={mode === 'day' ? 'Previous day' : 'Previous week'}>
            <Icon name="left" />
          </button>
          <button className="mini today-btn" onClick={() => setDate(today)} disabled={atToday}>
            {mode === 'day' ? 'Today' : 'This week'}
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label={mode === 'day' ? 'Next day' : 'Next week'}>
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="subview" key={mode + (mode === 'day' ? date : weekStart(date))}>
        {mode === 'day' ? (
          <DayView date={date} />
        ) : (
          <WeekView
            date={date}
            openDay={(d) => {
              setDate(d);
              setMode('day');
            }}
          />
        )}
      </div>
    </>
  );
}
