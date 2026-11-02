// Weather from Open-Meteo (free, no key, works straight from the browser).
// The place lives in settings so it syncs between devices. The last forecast is cached on this
// device so the weather still shows offline and the home screen never waits on the network.
import { useEffect, useSyncExternalStore } from 'react';
import { useSettings, saveSettings } from '../store.js';

const KEY = 'lifestyleplus.weather.v1';
const REFRESH_MS = 30 * 60 * 1000;

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// { key, data, fetchedAt, error, loading }
let state = load();
const listeners = new Set();
function set(changes) {
  state = { ...state, ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify({ key: state.key, data: state.data, fetchedAt: state.fetchedAt }));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

const placeKey = (p) => (p ? `${p.lat.toFixed(3)},${p.lon.toFixed(3)}` : '');

/* ---------- Conditions ----------
   WMO weather codes, folded into the handful of looks we draw. */
export function condition(code, isDay = true) {
  const c = Number(code);
  if (c === 0) return { label: isDay ? 'Clear' : 'Clear', icon: isDay ? 'w-sun' : 'w-moon' };
  if (c === 1) return { label: 'Mostly clear', icon: isDay ? 'w-sun' : 'w-moon' };
  if (c === 2) return { label: 'Partly cloudy', icon: isDay ? 'w-partly' : 'w-partly-night' };
  if (c === 3) return { label: 'Cloudy', icon: 'w-cloud' };
  if (c === 45 || c === 48) return { label: 'Fog', icon: 'w-fog' };
  if (c >= 51 && c <= 57) return { label: c >= 56 ? 'Freezing drizzle' : 'Drizzle', icon: 'w-drizzle' };
  if (c === 61) return { label: 'Light rain', icon: 'w-rain' };
  if (c === 63) return { label: 'Rain', icon: 'w-rain' };
  if (c === 65) return { label: 'Heavy rain', icon: 'w-rain' };
  if (c === 66 || c === 67) return { label: 'Freezing rain', icon: 'w-sleet' };
  if (c === 71) return { label: 'Light snow', icon: 'w-snow' };
  if (c === 73) return { label: 'Snow', icon: 'w-snow' };
  if (c === 75) return { label: 'Heavy snow', icon: 'w-snow' };
  if (c === 77) return { label: 'Snow grains', icon: 'w-snow' };
  if (c >= 80 && c <= 82) return { label: c === 82 ? 'Heavy showers' : 'Showers', icon: 'w-rain' };
  if (c === 85 || c === 86) return { label: 'Snow showers', icon: 'w-snow' };
  if (c >= 95) return { label: c === 95 ? 'Thunderstorms' : 'Storms with hail', icon: 'w-storm' };
  return { label: '—', icon: 'w-cloud' };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 45) % 8]);

/* ---------- Fetching ---------- */

/** Turns Open-Meteo's column arrays into rows that are easy to render. */
function shape(j) {
  const h = j.hourly;
  const hours = h.time.map((t, i) => ({
    time: t, // local time at the place, "2026-11-02T14:00"
    date: t.slice(0, 10),
    hour: Number(t.slice(11, 13)),
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    pop: h.precipitation_probability[i],
    precip: h.precipitation[i],
    code: h.weather_code[i],
    isDay: !!h.is_day[i],
    wind: h.wind_speed_10m[i],
  }));
  const d = j.daily;
  const days = d.time.map((t, i) => ({
    date: t,
    code: d.weather_code[i],
    hi: d.temperature_2m_max[i],
    lo: d.temperature_2m_min[i],
    pop: d.precipitation_probability_max[i],
    precip: d.precipitation_sum[i],
    snow: d.snowfall_sum[i],
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
    wind: d.wind_speed_10m_max[i],
    gust: d.wind_gusts_10m_max[i],
    uv: d.uv_index_max[i],
  }));
  const c = j.current;
  return {
    now: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      code: c.weather_code,
      isDay: !!c.is_day,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      precip: c.precipitation,
    },
    hours,
    days,
  };
}

let inflight = null;
export function refreshWeather(place, { force = false } = {}) {
  if (!place) return Promise.resolve();
  const key = placeKey(place);
  if (!force && state.key === key && state.fetchedAt && Date.now() - state.fetchedAt < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  const q = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,sunrise,sunset,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '10',
  });
  set({ loading: true });
  inflight = fetch(`${FORECAST}?${q}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Weather service said ${r.status}`);
      return r.json();
    })
    .then((j) => set({ key, data: shape(j), fetchedAt: Date.now(), error: null, loading: false }))
    .catch((e) => set({ error: e.message || 'Couldn’t load the weather', loading: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The saved place and its forecast, refreshed every half hour and whenever the app comes back. */
export function useWeather() {
  const { weatherPlace: place } = useSettings();
  const s = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (!place) return;
    refreshWeather(place);
    const onShow = () => document.visibilityState === 'visible' && refreshWeather(place);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', onShow);
    const t = setInterval(() => refreshWeather(place), REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('online', onShow);
      clearInterval(t);
    };
  }, [place]);
  const fresh = place && s.key === placeKey(place);
  return { place, data: fresh ? s.data : null, fetchedAt: fresh ? s.fetchedAt : null, error: s.error, loading: !!s.loading };
}

/* ---------- Choosing a place ---------- */

export function setWeatherPlace(place) {
  saveSettings({ weatherPlace: place });
  return refreshWeather(place, { force: true });
}

export async function searchPlaces(text) {
  const q = new URLSearchParams({ name: text.trim(), count: '6', language: 'en', format: 'json' });
  const r = await fetch(`${GEOCODE}?${q}`);
  if (!r.ok) throw new Error('Couldn’t search places');
  const j = await r.json();
  return (j.results || []).map((p) => ({
    name: p.name,
    region: [p.admin1, p.country_code === 'US' ? null : p.country].filter(Boolean).join(', '),
    lat: p.latitude,
    lon: p.longitude,
  }));
}

/** Uses the phone's location (rounded to about a block; it's only sent to the weather service). */
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location isn’t available here'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lon = Math.round(pos.coords.longitude * 1000) / 1000;
        resolve({ name: 'My location', lat, lon, here: true });
      },
      (e) => reject(new Error(e.code === 1 ? 'Location is turned off for lifestyle+. Search for your city instead.' : 'Couldn’t find your location')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 }
    );
  });
}

/* ---------- Formatting ---------- */
export const deg = (n) => (n == null ? '–' : `${Math.round(n)}°`);
export const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
export const clockLabel = (t) => {
  if (!t) return '';
  const h = Number(t.slice(11, 13));
  const m = t.slice(14, 16);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
};
export const inches = (n) => (!n ? '0"' : n < 0.01 ? '<0.01"' : `${n.toFixed(2)}"`);
