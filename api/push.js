// GET  /api/push                 → { publicKey } for subscribing on the phone
// POST /api/push { action: 'test' } with Authorization: Bearer <Supabase session token>
//      → sends a test notification to every device you've turned notifications on for.
import { createClient } from '@supabase/supabase-js';
import { sendTo } from './push-tick.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'Notifications aren’t set up on the server yet.' });

  if (req.method === 'GET') return res.status(200).json({ publicKey });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const db = createClient(SUPABASE_URL, SERVER_KEY, { auth: { persistSession: false } });
  const { data: who, error } = await db.auth.getUser(token);
  if (error || !who || !who.user) return res.status(401).json({ error: 'Sign in again, then try.' });

  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', who.user.id);
  if (!subs || !subs.length) return res.status(400).json({ error: 'No devices have notifications on yet.' });
  const sent = await sendTo(db, subs, {
    key: `test:${Date.now()}`,
    title: 'lifestyle+ notifications are on',
    body: 'You’ll get a heads-up before each block, a morning nudge and school reminders.',
    url: '/#plan',
  });
  res.status(200).json({ sent });
}
