// POST /api/push-tick
// Called once a minute by a Supabase cron job (see supabase/push.sql). Works out which
// notifications are due for each person with notifications turned on, and sends them.
//   Header: Authorization: Bearer <CRON_SECRET>
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { dueNotifications, needsSchool } from './_push-core.js';
import { readCalendar } from './_calendar-core.js';
import { toItem, localParts } from '../src/lib/school.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET } = process.env;
const SUBJECT = process.env.VAPID_SUBJECT || 'https://lifestyle-plus.vercel.app';

export async function sendTo(db, subs, note) {
  webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title: note.title, body: note.body, url: note.url || '/', tag: note.key });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: 'high' });
      sent++;
    } catch (e) {
      // 404/410: the phone dropped this subscription (app deleted or notifications turned off).
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.log('push failed', e.statusCode || e.message);
    }
  }
  return sent;
}

async function forUser(db, userId, subs, now) {
  const tz = subs[0].tz || 'America/Chicago';
  const { date } = localParts(now, tz);

  const [{ data: settingsRows }, { data: blockRows }, { data: dayRows }] = await Promise.all([
    db.from('records').select('data').eq('user_id', userId).eq('kind', 'settings').eq('deleted', false).limit(1),
    db.from('records').select('data').eq('user_id', userId).eq('kind', 'block').eq('deleted', false).eq('data->>date', date),
    db.from('records').select('data').eq('user_id', userId).eq('kind', 'day').eq('deleted', false).eq('data->>date', date),
  ]);
  const settings = (settingsRows && settingsRows[0] && settingsRows[0].data) || {};
  const blocks = (blockRows || []).map((r) => r.data);
  const started = (dayRows || []).some((r) => r.data && r.data.startedAt);
  const shutDown = (dayRows || []).some((r) => r.data && r.data.shutdownAt);

  // Sundays: has next week been reviewed yet?
  let reviewed = true;
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) {
    const { data: weekRows } = await db.from('records').select('data').eq('user_id', userId).eq('kind', 'week').eq('deleted', false).eq('data->>week', addDays(date, 1));
    reviewed = (weekRows || []).some((r) => r.data && r.data.reviewedAt);
  }

  const taskIds = [...new Set(blocks.map((b) => b.taskId).filter(Boolean))];
  let tasksById = {};
  if (taskIds.length) {
    const { data } = await db.from('records').select('id, data').eq('user_id', userId).in('id', taskIds);
    tasksById = Object.fromEntries((data || []).map((r) => [r.id, r.data]));
  }

  let school = null;
  if (needsSchool(now, tz, settings)) {
    try {
      const feed = await readCalendar({ url: settings.canvas.url, source: 'canvas', from: date, to: addDays(date, 3) });
      const { data: doneRows } = await db.from('records').select('data').eq('user_id', userId).eq('kind', 'schooldone').eq('deleted', false);
      const recs = new Map((doneRows || []).map((r) => [r.data.uid, r.data]));
      const since = settings.canvas.since;
      school = feed.events
        .map((e) => toItem(e, tz))
        .filter(Boolean)
        .map((i) => {
          const rec = recs.get(i.id);
          return { ...i, done: rec ? rec.done !== false : !!since && i.date < since };
        });
    } catch (e) {
      console.log('canvas feed failed', e.message);
    }
  }

  const notes = dueNotifications({ now, tz, settings, blocks, tasksById, started, school, shutDown, reviewed });
  let sent = 0;
  for (const note of notes) {
    // Claim the key first; if it's already there, this one went out on an earlier tick.
    const { error } = await db.from('push_log').insert({ user_id: userId, key: note.key });
    if (error) continue;
    sent += await sendTo(db, subs, note);
  }
  return sent;
}

function addDays(s, n) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Not allowed.' });
  if (!SUPABASE_URL || !SERVER_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'The server is missing its Supabase or push keys.' });
  }
  const db = createClient(SUPABASE_URL, SERVER_KEY, { auth: { persistSession: false } });
  const now = new Date();

  const { data: subs, error } = await db.from('push_subscriptions').select('user_id, endpoint, p256dh, auth, tz, updated_at').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Couldn’t read subscriptions. Is the push_subscriptions table set up?' });

  const byUser = new Map();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  let sent = 0;
  for (const [userId, list] of byUser) {
    try {
      sent += await forUser(db, userId, list, now);
    } catch (e) {
      console.log('push tick failed for a user', e.message);
    }
  }

  // Keep the send log short.
  if (now.getUTCMinutes() === 0) await db.from('push_log').delete().lt('sent_at', new Date(Date.now() - 3 * 864e5).toISOString());

  res.status(200).json({ users: byUser.size, sent });
}
