import { useSyncExternalStore } from 'react';

let current = null;
const listeners = new Set();
let timer;

export function toast(text) {
  current = { text, key: Date.now() };
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l());
  }, 1800);
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
}
