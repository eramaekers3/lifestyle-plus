import { useState } from 'react';
import { useSettings } from '../store.js';
import { todayISO } from '../lib/dates.js';
import { useShutDown, useReviewed, reviewWeek, reviewDue } from '../lib/review.js';
import { useDayStarted } from './MorningSheet.jsx';
import { Icon } from './ui.jsx';

// Small notifications that float above the tab bar instead of pushing the home screen down.
// Tap one to open it; × hides it for the rest of the day on this device.
const KEY = 'lifestyleplus.noticesHidden';
const readHidden = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v.date === todayISO() ? v.ids || [] : [];
  } catch {
    return [];
  }
};
const writeHidden = (ids) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: todayISO(), ids }));
  } catch {
    /* storage unavailable */
  }
};

export default function Notices() {
  const date = todayISO();
  const { morningPage } = useSettings();
  const started = useDayStarted(date);
  const shutDown = useShutDown(date);
  const reviewed = useReviewed(reviewWeek());
  const [hidden, setHidden] = useState(readHidden);
  const hour = new Date().getHours();

  const all = [
    !started && morningPage !== false && hour < 15 && { id: 'start', href: '#morning', icon: 'sun', text: 'Start my day', tone: 'sun' },
    !reviewed && reviewDue() && { id: 'review', href: '#review', icon: 'review', text: 'Weekly review', tone: 'sky' },
    !shutDown && hour >= 16 && { id: 'shutdown', href: '#shutdown', icon: 'moon', text: 'Shut down the day', tone: 'lilac' },
  ].filter((n) => n && !hidden.includes(n.id));
  if (!all.length) return null;

  const hide = (id) => {
    const next = [...hidden, id];
    setHidden(next);
    writeHidden(next);
  };

  return (
    <div className="notices" role="status">
      {all.map((n) => (
        <div key={n.id} className={`notice t-${n.tone}`}>
          <a href={n.href}>
            <Icon name={n.icon} size={16} />
            <b>{n.text}</b>
          </a>
          <button onClick={() => hide(n.id)} aria-label={`Hide “${n.text}” for today`}>×</button>
        </div>
      ))}
    </div>
  );
}
