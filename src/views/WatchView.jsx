import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Sheet } from '../components/ui.jsx';
import CardStack from '../components/CardStack.jsx';
import { useRecord } from '../store.js';
import { haptic } from '../lib/haptics.js';
import { toast } from '../lib/toast.js';
import { fmt, todayISO } from '../lib/dates.js';
import { plural } from '../lib/text.js';
import {
  STATUSES, useWatch, addTitle, saveWatch, removeWatch, restoreWatch, sorted, matches, watchStats,
  useTitleSearch, fetchDetails, lengthLabel, typeLabel, starsText, watchId,
} from '../lib/watch.js';

const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'show', label: 'Shows' },
];
const shortDate = (d) => fmt(d, { month: 'short', day: 'numeric', year: d.slice(0, 4) === todayISO().slice(0, 4) ? undefined : 'numeric' });

/** Movies and shows: find one, mark it seen / watching / want, rate it and jot notes. */
export default function WatchView() {
  const items = useWatch();
  const [preview, setPreview] = useState(null); // a search result not saved yet
  const [open, setOpen] = useState(null); // id of a saved entry
  const stats = useMemo(() => watchStats(items), [items]);

  return (
    <>
      <header className="page-head">
        <h1>Watch</h1>
        <p>
          {stats.seen
            ? `${plural(stats.seen, 'title')} watched${stats.thisYear ? ` · ${stats.thisYear} this year` : ''}${stats.avg ? ` · average ${stats.avg.toFixed(1)}★` : ''}.`
            : 'Search for a movie or show, then rate it and keep notes. Want-to-watch ideas go here too.'}
        </p>
      </header>

      <CardStack
        page="watch"
        cards={[
          {
            id: 'find',
            title: 'Find',
            node: (
              <FindCard
                onPick={(r) => {
                  const saved = r.ref && items.find((i) => i.id === watchId(r.ref));
                  saved ? setOpen(saved.id) : setPreview(r);
                }}
                onManual={(item) => setOpen(addTitle(item, 'watched').id)}
              />
            ),
          },
          { id: 'list', title: 'My list', node: <ListCard items={items} onOpen={setOpen} /> },
          { id: 'stats', title: 'Stats', node: stats.seen >= 3 ? <StatsCard stats={stats} onOpen={setOpen} /> : null },
        ]}
      />

      {preview && (
        <PreviewSheet
          item={preview}
          onClose={() => setPreview(null)}
          onAdd={(full, status) => {
            const rec = addTitle(full, status);
            haptic('success');
            setPreview(null);
            // Seen it: go straight to rating it. Otherwise it's just on the list.
            if (status === 'watched') setOpen(rec.id);
            else toast(`${rec.title} → ${STATUSES.find((s) => s.id === status).label}`);
          }}
        />
      )}
      {open && <EntrySheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ---------- Searching ---------- */

function FindCard({ onPick, onManual }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const { results, loading, error, q: answered } = useTitleSearch(q, type);
  const typed = q.trim();
  const manualType = type === 'show' ? 'show' : 'movie';

  return (
    <section className="card" aria-labelledby="wf-h">
      <div className="card-head">
        <h2 id="wf-h">Find a title</h2>
        <div className="seg wt-types" role="group" aria-label="Movies or shows">
          {TYPES.map((t) => (
            <button key={t.id} aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <form className="wt-search" onSubmit={(e) => { e.preventDefault(); e.target.querySelector('input').blur(); }} role="search">
        <input
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={type === 'show' ? 'Search shows…' : type === 'movie' ? 'Search movies…' : 'Search movies and shows…'}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
        />
        {q && (
          <button type="button" className="wt-clear" onClick={() => setQ('')} aria-label="Clear search">×</button>
        )}
      </form>

      {typed.length >= 2 && (
        <>
          {loading && !results.length && <p className="hint">Looking…</p>}
          {error && <p className="hint">{error}</p>}
          {!loading && !error && answered && !results.length && <p className="hint">Nothing matched “{answered}”.</p>}
          {results.length > 0 && (
            <ul className={`rows wt-results${loading ? ' stale' : ''}`}>
              {results.map((r) => (
                <li key={r.ref} className="row wt-row" onClick={() => onPick(r)}>
                  <Poster src={r.poster} title={r.title} size="sm" />
                  <span className="row-title">
                    <b>{r.title}</b>
                    <span className="muted small">{[typeLabel(r.type), r.year].filter(Boolean).join(' · ')}{r.genres && r.genres.length ? ` · ${r.genres.slice(0, 2).join(', ')}` : ''}</span>
                  </span>
                  <Icon name="right" size={16} />
                </li>
              ))}
            </ul>
          )}
          <button className="mini wt-manual" onClick={() => { onManual({ title: typed, type: manualType }); setQ(''); }}>
            <Icon name="plus" size={14} /> Add “{typed}” by hand
          </button>
        </>
      )}
    </section>
  );
}

/** A search result before it's saved: the details, and where to put it. */
function PreviewSheet({ item, onClose, onAdd }) {
  const [full, setFull] = useState(item);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    fetchDetails(item.ref).then((d) => {
      if (!live) return;
      if (d) setFull({ ...item, ...d });
      setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [item]);
  return (
    <Sheet title={item.title} onClose={onClose}>
      <TitleInfo item={full} loading={busy} />
      <div className="wt-add">
        <button className="btn" onClick={() => onAdd(full, 'watched')}><Icon name="check" size={18} /> Seen it</button>
        <button className="btn ghost" onClick={() => onAdd(full, 'watching')}>Watching</button>
        <button className="btn ghost" onClick={() => onAdd(full, 'want')}>Want to watch</button>
      </div>
    </Sheet>
  );
}

/* ---------- Your list ---------- */

function ListCard({ items, onOpen }) {
  const [status, setStatus] = useState('watched');
  const [filter, setFilter] = useState('');
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, items.filter((i) => i.status === s.id).length]));
  const shown = useMemo(() => sorted(items, status).filter((i) => matches(i, filter)), [items, status, filter]);

  if (!items.length) {
    return (
      <section className="card" aria-labelledby="wl-h">
        <div className="card-head"><h2 id="wl-h">My list</h2></div>
        <p className="empty">Nothing yet. Search above to add the last thing you watched.</p>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="wl-h">
      <div className="card-head">
        <h2 id="wl-h">My list</h2>
        <span className="meta">{plural(items.length, 'title')}</span>
      </div>
      <div className="seg wt-status" role="group" aria-label="Which list">
        {STATUSES.map((s) => (
          <button key={s.id} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
            {s.short}{counts[s.id] ? <span className="wt-count">{counts[s.id]}</span> : null}
          </button>
        ))}
      </div>
      {items.length > 8 && (
        <input className="input wt-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title, genre, actor or note" />
      )}
      {shown.length ? (
        <ul className="rows wt-list">
          {shown.map((i) => (
            <li key={i.id} className="row wt-row" onClick={() => onOpen(i.id)}>
              <Poster src={i.poster} title={i.title} size="sm" />
              <span className="row-title">
                <b>{i.title}</b>
                <span className="muted small">
                  {[typeLabel(i.type), i.year, status === 'watched' && i.watchedOn ? shortDate(i.watchedOn) : null].filter(Boolean).join(' · ')}
                </span>
                {i.notes && <span className="wt-snippet">{i.notes}</span>}
              </span>
              {i.rating ? <span className="wt-stars-sm" aria-label={`${i.rating} stars`}>{starsText(i.rating)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{filter ? 'Nothing matches that.' : status === 'want' ? 'Nothing saved for later.' : status === 'watching' ? 'Nothing in progress.' : 'Nothing watched yet.'}</p>
      )}
    </section>
  );
}

/* ---------- One saved title ---------- */

function EntrySheet({ id, onClose }) {
  const item = useRecord(id);
  const [notes, setNotes] = useState(() => (item && item.notes) || '');
  const saveTimer = useRef(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Fill in details (runtime, cast) once for titles saved before they were fetched.
  const ref = item && item.ref;
  const needsInfo = !!(item && item.ref && !item.people);
  useEffect(() => {
    if (!needsInfo) return;
    let live = true;
    fetchDetails(ref).then((d) => live && d && saveWatch(id, { ...d, people: d.people || [] }));
    return () => {
      live = false;
    };
  }, [id, ref, needsInfo]);

  // Notes save shortly after you stop typing, and right away when the sheet closes.
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (item && notesRef.current !== (item.notes || '')) saveWatch(id, { notes: notesRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item) return null;
  const onNotes = (v) => {
    setNotes(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveWatch(id, { notes: v }), 600);
  };
  const del = () => {
    const gone = removeWatch(id);
    onClose();
    toast(`Removed ${gone.title}`, { label: 'Undo', run: () => restoreWatch({ ...gone, notes: notesRef.current }) });
  };

  return (
    <Sheet title={item.title} onClose={onClose}>
      <TitleInfo item={item} />

      <div className="seg wt-status wide" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <button key={s.id} aria-pressed={item.status === s.id} onClick={() => { haptic('tick'); saveWatch(id, { status: s.id }); }}>{s.short}</button>
        ))}
      </div>

      <h3 className="jr-sub">Your rating</h3>
      <Stars value={item.rating} onChange={(r) => saveWatch(id, { rating: r })} />

      {item.status === 'watched' && (
        <label className="f wt-date">
          Watched on
          <input className="input" type="date" value={item.watchedOn || ''} max={todayISO()} onChange={(e) => saveWatch(id, { watchedOn: e.target.value || null })} />
        </label>
      )}

      <h3 className="jr-sub">Notes</h3>
      <textarea
        className="input wt-notes"
        rows={4}
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder={item.status === 'want' ? 'Who recommended it, where it’s streaming…' : 'What stuck with you? Favorite scene, who you watched with…'}
      />

      <button className="mini danger wt-remove" onClick={del}>Remove from list</button>
    </Sheet>
  );
}

/** Poster, year, length, genres, people and the summary. */
function TitleInfo({ item, loading = false }) {
  const len = lengthLabel(item);
  return (
    <div className="wt-info">
      <div className="wt-top">
        <Poster src={item.poster} title={item.title} />
        <div className="wt-facts">
          <p className="wt-kicker">{[typeLabel(item.type), item.year, len].filter(Boolean).join(' · ')}</p>
          {item.genres && item.genres.length > 0 && <p className="wt-genres">{item.genres.slice(0, 3).join(' · ')}</p>}
          {item.credit && <p className="muted small">{item.credit}</p>}
          {item.people && item.people.length > 0 && <p className="muted small">With {item.people.slice(0, 4).join(', ')}</p>}
          {loading && !item.people && <p className="muted small">Getting details…</p>}
        </div>
      </div>
      {item.overview && <p className="wt-overview">{item.overview}</p>}
      {item.source && <p className="wt-source">Info from {item.source}</p>}
    </div>
  );
}

function Poster({ src, title, size = 'lg' }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className={`wt-poster ${size}`} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className={`wt-poster ${size} blank`} aria-hidden="true">{(title || '?').trim().charAt(0).toUpperCase()}</span>
  );
}

/** Five stars in half steps. Tap the left side of a star for a half; tap your current rating to clear it. */
function Stars({ value, onChange }) {
  const pick = (n, e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const half = e.clientX && e.clientX - box.left < box.width / 2;
    const next = half ? n - 0.5 : n;
    haptic('tick');
    onChange(next === value ? null : next);
  };
  const v = value || 0;
  return (
    <div className="wt-stars" role="group" aria-label={value ? `Rated ${value} out of 5` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = v >= n ? 1 : v >= n - 0.5 ? 0.5 : 0;
        return (
          <button key={n} type="button" className="wt-star" onClick={(e) => pick(n, e)} aria-label={`${n} star${n === 1 ? '' : 's'}`} style={{ '--fill': `${fill * 100}%` }}>
            <span aria-hidden="true">★</span>
          </button>
        );
      })}
      <span className="wt-score">{value ? `${value}/5` : 'Tap to rate'}</span>
    </div>
  );
}

/* ---------- Stats ---------- */

function StatsCard({ stats, onOpen }) {
  const hours = Math.round(stats.minutes / 60);
  return (
    <section className="card" aria-labelledby="ws-h">
      <div className="card-head"><h2 id="ws-h">Stats</h2></div>
      <div className="wt-tiles">
        <div><b>{stats.movies}</b><span>movies</span></div>
        <div><b>{stats.shows}</b><span>shows</span></div>
        <div><b>{stats.avg ? stats.avg.toFixed(1) : '–'}</b><span>avg ★</span></div>
        {hours > 0 && <div><b>{hours}h</b><span>of movies</span></div>}
      </div>
      {stats.topGenres.length > 0 && <p className="muted small wt-top-genres">You watch the most {stats.topGenres.join(', ').toLowerCase()}.</p>}
      {stats.favorites.length > 0 && (
        <>
          <h3 className="jr-sub">Favorites</h3>
          <ul className="rows">
            {stats.favorites.map((i) => (
              <li key={i.id} className="row wt-row" onClick={() => onOpen(i.id)}>
                <span className="row-title"><b>{i.title}</b> <span className="muted small">{i.year}</span></span>
                <span className="wt-stars-sm">{starsText(i.rating)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
