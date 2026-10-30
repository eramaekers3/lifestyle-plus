import { useEffect, useState } from 'react';
import { ACCENTS, FONTS, loadAllFonts } from '../lib/theme.js';
import { getHealthKeyInfo, createHealthKey, deleteHealthKey } from '../lib/health.js';
import { parseStreaksExport, streaksToRecords } from '../lib/streaksImport.js';
import { list, putMany } from '../store.js';
import { Sheet, HeartMark } from './ui.jsx';
import { useCategories, addCategory, removeCategory } from '../lib/model.js';
import { HEART_COLORS, DEFAULT_HEART } from '../lib/logo.js';
import {
  useSettings, saveSettings, useSyncStatus, sync, signIn, signUp, signOut, clearSample, eraseAll,
} from '../store.js';
import { minToLabel } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import { addCalendar, removeCalendar, refreshCalendar, useCalendarStatus, setCalendarColor } from '../lib/calendar.js';
import { enablePush, disablePush, sendTestPush, usePushState } from '../lib/push.js';
import { connectCanvas, disconnectCanvas, refreshCanvas, useCanvasStatus, looksLikeCanvasFeed, setCanvasColor, saveCanvasToken, removeCanvasToken, refreshSubmissions } from '../lib/canvas.js';

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

      <LookSection />

      <NotifySection signedIn={!!st.email} />

      <CalendarSection />

      <CanvasSection />

      <HealthSection signedIn={!!st.email} />

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

      <CategoriesSection />

      <StreaksImport />

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

