import { useSyncExternalStore } from 'react';

let current = null;
const listeners = new Set();
let timer;

/** action: optional { label, run } shown as a button (e.g. Undo); the toast then stays a little longer. */
export function toast(text, action = null) {
  current = { text, action, key: Date.now() };
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(dismissToast, action ? 4000 : 1800);
}

export function dismissToast() {
  clearTimeout(timer);
  current = null;
  listeners.forEach((l) => l());
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
