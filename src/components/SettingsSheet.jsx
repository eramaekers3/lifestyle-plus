import { useState } from 'react';
import { Sheet } from './ui.jsx';
import {
  useSettings, saveSettings, useSyncStatus, sync, signIn, signUp, signOut, clearSample, eraseAll,
} from '../store.js';
import { minToLabel } from '../lib/dates.js';
import { toast } from '../lib/toast.js';

export default function SettingsSheet({ onClose }) {
  const s = useSettings();
  const st = useSyncStatus();
  const [confirmErase, setConfirmErase] = useState(false);

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="set-sec">
        <h3>Sync</h3>
        {st.state === 'local' ? (
          <p className="muted">
            Sync isn’t set up yet, so everything saves on this device only. Add your Supabase keys to the <code>.env</code> file to sync between your phone and laptop (the README walks through it).
          </p>
        ) : st.email ? (
          <>
            <p>Signed in as <b>{st.email}</b></p>
            <p className="muted small">
              {st.state === 'syncing' && 'Syncing…'}
              {st.state === 'synced' && st.lastSynced && `Synced at ${new Date(st.lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
              {st.state === 'offline' && 'Offline. Changes will sync when you reconnect.'}
              {st.state === 'error' && `Sync failed: ${st.error}`}
            </p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => sync()}>Sync now</button>
              <button className="btn ghost" onClick={() => signOut()}>Sign out</button>
            </div>
          </>
        ) : (
          <AuthForm />
        )}
      </section>

      <section className="set-sec">
        <h3>Stack</h3>
        <p className="muted small">How many tasks can sit in Now at once. Fewer means more focus.</p>
        <div className="seg" role="group" aria-label="Now limit">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={s.stackLimit === n} onClick={() => saveSettings({ stackLimit: n })}>{n}</button>
          ))}
        </div>
      </section>

      <section className="set-sec">
        <h3>Day</h3>
        <div className="form-grid">
          <label className="f" htmlFor="day-start">
            Day starts
            <select id="day-start" className="input" value={s.dayStart} onChange={(e) => saveSettings({ dayStart: +e.target.value })}>
              {Array.from({ length: 9 }, (_, i) => i + 4).map((h) => <option key={h} value={h}>{minToLabel(h * 60)}</option>)}
            </select>
          </label>
          <label className="f" htmlFor="day-end">
            Day ends
            <select id="day-end" className="input" value={s.dayEnd} onChange={(e) => saveSettings({ dayEnd: +e.target.value })}>
              {Array.from({ length: 9 }, (_, i) => i + 16).map((h) => <option key={h} value={h}>{h === 24 ? 'midnight' : minToLabel(h * 60)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="set-sec">
        <h3>Data</h3>
        <div className="btn-row">
          {s.sample && (
            <button className="btn ghost" onClick={() => { clearSample(); toast('Sample data cleared'); }}>Clear sample data</button>
          )}
          <button
            className={`btn ${confirmErase ? 'danger' : 'ghost'}`}
            onClick={() => {
              if (!confirmErase) return setConfirmErase(true);
              eraseAll();
              setConfirmErase(false);
              toast('Everything erased');
            }}
          >
            {confirmErase ? 'Tap again to erase everything' : 'Erase all data'}
          </button>
        </div>
      </section>
    </Sheet>
  );
}

function AuthForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ err: true, text: e.message || 'Something went wrong. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, pw)); }}>
      <p className="muted small">Sign in to sync between devices. Sample data stays behind on this device.</p>
      <input id="auth-email" className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input id="auth-pw" className="input" type="password" autoComplete="current-password" placeholder="Password (6+ characters)" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
      <div className="btn-row">
        <button className="btn" disabled={busy}>Sign in</button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !email || pw.length < 6}
          onClick={() =>
            run(async () => {
              const needsConfirm = await signUp(email, pw);
              if (needsConfirm) setMsg({ text: 'Check your email and confirm your account, then sign in here.' });
            })
          }
        >
          Create account
        </button>
      </div>
      {msg && <p className={msg.err ? 'err' : 'muted small'}>{msg.text}</p>}
    </form>
  );
}
