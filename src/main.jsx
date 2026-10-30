import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { isEmpty, initSync } from './store.js';
import { seed } from './seed.js';
import { installTapHaptics } from './lib/haptics.js';

// First run on this device: show example data so every screen has something in it.
if (isEmpty()) seed();
initSync();
installTapHaptics();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The app has drawn its first screen: let the loading screen go.
requestAnimationFrame(() => requestAnimationFrame(() => window.__hideSplash && window.__hideSplash()));

if (import.meta.env.PROD && !import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