/** Where calendar connections live: your account when signed in, otherwise just this device. */
function SavedTo() {
  const st = useSyncStatus();
  return st.email ? (
    <p className="muted small saved-to">Saved to your account ({st.email}), so it shows on every device you sign in on.</p>
  ) : (
    <p className="err saved-to">You’re not signed in, so this is only saved on this device. Sign in at the top of Settings to keep it on every device.</p>
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
      <p className="muted small">Your events show on the day timeline as fixed blocks. Read-only, refreshed every 10 minutes. Tap a calendar’s dot to change its color.</p>
      {calendars.length > 0 && <SavedTo />}

      {calendars.length > 0 && (
        <ul className="rows cal-list">
          {calendars.map((c) => (
            <li key={c.id} className="row">
              <label className="cal-swatch" style={{ '--c': c.color }} title="Change color">
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => setCalendarColor(c.id, e.target.value)}
                  aria-label={`Color for ${c.name || 'calendar'}`}
                />
              </label>
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

const DEFAULT_NOTIFY = { blocks: true, lead: 5, morning: true, morningAt: 480, school: true, schoolAt: 1200, shutdown: true, shutdownAt: 1260 };
const timeOptions = (from, to) => Array.from({ length: (to - from) * 2 + 1 }, (_, i) => from * 60 + i * 30);

function CategoriesSection() {
  const cats = useCategories();
  const [name, setName] = useState('');
  const add = (e) => {
    e.preventDefault();
    if (!name.trim() || cats.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return;
    addCategory(name);
    setName('');
  };
  return (
    <section className="set-sec">
      <h3>Task categories</h3>
      <p className="muted small">Pick one when you add a task. Removing a category keeps its tasks; they just lose the label.</p>
      {cats.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {cats.map((c) => (
            <span key={c.id} className="chip cat-chip" style={{ '--c': c.color }}>
              <i aria-hidden="true" />
              {c.name}
              <button className="x" onClick={() => { removeCategory(c); toast(`Removed ${c.name}`); }} aria-label={`Remove ${c.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <form className="inline" onSubmit={add}>
        <input id="cat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" autoComplete="off" />
        <button className="btn">Add</button>
      </form>
    </section>
  );
}

function NotifySection({ signedIn }) {
  const s = useSettings();
  const n = { ...DEFAULT_NOTIFY, ...(s.notify || {}) };
  const setN = (changes) => saveSettings({ notify: { ...n, ...changes } });
  const [state, refresh] = usePushState();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = (fn, done) => async () => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
    refresh();
  };

  return (
    <section className="set-sec">
      <h3>Notifications</h3>
      {state === 'install' && (
        <p className="muted small">On iPhone, notifications only work from the Home Screen app. In Safari, tap <b>Share → Add to Home Screen</b>, open lifestyle+ from there, then come back here.</p>
      )}
      {state === 'unsupported' && <p className="muted small">This browser can’t receive notifications.</p>}
      {state === 'blocked' && <p className="muted small">Notifications are blocked for lifestyle+. Turn them on in iPhone <b>Settings → Notifications → lifestyle+</b>, then reopen the app.</p>}
      {(state === 'off' || state === 'on') && !signedIn && <p className="muted small">Sign in above first, so reminders can reach this phone.</p>}
      {(state === 'off' || state === 'on') && signedIn && (
        <div className="btn-row" style={{ marginTop: 0 }}>
          {state === 'off' ? (
            <button className="btn" onClick={run(enablePush, 'Notifications on for this phone')} disabled={busy}>Turn on for this phone</button>
          ) : (
            <>
              <button className="btn ghost" onClick={run(sendTestPush, 'Test sent')} disabled={busy}>Send a test</button>
              <button className="btn ghost" onClick={run(disablePush, 'Notifications off for this phone')} disabled={busy}>Turn off</button>
            </>
          )}
        </div>
      )}
      {err && <p className="err">{err}</p>}

      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={n.blocks} onChange={(e) => setN({ blocks: e.target.checked })} />
          <span>Before each time block</span>
          <select className="input" value={n.lead} disabled={!n.blocks} onChange={(e) => setN({ lead: +e.target.value })} aria-label="How long before a block">
            {[0, 5, 10, 15].map((m) => <option key={m} value={m}>{m ? `${m} min before` : 'When it starts'}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={n.morning} onChange={(e) => setN({ morning: e.target.checked })} />
          <span>Morning nudge if the day isn’t started</span>
          <select className="input" value={n.morningAt} disabled={!n.morning} onChange={(e) => setN({ morningAt: +e.target.value })} aria-label="Morning nudge time">
            {timeOptions(5, 11).map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={n.school} onChange={(e) => setN({ school: e.target.checked })} />
          <span>Evening heads-up for homework due tomorrow and tests</span>
          <select className="input" value={n.schoolAt} disabled={!n.school} onChange={(e) => setN({ schoolAt: +e.target.value })} aria-label="School reminder time">
            {timeOptions(16, 22).map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={n.shutdown} onChange={(e) => setN({ shutdown: e.target.checked })} />
          <span>Shutdown reminder at night (weekly review on Sundays)</span>
          <select className="input" value={n.shutdownAt} disabled={!n.shutdown} onChange={(e) => setN({ shutdownAt: +e.target.value })} aria-label="Shutdown reminder time">
            {timeOptions(17, 23).map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.morningPage !== false} onChange={(e) => saveSettings({ morningPage: e.target.checked })} />
          <span>Open the morning page on the first open of each morning</span>
        </label>
      </div>
    </section>
  );
}

function CanvasToken({ c }) {
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (token.trim().length < 20) return setErr('That looks too short. Copy the whole token Canvas shows you.');
    setBusy(true);
    setErr('');
    const problem = await saveCanvasToken(token);
    setBusy(false);
    if (problem) setErr(problem);
    else {
      setToken('');
      toast('Canvas connected. Submitted work checks itself off.');
    }
  };

  return (
    <div className="canvas-token">
      <p className="sub-h">Check off submitted work automatically</p>
      {c.hasToken ? (
        <>
          <p className="muted small">
            {c.statusLoading
              ? 'Checking Canvas…'
              : c.statusError
                ? ''
                : `Connected${c.account ? ` as ${c.account}` : ''}${c.statusAt ? ` · checked ${new Date(c.statusAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. Anything you turn in gets checked off, on every device.`}
          </p>
          {c.statusError && <p className="err">{c.statusError}</p>}
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="mini" onClick={() => refreshSubmissions(true)} disabled={c.statusLoading}>Check now</button>
            <button className="mini" onClick={() => { removeCanvasToken(); toast('Token removed'); }}>Remove token</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">The feed only has due dates. Add a Canvas access token and lifestyle+ can see what you’ve turned in.</p>
          <form className="inline" onSubmit={save}>
            <input
              id="canvas-token"
              className="input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Canvas access token"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button className="btn" disabled={busy}>{busy ? 'Checking…' : 'Save'}</button>
          </form>
          {err && <p className="err">{err}</p>}
          <button type="button" className="link-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
            {help ? 'Hide' : 'How do I get a token?'}
          </button>
          {help && (
            <ol className="steps small">
              <li>Open <b>canvas.unl.edu</b> in Safari and tap <b>Account → Settings</b>.</li>
              <li>Under <b>Approved Integrations</b>, tap <b>+ New Access Token</b>. (If there’s no button, UNL doesn’t allow student tokens.)</li>
              <li>Purpose: <b>lifestyle+</b>. Leave the expiry blank, or pick the end of the semester.</li>
              <li>Tap <b>Generate Token</b>, copy it (Canvas only shows it once) and paste it above.</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function CanvasSection() {
  const c = useCanvasStatus();
  const { canvasToStack } = useSettings();
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(!c);

  const add = (e) => {
    e.preventDefault();
    const v = url.trim();
    if (!looksLikeCanvasFeed(v)) {
      setErr('Paste the Calendar Feed link from Canvas. It contains /feeds/calendars/ and ends in .ics.');
      return;
    }
    setErr('');
    connectCanvas(v);
    setUrl('');
    setHelp(false);
  };

  return (
    <section className="set-sec">
      <h3>Canvas</h3>
      <p className="muted small">Homework and tests from Canvas show on your week and day. Read-only, refreshed every 30 minutes. Checking something off here doesn’t change Canvas.</p>
      {c && <SavedTo />}

      {c ? (
        <ul className="rows cal-list">
          <li className="row">
            <label className="cal-swatch" style={{ '--c': c.color }} title="Change color">
              <input type="color" value={c.color} onChange={(e) => setCanvasColor(c, e.target.value)} aria-label="Color for Canvas" />
            </label>
            <span className="row-title">
              <b>{c.name ? c.name.replace(/\s*\(Canvas\)\s*$/, '') : 'Canvas'}</b>
              <span className="muted small cal-state">
                {c.loading
                  ? ' · Updating…'
                  : c.error
                    ? ''
                    : c.fetchedAt
                      ? ` · ${c.count} items · updated ${new Date(c.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                      : ''}
              </span>
              {c.error && <span className="err cal-err">{c.error}</span>}
            </span>
            <button className="mini" onClick={() => refreshCanvas(c, true)} disabled={c.loading}>Refresh</button>
            <button className="x" onClick={() => { disconnectCanvas(); toast('Canvas disconnected'); }} aria-label="Disconnect Canvas">×</button>
          </li>
        </ul>
      ) : (
        <form className="inline" onSubmit={add}>
          <input
            id="canvas-url"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://canvas.unl.edu/feeds/calendars/user_….ics"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button className="btn">Connect</button>
        </form>
      )}
      {err && <p className="err">{err}</p>}

      {c && (
        <label className="toggle">
          <input type="checkbox" checked={canvasToStack !== false} onChange={(e) => saveSettings({ canvasToStack: e.target.checked })} />
          <span>Add homework and tests due in the next 2 weeks to my backlog (finishing one checks it off here too)</span>
        </label>
      )}

      {c && <CanvasToken c={c} />}

      <button type="button" className="link-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
        {help ? 'Hide' : 'How do I get the link?'}
      </button>
      {help && (
        <ol className="steps small">
          <li>Open <b>canvas.unl.edu</b> in Safari and sign in. (The Canvas app doesn’t show this link.)</li>
          <li>Tap <b>Calendar</b> in the left menu.</li>
          <li>Scroll to the bottom of the right side and tap <b>Calendar Feed</b>.</li>
          <li>Copy the link it shows and paste it above.</li>
        </ol>
      )}
      {help && <p className="muted small">Anyone with this link can see your due dates, so keep it private. Items named exam, midterm, final, test or quiz are marked as tests.</p>}
    </section>
  );
}

function HeartColor() {
  const s = useSettings();
  const current = (s.heartColor || DEFAULT_HEART).toLowerCase();
  const isPreset = HEART_COLORS.some((h) => h.hex === current);
  return (
    <>
      <p className="muted small" style={{ marginTop: 14 }}>Logo and app icon heart</p>
      <div className="swatches" role="group" aria-label="Heart color">
        {HEART_COLORS.map((h) => (
          <button key={h.id} className="heart-swatch" aria-pressed={current === h.hex} aria-label={h.name} title={h.name} onClick={() => saveSettings({ heartColor: h.hex })}>
            <HeartMark color={h.hex} size={30} className="" />
          </button>
        ))}
        <label className={`swatch swatch-custom${isPreset ? '' : ' on'}`} title="Pick any color">
          <input type="color" value={current} onChange={(e) => saveSettings({ heartColor: e.target.value })} aria-label="Pick any heart color" />
        </label>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        The logo changes right away. iPhone keeps the Home Screen icon it saved when you added the app, so to update that too, remove lifestyle+ from your Home Screen and add it again from Safari.
      </p>
    </>
  );
}

function LookSection() {
  const s = useSettings();
  useEffect(loadAllFonts, []);
  const current = (s.accent || '').toLowerCase();
  const isPreset = ACCENTS.some((a) => a.hex === current);
  return (
    <section className="set-sec">
      <h3>Look</h3>
      <p className="muted small">Accent color</p>
      <div className="swatches" role="group" aria-label="Accent color">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            className="swatch"
            style={{ '--c': a.hex }}
            aria-pressed={current === a.hex}
            aria-label={a.name}
            title={a.name}
            onClick={() => saveSettings({ accent: a.hex })}
          />
        ))}
        <label className={`swatch swatch-custom${isPreset ? '' : ' on'}`} title="Pick any color">
          <input
            id="accent-custom"
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#ffcf5c'}
            onChange={(e) => saveSettings({ accent: e.target.value })}
            aria-label="Pick any accent color"
          />
        </label>
      </div>

      <HeartColor />

      <p className="muted small" style={{ marginTop: 14 }}>Heading font</p>
      <div className="font-list" role="group" aria-label="Heading font">
        {FONTS.map((f) => (
          <button
            key={f.id}
            className="font-opt"
            aria-pressed={(s.headingFont || 'bricolage') === f.id}
            onClick={() => saveSettings({ headingFont: f.id })}
          >
            <span className="sample" style={{ fontFamily: `${f.family}, system-ui, sans-serif`, fontWeight: f.weight, letterSpacing: f.tracking }}>Thursday</span>
            <span className="fname">{f.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HealthSection({ signedIn }) {
  const [info, setInfo] = useState(undefined);
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const endpoint = `${window.location.origin}/api/health`;

  useEffect(() => {
    if (!signedIn) return;
    getHealthKeyInfo().then(setInfo).catch((e) => setErr(e.message));
  }, [signedIn]);

  const make = async () => {
    if (info && !confirmNew) return setConfirmNew(true);
    setBusy(true);
    setErr('');
    try {
      setKey(await createHealthKey());
      setInfo({ created_at: new Date().toISOString(), last_used_at: null });
      setConfirmNew(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast('Press and hold the text to copy it');
    }
  };

  return (
    <section className="set-sec">
      <h3>Apple Health</h3>
      {!signedIn ? (
        <p className="muted small">Sign in above first. Health data is saved to your account, then shows up on every device.</p>
      ) : (
        <>
          <p className="muted small">
            An iPhone Shortcut sends your weight, steps, sleep and workouts here. It needs a private key so only your phone can send data.
          </p>
          {info && !key && (
            <p className="small">
              Key created {new Date(info.created_at).toLocaleDateString()}
              {' · '}
              {info.last_used_at ? `last data received ${new Date(info.last_used_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'no data received yet'}
            </p>
          )}
          {key && (
            <div className="keybox">
              <p className="small"><b>Your health key.</b> Copy it into your Shortcut now. It won’t be shown again.</p>
              <code className="key" id="health-key">{key}</code>
              <div className="btn-row">
                <button className="btn" onClick={() => copy(key, 'Key')}>Copy key</button>
                <button className="btn ghost" onClick={() => copy(endpoint, 'Address')}>Copy address</button>
              </div>
              <p className="muted small">Address: <code>{endpoint}</code></p>
            </div>
          )}
          <div className="btn-row">
            <button className={`btn ${info ? 'ghost' : ''}`} onClick={make} disabled={busy}>
              {busy ? 'Working…' : info ? (confirmNew ? 'Tap again: the old key stops working' : 'Make a new key') : 'Create health key'}
            </button>
            {info && (
              <button className="btn ghost" onClick={async () => { await deleteHealthKey(); setInfo(null); setKey(''); toast('Health key removed'); }}>
                Disconnect
              </button>
            )}
          </div>
          {err && <p className="err">{err}</p>}
        </>
      )}
    </section>
  );
}

function StreaksImport() {
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setDone('');
    try {
      setParsed(parseStreaksExport(await file.text()));
    } catch (x) {
      setParsed(null);
      setErr(x.message);
    }
  };

  const run = () => {
    const items = streaksToRecords(parsed, list('habit'));
    putMany(items);
    setDone(`Imported ${parsed.habits.length} habits and ${parsed.entries.toLocaleString()} days of history.`);
    toast('History imported');
    setParsed(null);
  };

  const range = parsed && `${new Date(parsed.from + 'T12:00').toLocaleDateString([], { month: 'short', year: 'numeric' })} – ${new Date(parsed.to + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <section className="set-sec">
      <h3>Import from Streaks</h3>
      <p className="muted small">
        Bring in your habits and their full history. In Streaks, open Settings → Export Data → CSV, save the file, then choose it here.
        Importing the same file again updates it instead of making copies.
      </p>
      <label className="btn ghost file-btn" htmlFor="streaks-file">
        Choose CSV file
        <input id="streaks-file" type="file" accept=".csv,text/csv" onChange={pick} />
      </label>
      {err && <p className="err">{err}</p>}
      {done && <p className="small ok-text">{done}</p>}
      {parsed && (
        <div className="import-preview">
          <p className="small">
            <b>{parsed.habits.length} habits</b> · {parsed.entries.toLocaleString()} entries · {range}
          </p>
          <ul className="rows">
            {parsed.habits.map((h) => (
              <li key={h.taskId} className="row small">
                <span className="row-title">{h.name}</span>
                {h.mode === 'avoid' && <span className="tag">Avoid</span>}
                {h.paused && <span className="tag">Paused</span>}
                <span className="meta">{h.counts.d} done</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Paused habits only logged skips lately. You can resume any of them from the Habits tab.</p>
          <div className="btn-row">
            <button className="btn" onClick={run}>Import {parsed.habits.length} habits</button>
            <button className="btn ghost" onClick={() => setParsed(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
