import { useEffect, useState } from 'react';
import { useSettings, useSyncStatus, clearSample } from './store.js';
import { Icon, Toaster } from './components/ui.jsx';
import CaptureSheet from './components/CaptureSheet.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
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
const tabFromHash = () => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? h : 'plan';
};

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const { sample } = useSettings();
  const sync = useSyncStatus();

  useEffect(() => {
    const onHash = () => {
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
        <div className="brand">lifestyle<b>+</b></div>
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
      <Toaster />
    </div>
  );
}
