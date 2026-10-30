import { useRef, useState } from 'react';
import { addDays, todayISO, weekStart } from '../lib/dates.js';
import { Icon } from '../components/ui.jsx';
import { useSwipe } from '../lib/swipe.js';
import DayView from './DayView.jsx';
import WeekView from './WeekView.jsx';

export default function PlanView() {
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(todayISO());
  const [enter, setEnter] = useState(0);
  const step = (n) => {
    setEnter(Math.sign(n));
    setDate((d) => addDays(d, mode === 'day' ? n : 7 * n));
  };
  const today = todayISO();
  const goToday = () => {
    setEnter(Math.sign(today.localeCompare(date)));
    setDate(today);
  };
  // Swipe the calendar to move a day (or a week) at a time.
  const pager = useRef(null);
  useSwipe(pager, { onSwipe: step, only: '[data-swipe-days]', claim: true });
  const first = useRef(true);
  const viewKey = mode + (mode === 'day' ? date : weekStart(date));
  const prevKey = useRef(viewKey);
  if (prevKey.current !== viewKey) {
    prevKey.current = viewKey;
    first.current = false;
  }
  const atToday = mode === 'day' ? date === today : weekStart(date) === weekStart(today);

  return (
    <>
      <div className="plan-bar">
        <div className="seg" role="group" aria-label="Plan view">
          <button aria-pressed={mode === 'day'} onClick={() => { setEnter(0); setMode('day'); }}>Day</button>
          <button aria-pressed={mode === 'week'} onClick={() => { setEnter(0); setMode('week'); }}>Week</button>
        </div>
        <div className="stepper">
          <button className="icon-btn" onClick={() => step(-1)} aria-label={mode === 'day' ? 'Previous day' : 'Previous week'}>
            <Icon name="left" />
          </button>
          <button className="mini today-btn" onClick={goToday} disabled={atToday}>
            {mode === 'day' ? 'Today' : 'This week'}
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label={mode === 'day' ? 'Next day' : 'Next week'}>
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="pager" ref={pager}>
      <div className={`subview${first.current ? '' : enter ? (enter > 0 ? ' enter-next' : ' enter-prev') : ' swap'}`} key={viewKey}>
        {mode === 'day' ? (
          <DayView date={date} />
        ) : (
          <WeekView
            date={date}
            openDay={(d) => {
              setEnter(0);
              setDate(d);
              setMode('day');
            }}
          />
        )}
      </div>
      </div>
    </>
  );
}
