import { useEffect, useState } from 'react';
import { useSettings, useSyncStatus, clearSample } from './store.js';
import { Icon, Toaster, HeartMark } from './components/ui.jsx';
import { DEFAULT_HEART } from './lib/logo.js';
import { useCalendarSync } from './lib/calendar.js';
import { useCanvasSync } from './lib/canvas.js';
import { useTheme, useHeartIcon } from './lib/theme.js';
import CaptureSheet from './components/CaptureSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import MorningSheet, { useDayStarted, wantsMorning } from './components/MorningSheet.jsx';
import { todayISO } from './lib/dates.js';
import { usePushKeepAlive } from './lib/push.js';
import PlanView from './views/PlanView.jsx';
import StackView from './views/StackView.jsx';
import HabitsView from './views/HabitsView.jsx';
import BodyView from './views/BodyView.jsx';

const TABS = [
  { id: 'plan', label: 'Plan', View: PlanView },
  { id: 'stack', label: 'Stack', View: StackView },
  { id: 'habits', label: 'Habits', View: HabitsView },
  { id: 'body', label: 'Body', View: BodyView },
];
// "Not now" on the morning page holds until tomorrow on this device.
const SKIP_KEY = 'lifestyleplus.morningSkipped';
const skippedToday = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === todayISO();
  } catch {
    return false;
  }
};
const skipToday = () => {
  try {
    localStorage.setItem(SKIP_KEY, todayISO());
  } catch {
    /* storage unavailable */
  }
};

const tabFromHash = () => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? h : 'plan';
};

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const settingsData = useSettings();
  const { sample } = settingsData;
  const started = useDayStarted(todayISO());
  const [morning, setMorning] = useState(() => window.location.hash === '#morning');
  const sync = useSyncStatus();
  useCalendarSync();
  useCanvasSync();
  usePushKeepAlive(!!sync.email);
  useTheme();
  useHeartIcon();

  // Open the morning page by itself on the first open of a morning, until the day is started.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      if (!skippedToday() && wantsMorning(settingsData, started)) setMorning(true);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [settingsData, started]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#morning') {
        setMorning(true);
        return;
      }
      setTab(tabFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    if (id === tab) return window.scrollTo({ top: 0, behavior: 'smooth' });
    window.location.hash = id;
  };

  const { View } = TABS.find((t) => t.id === tab);
  const syncLabel = {
    local: 'This device only',
    'signed-out': 'Not signed in',
    syncing: 'Syncing',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Sync problem',
  }[sync.state];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" aria-label="lifestyle+">
          <span aria-hidden="true">lifestyle</span>
          <HeartMark color={settingsData.heartColor || DEFAULT_HEART} />
        </div>
        <button className="sync-btn" onClick={() => setSettings(true)} aria-label={`Settings. ${syncLabel}`}>
          <span className={`sync-dot s-${sync.state}`} aria-hidden="true" />
          <span className="sync-text">{syncLabel}</span>
          <Icon name="settings" />
        </button>
      </header>

      {sample && (
        <div className="banner">
          <span>You’re looking at sample data.</span>
          <button className="mini" onClick={clearSample}>Clear it</button>
        </div>
      )}

      <main className="view" key={tab}>
        <View />
      </main>

      <button className="fab" onClick={() => setCapture(true)} aria-label="Capture a task">
        <Icon name="plus" size={28} />
      </button>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.id} size={22} />
            {t.label}
          </button>
        ))}
      </nav>

      {capture && <CaptureSheet onClose={() => setCapture(false)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
      {morning && (
        <MorningSheet
          onClose={() => {
            setMorning(false);
            if (!started) skipToday();
            if (window.location.hash === '#morning') history.replaceState(null, '', '#plan');
          }}
        />
      )}
      <Toaster />
    </div>
  );
}
