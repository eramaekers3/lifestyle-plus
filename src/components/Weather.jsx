import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Sheet } from './ui.jsx';
import { fmt, todayISO, addDays } from '../lib/dates.js';
import { toast } from '../lib/toast.js';
import {
  useWeather, refreshWeather, setWeatherPlace, searchPlaces, locateMe,
  condition, compass, deg, hourLabel, clockLabel, inches,
} from '../lib/weather.js';

// Icon colors by look, so the chip reads at a glance.
const TINT = {
  'w-sun': 'var(--sun)', 'w-moon': 'var(--lilac)', 'w-partly': 'var(--sun)', 'w-partly-night': 'var(--lilac)',
  'w-cloud': 'var(--muted)', 'w-fog': 'var(--muted)', 'w-drizzle': 'var(--sky)', 'w-rain': 'var(--sky)',
  'w-sleet': 'var(--sky)', 'w-snow': '#e6f2ff', 'w-storm': 'var(--lilac)',
};
function WxIcon({ code, isDay = true, size = 22 }) {
  const { icon } = condition(code, isDay);
  return (
    <span className="wx-ic" style={{ color: TINT[icon] }}>
      <Icon name={icon} size={size} />
    </span>
  );
}

const dayName = (d) => (d === todayISO() ? 'Today' : d === addDays(todayISO(), 1) ? 'Tomorrow' : fmt(d, { weekday: 'short' }));

