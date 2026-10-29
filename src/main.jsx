import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { isEmpty, initSync } from './store.js';
import { seed } from './seed.js';

// First run on this device: show example data so every screen has something in it.
if (isEmpty()) seed();
initSync();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.PROD && !import.meta.env.VITE_NO_SW && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
