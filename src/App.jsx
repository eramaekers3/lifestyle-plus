import { useEffect, useRef, useState } from 'react';
import { useSettings, useSyncStatus, clearSample } from './store.js';
import { Icon, Toaster, HeartMark } from './components/ui.jsx';
import { DEFAULT_HEART } from './lib/logo.js';
import { useCalendarSync } from './lib/calendar.js';
import { useCanvasSync } from './lib/canvas.js';
import { useTheme, useHeartIcon } from './lib/theme.js';
import CaptureSheet from './components/CaptureSheet.jsx';
import ShutdownSheet from './components/ShutdownSheet.jsx';
import ReviewSheet from './components/ReviewSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import MorningSheet, { useDayStarted, wantsMorning } from './components/MorningSheet.jsx';
import { todayISO } from './lib/dates.js';
import { toast } from './lib/toast.js';
import { usePushKeepAlive } from './lib/push.js';
import { useSwipe } from './lib/swipe.js';
import { useRecurring } from './lib/recurring.js';
import { useCanvasTasks } from './lib/canvasStack.js';
import { useSeedRoutines, useSession } from './lib/workouts.js';
import LiveWorkout, { WorkoutPill } from './components/LiveWorkout.jsx';
import PlanView from './views/PlanView.jsx';
import StackView from './views/StackView.jsx';
import HabitsView from './views/HabitsView.jsx';
import BodyView from './views/BodyView.jsx';
import MoneyView from './views/MoneyView.jsx';
import ListsView from './views/ListsView.jsx';
import { resumeBankSignIn } from './lib/finance.js';

const TABS = [
  { id: 'plan', label: 'Plan', View: PlanView },
  { id: 'stack', label: 'Stack', View: StackView },
  { id: 'lists', label: 'Lists', View: ListsView },
  { id: 'habits', label: 'Habits', View: HabitsView },
  { id: 'body', label: 'Body', View: BodyView },
  { id: 'money', label: 'Money', View: MoneyView },
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
  const tabRef = useRef(tab);
  const [enter, setEnter] = useState(0); // which side the new tab slides in from
  const pager = useRef(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const settingsData = useSettings();
  const { sample } = settingsData;
  const started = useDayStarted(todayISO());
  const [morning, setMorning] = useState(() => window.location.hash === '#morning');
  // The shutdown and weekly review open from a link (#shutdown, #review), e.g. a notification or a banner.
  const [ritual, setRitual] = useState(() => ['#shutdown', '#review'].includes(window.location.hash) ? window.location.hash.slice(1) : null);
  const sync = useSyncStatus();
  useCalendarSync();
  useCanvasSync();
  useCanvasTasks();

  // Coming back from a bank's own sign-in page (Capital One and others): finish connecting it.
  useEffect(() => {
    const p = resumeBankSignIn();
    if (!p) return;
    setTab('money');
    tabRef.current = 'money';
    p.then((name) => name && toast(`${name} connected`)).catch((e) => toast(e.message));
  }, []);
  usePushKeepAlive(!!sync.email);
  useSeedRoutines();
  useRecurring();

  // The workout screen opens when a workout starts on this device; after a reload it waits behind the pill.
  const session = useSession();
  const [liveOpen, setLiveOpen] = useState(false);
  const sessionStart = session && session.startedAt;
  useEffect(() => {
    if (sessionStart && Date.now() - sessionStart < 5000) setLiveOpen(true);
    if (!sessionStart) setLiveOpen(false);
  }, [sessionStart]);
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
      if (window.location.hash === '#shutdown' || window.location.hash === '#review') {
        setRitual(window.location.hash.slice(1));
        return;
      }
      const next = tabFromHash();
      const idx = (id) => TABS.findIndex((t) => t.id === id);
      setEnter(Math.sign(idx(next) - idx(tabRef.current)));
      tabRef.current = next;
      setTab(next);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // For a moment after a page appears, things that are already checked or selected don't replay
  // their check-off animations.
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    setSettling(true);
    const t = setTimeout(() => setSettling(false), 700);
    return () => clearTimeout(t);
  }, [tab]);

  // Switch tabs directly (no waiting on a hashchange round-trip), then record it in the URL.
  const go = (id) => {
    if (id === tab) return window.scrollTo({ top: 0, behavior: 'smooth' });
    const idx = (x) => TABS.findIndex((t) => t.id === x);
    setEnter(Math.sign(idx(id) - idx(tabRef.current)));
    tabRef.current = id;
    setTab(id);
    window.scrollTo(0, 0);
    history.pushState(null, '', `#${id}`);
  };

  // Swipe anywhere on a main screen to move between tabs (the calendar swipes days instead).
  const tabIdx = TABS.findIndex((t) => t.id === tab);
  useSwipe(pager, {
    can: (dir) => !!TABS[tabIdx + dir],
    onSwipe: (dir) => TABS[tabIdx + dir] && go(TABS[tabIdx + dir].id),
  });

  const closeRitual = () => {
    setRitual(null);
    if (['#shutdown', '#review'].includes(window.location.hash)) history.replaceState(null, '', `#${tab}`);
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
    <div className={`app${settling ? ' settling' : ''}`}>
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

      <div className="pager app-pager" ref={pager}>
        <main className={`view${enter ? (enter > 0 ? ' enter-next' : ' enter-prev') : ''}`} key={tab}>
          <View />
        </main>
      </div>

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
      {session && !liveOpen && <WorkoutPill onOpen={() => setLiveOpen(true)} />}
      {session && liveOpen && <LiveWorkout onMinimize={() => setLiveOpen(false)} />}
      {morning && (
        <MorningSheet
          onClose={() => {
            setMorning(false);
            if (!started) skipToday();
            if (window.location.hash === '#morning') history.replaceState(null, '', '#plan');
          }}
        />
      )}
      {ritual === 'shutdown' && <ShutdownSheet onClose={closeRitual} />}
      {ritual === 'review' && <ReviewSheet onClose={closeRitual} />}
      <Toaster />
    </div>
  );
}
