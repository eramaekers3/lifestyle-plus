// Deep work sessions: one running session at a time (synced, so it shows on every device),
// and a log of finished sessions for "deep today" totals.
import { useEffect, useMemo } from 'react';
import { put, remove, useKind, useRecord } from '../store.js';
import { idFor } from './ids.js';
import { nowMin, todayISO } from './dates.js';

export const DEEP_ID = idFor('deep-session');
export const useDeep = () => useRecord(DEEP_ID);

/** Start a session. plannedMin is optional; without it the clock just counts up. */
export function startDeep({ taskId = '', title = '', plannedMin = null, blockId = '' } = {}) {
  put('deep', { id: DEEP_ID, startedAt: Date.now(), date: todayISO(), taskId, title, plannedMin, blockId });
}

/** Change what the running session is on, or how long it's planned for. */
export function updateDeep(s, changes) {
  put('deep', { ...s, ...changes });
}

/** End the session and log it (sessions under a minute aren't worth keeping). Returns minutes. */
export function endDeep(s) {
  const endedAt = Date.now();
  const minutes = Math.round((endedAt - s.startedAt) / 60000);
  if (minutes >= 1) {
    put('deep_log', { date: s.date || todayISO(), startedAt: s.startedAt, endedAt, minutes, taskId: s.taskId || '', title: s.title || '' });
  }
  remove(DEEP_ID);
  return minutes;
}

/** Minutes of deep work logged on a day. */
export function useDeepMinutes(date) {
  const logs = useKind('deep_log');
  return useMemo(() => logs.filter((l) => l.date === date).reduce((a, l) => a + (l.minutes || 0), 0), [logs, date]);
}

/**
 * What a session would be on if you started now: the deep block you're in (for the rest of it),
 * else the top Now task (for its time estimate), else an open session.
 */
export function suggestDeep(blocks, active, tasksById) {
  const now = nowMin();
  const cur = blocks.find((b) => b.type === 'deep' && b.start <= now && b.end > now);
  if (cur) {
    const t = cur.taskId && tasksById[cur.taskId];
    return { taskId: t && t.status !== 'done' ? t.id : '', title: cur.title || (t ? t.title : ''), plannedMin: cur.end - now, blockId: cur.id };
  }
  const t = active[0];
  if (t) return { taskId: t.id, title: t.title, plannedMin: t.estimate || null, blockId: '' };
  return { taskId: '', title: '', plannedMin: null, blockId: '' };
}

/** Keeps the screen awake while a session runs, so the clock stays in view. */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock = null;
    let gone = false;
    const grab = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => (gone ? l.release() : (lock = l)))
        .catch(() => {});
    };
    grab();
    document.addEventListener('visibilitychange', grab);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', grab);
      if (lock) lock.release().catch(() => {});
    };
  }, [on]);
}

/** mm:ss, or h:mm:ss past an hour. */
export function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
