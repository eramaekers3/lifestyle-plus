import { useRef, useState } from 'react';
import { addDays, todayISO } from '../lib/dates.js';
import { Icon } from '../components/ui.jsx';
import { useSwipe } from '../lib/swipe.js';
import { DeepTab } from '../components/DeepWork.jsx';
import { useDeep } from '../lib/deep.js';
import DayView from './DayView.jsx';

export default function PlanView() {
  const [date, setDate] = useState(todayISO());
  const [enter, setEnter] = useState(0);
  const deep = useDeep();
  const step = (n) => {
    setEnter(Math.sign(n));
    setDate((d) => addDays(d, n));
  };
  const today = todayISO();
  const goToday = () => {
    setEnter(Math.sign(today.localeCompare(date)));
    setDate(today);
  };
  // Swipe the calendar to move a day at a time.
  const pager = useRef(null);
  useSwipe(pager, { onSwipe: step, only: '[data-swipe-days]', claim: true });
  const first = useRef(true);
  const prevKey = useRef(date);
  if (prevKey.current !== date) {
    prevKey.current = date;
    first.current = false;
  }
  const atToday = date === today;

  return (
    <>
      <div className="plan-bar">
        {atToday && !deep ? <DeepTab /> : <span />}
        <div className="stepper">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <button className="mini today-btn" onClick={goToday} disabled={atToday}>
            Today
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next day">
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="pager" ref={pager}>
        <div className={`subview${first.current ? '' : enter ? (enter > 0 ? ' enter-next' : ' enter-prev') : ' swap'}`} key={date}>
          <DayView date={date} />
        </div>
      </div>
    </>
  );
}
