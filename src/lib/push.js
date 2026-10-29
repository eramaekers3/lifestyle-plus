// Push notifications. On iPhone these only work once lifestyle+ is added to the Home Screen
// (iOS 16.4 or newer). Each device that turns them on is saved in Supabase, and the server
// (api/push-tick.js) sends block, morning and school reminders to it.
import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const toKey = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

async function registration() {
  if (!navigator.serviceWorker.controller) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

async function save(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_agent: navigator.userAgent.slice(0, 200),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(/push_subscriptions/.test(error.message)
      ? 'The database isn’t set up for notifications yet. Run supabase/push.sql in Supabase.'
      : error.message);
  }
}

/** Asks permission, subscribes this device and saves it. Must be called from a tap. */
export async function enablePush() {
  if (!supabase) throw new Error('Sign in first so your reminders can reach this phone.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in first so your reminders can reach this phone.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Turn them on in iPhone Settings → Notifications → lifestyle+.');
  const res = await fetch('/api/push');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Couldn’t reach the notification server.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(body.publicKey) });
  await save(sub);
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush() {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session && data.session.access_token}` },
    body: JSON.stringify({ action: 'test' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'The test didn’t send.');
}

/** 'unsupported' | 'install' | 'blocked' | 'off' | 'on' (null while checking) */
export function usePushState() {
  const [state, setState] = useState(null);
  const refresh = async () => {
    if (!pushSupported()) return setState(isIOS() && !isInstalled() ? 'install' : 'unsupported');
    if (Notification.permission === 'denied') return setState('blocked');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    } catch {
      setState('off');
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  return [state, refresh];
}

/** Keeps this device's time zone current on the server (e.g. after travel). Mount once. */
export function usePushKeepAlive(signedIn) {
  useEffect(() => {
    if (!signedIn || !pushSupported() || Notification.permission !== 'granted') return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg && reg.pushManager.getSubscription())
      .then((sub) => sub && save(sub))
      .catch(() => {});
  }, [signedIn]);
}
