// Accent color and heading font, chosen in Settings and synced with your other settings.
import { useEffect } from 'react';
import { useSettings } from '../store.js';

export const ACCENTS = [
  { id: 'sunflower', name: 'Sunflower', hex: '#ffcf5c' },
  { id: 'tangerine', name: 'Tangerine', hex: '#ff9f4a' },
  { id: 'coral', name: 'Coral', hex: '#ff8f7a' },
  { id: 'rose', name: 'Rose', hex: '#ff86b8' },
  { id: 'lilac', name: 'Lilac', hex: '#bba9ff' },
  { id: 'sky', name: 'Sky', hex: '#7cc4ff' },
  { id: 'mint', name: 'Mint', hex: '#7fdca0' },
];

export const FONTS = [
  { id: 'bricolage', name: 'Bricolage Grotesque', family: "'Bricolage Grotesque'", query: 'Bricolage+Grotesque:opsz,wght@12..96,800', weight: 800, tracking: '-0.045em' },
  { id: 'fraunces', name: 'Fraunces', family: "'Fraunces'", query: 'Fraunces:opsz,wght@9..144,700', weight: 700, tracking: '-0.03em' },
  { id: 'syne', name: 'Syne', family: "'Syne'", query: 'Syne:wght@800', weight: 800, tracking: '-0.035em' },
  { id: 'unbounded', name: 'Unbounded', family: "'Unbounded'", query: 'Unbounded:wght@700', weight: 700, tracking: '-0.045em' },
  { id: 'instrument', name: 'Instrument Serif', family: "'Instrument Serif'", query: 'Instrument+Serif', weight: 400, tracking: '-0.015em' },
  { id: 'outfit', name: 'Outfit', family: "'Outfit'", query: 'Outfit:wght@800', weight: 800, tracking: '-0.04em' },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

function loadFonts(list, key) {
  if (document.getElementById(key)) return;
  const link = document.createElement('link');
  link.id = key;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${list.map((f) => `family=${f.query}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

/** Loads every heading font, for previews in Settings. */
export const loadAllFonts = () => loadFonts(FONTS, 'font-all');

/* ---------- Color math ---------- */
const toRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function accentTokens(hex) {
  const rgb = toRgb(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex) ? hex : ACCENTS[0].hex);
  const light = luminance(rgb) > 0.4;
  return {
    accent: toHex(rgb),
    edge: toHex(rgb.map((v) => v * 0.72)), // the pressed-button lip under accent buttons
    ink: light ? toHex(rgb.map((v) => v * 0.17)) : '#ffffff', // readable text on the accent
  };
}

/** Applies the chosen accent and heading font to the page. Mount once. */
export function useTheme() {
  const { accent, headingFont } = useSettings();
  useEffect(() => {
    const t = accentTokens(accent || ACCENTS[0].hex);
    const root = document.documentElement.style;
    root.setProperty('--sun', t.accent);
    root.setProperty('--sun-edge', t.edge);
    root.setProperty('--sun-ink', t.ink);
  }, [accent]);
  useEffect(() => {
    const f = fontById(headingFont);
    if (f.id !== 'bricolage') loadFonts([f], `font-${f.id}`);
    const root = document.documentElement.style;
    root.setProperty('--display', `${f.family}, 'Avenir Next', system-ui, sans-serif`);
    root.setProperty('--display-weight', String(f.weight));
    root.setProperty('--display-tracking', f.tracking);
  }, [headingFont]);
}
