// Shared setup for the server routes in api/.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

/** True when the server has its Supabase keys. */
export const hasDb = () => !!(SUPABASE_URL && SERVER_KEY);

/** Supabase with the server key (skips row level security, so only use it after checking who's asking). */
export const serverDb = () => createClient(SUPABASE_URL, SERVER_KEY, { auth: { persistSession: false } });

/** The token from an `Authorization: Bearer …` header, or ''. */
export const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

/** The signed-in user for a Supabase session token, or null. */
export async function userFor(db, token) {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return (!error && data && data.user) || null;
}

/**
 * The user for a lifestyle+ key (made in Settings → Apple Health; also used by the Siri Shortcut).
 * Only a hash of each key is stored. Returns { userId, tokenHash } or { error }.
 */
export async function userForKey(db, token) {
  if (!token) return { error: 'Missing your lifestyle+ key.' };
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await db.from('health_tokens').select('user_id').eq('token_hash', tokenHash).maybeSingle();
  if (error) return { error: 'Couldn’t check the key. Is the health_tokens table set up?' };
  if (!data) return { error: 'That key isn’t valid. Make a new one in lifestyle+ Settings → Apple Health.' };
  return { userId: data.user_id, tokenHash };
}

/* ---------- Push notifications ---------- */

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const SUBJECT = process.env.VAPID_SUBJECT || 'https://lifestyle-plus.vercel.app';
export const hasPushKeys = () => !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

/** Sends one notification to each device at once. Returns how many went through. */
export async function sendTo(db, subs, note) {
  webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title: note.title, body: note.body, url: note.url || '/', tag: note.key });
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: 'high' });
        return 1;
      } catch (e) {
        // 404/410: the phone dropped this subscription (app deleted or notifications turned off).
        if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else console.log('push failed', e.statusCode || e.message);
        return 0;
      }
    })
  );
  return results.reduce((a, b) => a + b, 0);
}
