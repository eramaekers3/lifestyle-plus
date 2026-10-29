import { useState } from 'react';
import { Sheet } from './ui.jsx';
import {
  useSettings, saveSettings, useSyncStatus, sync, signIn, signUp, signOut, clearSample, eraseAll,
} from '../store.js';
import { minToLabel } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { addCalendar, removeCalendar, refreshCalendar, useCalendarStatus } from '../lib/calendar.js';

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

      <CalendarSection />

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

function CalendarSection() {
  const calendars = useCalendarStatus();
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(calendars.length === 0);

  const add = (e) => {
    e.preventDefault();
    const v = url.trim();
    if (!/^(webcals?|https):\/\/[^/]*icloud\.com\//i.test(v)) {
      setErr('Paste the link Apple gives you when you share a public calendar. It starts with webcal:// and contains icloud.com.');
      return;
    }
    if (calendars.some((c) => c.url === v)) {
      setErr('That calendar is already connected.');
      return;
    }
    setErr('');
    const cal = addCalendar(v);
    refreshCalendar(cal, true);
    setUrl('');
    setHelp(false);
  };

  return (
    <section className="set-sec">
      <h3>Apple Calendar</h3>
      <p className="muted small">Your events show on the day timeline as fixed blocks. Read-only, refreshed every 10 minutes.</p>

      {calendars.length > 0 && (
        <ul className="rows cal-list">
          {calendars.map((c) => (
            <li key={c.id} className="row">
              <span className="row-title">
                <b>{c.name || 'Loading…'}</b>
                <span className="muted small cal-state">
                  {c.loading
                    ? ' · Updating…'
                    : c.error
                      ? ''
                      : c.fetchedAt
                        ? ` · ${(c.events || []).length} events · updated ${new Date(c.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : ''}
                </span>
                {c.error && <span className="err cal-err">{c.error}</span>}
              </span>
              <button className="mini" onClick={() => refreshCalendar(c, true)} disabled={c.loading}>Refresh</button>
              <button className="x" onClick={() => { removeCalendar(c.id); toast('Calendar removed'); }} aria-label={`Remove ${c.name || 'calendar'}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      <form className="inline" onSubmit={add}>
        <input
          id="cal-url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="webcal://p…-caldav.icloud.com/published/…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="btn">Add</button>
      </form>
      {err && <p className="err">{err}</p>}

      <button type="button" className="link-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
        {help ? 'Hide' : 'How do I get the link?'}
      </button>
      {help && (
        <ol className="steps small">
          <li>Open the <b>Calendar</b> app on your iPhone and tap <b>Calendars</b> at the bottom.</li>
          <li>Tap the <b>ⓘ</b> next to an iCloud calendar.</li>
          <li>Turn on <b>Public Calendar</b>, tap <b>Share Link…</b>, then <b>Copy</b>.</li>
          <li>Paste it above. Repeat for each calendar you want.</li>
        </ol>
      )}
      {help && <p className="muted small">Anyone with a public link can see that calendar, so keep the link private. Turning Public Calendar off breaks the link.</p>}
    </section>
  );
}