/** The weather on the day screen: now for today, the forecast for a coming day. Tap it for the full forecast. */
export function WeatherChip({ date }) {
  const { place, data, error } = useWeather();
  const [open, setOpen] = useState(false);
  const isToday = date === todayISO();
  const day = data && data.days.find((d) => d.date === date);

  // Days past the forecast (or in the past) show nothing.
  if (place && data && !day) return null;
  if (!place && !isToday) return null;

  let body;
  if (!place) {
    body = (
      <>
        <span className="wx-ic" style={{ color: 'var(--sky)' }}><Icon name="w-partly" size={26} /></span>
        <span className="wx-mid">
          <b>Add the weather</b>
          <span>Hourly and 10-day forecast, right here.</span>
        </span>
      </>
    );
  } else if (!data) {
    body = (
      <>
        <span className="wx-ic" style={{ color: 'var(--muted)' }}><Icon name="w-cloud" size={26} /></span>
        <span className="wx-mid">
          <b>{error ? 'Weather unavailable' : 'Loading weather…'}</b>
          <span>{place.name}</span>
        </span>
      </>
    );
  } else {
    const temp = isToday ? data.now.temp : day.hi;
    const code = isToday ? data.now.code : day.code;
    const { label } = condition(code, isToday ? data.now.isDay : true);
    body = (
      <>
        <WxIcon code={code} isDay={isToday ? data.now.isDay : true} size={28} />
        <span className="wx-temp">{deg(temp)}</span>
        <span className="wx-mid">
          <b>{label}</b>
          <span>H {deg(day.hi)} · L {deg(day.lo)}{isToday ? ` · Feels ${deg(data.now.feels)}` : ''}</span>
        </span>
        {day.pop >= 10 && (
          <span className="wx-pop" aria-label={`${day.pop}% chance of precipitation`}>
            <Icon name="drop" size={14} />{day.pop}%
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <button className="wx-chip" onClick={() => setOpen(true)} aria-label={place ? `Weather for ${dayName(date).toLowerCase()}. Open the forecast` : 'Add the weather'}>
        {body}
        <Icon name="right" />
      </button>
      {open && <WeatherSheet start={date} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---------- Full forecast ---------- */

export function WeatherSheet({ start, onClose }) {
  const { place, data, fetchedAt, error, loading } = useWeather();
  const [picking, setPicking] = useState(!place);
  const [sel, setSel] = useState(start || todayISO());

  // Make sure it's fresh while you look at it.
  useEffect(() => {
    if (place) refreshWeather(place);
  }, [place]);

  if (picking || !place) {
    return (
      <Sheet title="Weather" onClose={onClose}>
        <PlacePicker
          current={place}
          onPicked={() => setPicking(false)}
          onCancel={place ? () => setPicking(false) : null}
        />
      </Sheet>
    );
  }

  const day = data && (data.days.find((d) => d.date === sel) || data.days[0]);
  const isToday = day && day.date === data.days[0].date;

  return (
    <Sheet title="Weather" onClose={onClose}>
      <div className="wx-place">
        <Icon name="pin" size={16} />
        <span>{place.name}{place.region ? <span className="muted">, {place.region}</span> : null}</span>
        <button className="mini" onClick={() => setPicking(true)}>Change</button>
      </div>

      {!data ? (
        <p className="empty">{error ? `${error}. Check your connection and try again.` : 'Loading the forecast…'}</p>
      ) : (
        <>
          <WxHero data={data} day={day} isToday={isToday} />
          <Hourly data={data} day={day} isToday={isToday} />
          <Daily data={data} sel={day.date} onPick={setSel} />
          <Details data={data} day={day} isToday={isToday} />
          <p className="wx-foot">
            {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
            {' · '}Forecast by Open-Meteo
            <button className="mini" disabled={loading} onClick={() => refreshWeather(place, { force: true })}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </p>
        </>
      )}
    </Sheet>
  );
}

function WxHero({ data, day, isToday }) {
  const code = isToday ? data.now.code : day.code;
  const isDay = isToday ? data.now.isDay : true;
  return (
    <div className="wx-hero" key={day.date}>
      <WxIcon code={code} isDay={isDay} size={54} />
      <div>
        <div className="label">{isToday ? 'Right now' : fmt(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
        <div className="wx-big">{deg(isToday ? data.now.temp : day.hi)}</div>
        <div className="wx-cond">{condition(code, isDay).label}</div>
        <div className="label">
          H {deg(day.hi)} · L {deg(day.lo)}
          {isToday && ` · Feels like ${deg(data.now.feels)}`}
        </div>
      </div>
    </div>
  );
}

/** Today: the next 24 hours from now. Another day: that day's hours. */
function Hourly({ data, day, isToday }) {
  const rows = useMemo(() => {
    if (isToday) {
      const nowHour = data.now.time.slice(0, 13);
      const i = Math.max(0, data.hours.findIndex((h) => h.time.slice(0, 13) >= nowHour));
      return data.hours.slice(i, i + 25);
    }
    return data.hours.filter((h) => h.date === day.date);
  }, [data, day, isToday]);
  const strip = useRef(null);
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = isToday ? 0 : 6 * 52; // other days open at 6am
  }, [day.date, isToday]);

  // A smooth temperature line across the columns.
  const COL = 52;
  const temps = rows.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const y = (t) => 34 - (hi === lo ? 0.5 : (t - lo) / (hi - lo)) * 26;
  const pts = rows.map((h, i) => [i * COL + COL / 2, y(h.temp)]);
  const line = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');

  return (
    <section className="wx-sec" aria-label="Hourly forecast">
      <h3>{isToday ? 'Next 24 hours' : `${dayName(day.date)}, hour by hour`}</h3>
      <div className="wx-hours" ref={strip}>
        <div className="wx-hours-in" style={{ width: rows.length * COL }}>
          <svg className="wx-line" width={rows.length * COL} height="40" aria-hidden="true">
            <path d={line} />
            {pts.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r="2.4" />)}
          </svg>
          {rows.map((h, i) => (
              <div className="wx-hour" key={h.time}>
                <span className="wx-t">{deg(h.temp)}</span>
                <WxIcon code={h.code} isDay={h.isDay} size={22} />
                <span className={`wx-p${h.pop >= 20 ? ' wet' : ''}`}>{h.pop ? `${h.pop}%` : ''}</span>
                <span className="wx-bar" aria-hidden="true"><i style={{ height: `${h.pop || 0}%` }} /></span>
                <span className="wx-h">{isToday && i === 0 ? 'Now' : hourLabel(h.hour)}</span>
              </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Daily({ data, sel, onPick }) {
  const lo = Math.min(...data.days.map((d) => d.lo));
  const hi = Math.max(...data.days.map((d) => d.hi));
  const pct = (t) => ((t - lo) / (hi - lo || 1)) * 100;
  return (
    <section className="wx-sec" aria-label="10-day forecast">
      <h3>10 days</h3>
      <ul className="wx-days">
        {data.days.map((d) => (
          <li key={d.date}>
            <button aria-pressed={d.date === sel} onClick={() => onPick(d.date)}>
              <span className="wx-dn">{d.date === data.days[0].date ? 'Today' : fmt(d.date, { weekday: 'short' })}</span>
              <WxIcon code={d.code} size={22} />
              <span className={`wx-p${d.pop >= 20 ? ' wet' : ''}`}>{d.pop >= 10 ? `${d.pop}%` : ''}</span>
              <span className="wx-lo">{deg(d.lo)}</span>
              <span className="wx-range" aria-hidden="true">
                <i style={{ left: `${pct(d.lo)}%`, right: `${100 - pct(d.hi)}%` }} />
              </span>
              <span className="wx-hi">{deg(d.hi)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="sl-tap">Tap a day to see its hours.</p>
    </section>
  );
}

function Details({ data, day, isToday }) {
  const items = [
    isToday && { icon: 'drop', k: 'Humidity', v: `${data.now.humidity}%` },
    { icon: 'w-rain', k: 'Precipitation', v: day.pop || day.precip ? `${day.pop}% · ${inches(day.precip)}` : 'None expected', sub: day.snow ? `${day.snow.toFixed(1)}" snow` : null },
    isToday
      ? { icon: 'wind', k: 'Wind', v: `${Math.round(data.now.wind)} mph ${compass(data.now.windDir)}`, sub: `Gusts to ${Math.round(day.gust)}` }
      : { icon: 'wind', k: 'Wind', v: `Up to ${Math.round(day.wind)} mph`, sub: `Gusts to ${Math.round(day.gust)}` },
    { icon: 'w-sun', k: 'UV index', v: day.uv == null ? '–' : `${Math.round(day.uv)}`, sub: uvWord(day.uv) },
    { icon: 'sun', k: 'Sunrise', v: clockLabel(day.sunrise) },
    { icon: 'moon', k: 'Sunset', v: clockLabel(day.sunset) },
  ].filter(Boolean);
  return (
    <section className="wx-sec" aria-label="Details">
      <h3>{isToday ? 'Today' : dayName(day.date)} in detail</h3>
      <div className="wx-grid">
        {items.map((it) => (
          <div className="wx-cell" key={it.k}>
            <span className="label"><Icon name={it.icon} size={14} /> {it.k}</span>
            <b>{it.v}</b>
            {it.sub && <span className="muted small">{it.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

const uvWord = (uv) => (uv == null ? '' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme');

/* ---------- Choosing where ---------- */

function PlacePicker({ current, onPicked, onCancel }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = (p) => {
    setWeatherPlace(p);
    onPicked();
  };
  const useHere = async () => {
    setBusy(true);
    try {
      pick(await locateMe());
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const search = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      setResults(await searchPlaces(text));
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wx-picker">
      <p className="sheet-sub">
        {current ? `Showing weather for ${current.name}.` : 'Where should the forecast be for?'} It syncs to your other devices.
      </p>
      <button className="btn wide" onClick={useHere} disabled={busy} style={{ marginTop: 0 }}>
        <Icon name="pin" size={18} /> Use my location
      </button>
      <form className="inline" onSubmit={search} style={{ marginTop: 14 }}>
        <input className="input" style={{ flex: 1 }} placeholder="Or search a city (e.g. Lincoln)" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search" />
        <button className="mini sun" disabled={busy || !text.trim()}>Search</button>
      </form>
      {results && (
        results.length ? (
          <ul className="wx-results">
            {results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button onClick={() => pick(p)}>
                  <b>{p.name}</b>
                  <span className="muted">{p.region}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No places found.</p>
        )
      )}
      {onCancel && <button className="link" onClick={onCancel} style={{ border: 0, background: 'none', padding: 0 }}>Keep {current.name}</button>}
    </div>
  );
}
