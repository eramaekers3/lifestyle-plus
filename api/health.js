// POST /api/health
// Receives Apple Health numbers from your iPhone Shortcut and saves them to your account.
//   Header:  Authorization: Bearer <your lifestyle+ health key>
//   Body:    { "lines": "steps|...\nweight|...\n..." }   (see api/_health-core.js for the line format)
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseHealthLines, toRecords } from './_health-core.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!SUPABASE_URL || !SERVER_KEY) {
    return res.status(500).json({ error: 'The server is missing its Supabase keys.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    console.log('health upload rejected: no key');
    return res.status(401).json({ error: 'Missing your lifestyle+ health key.' });
  }

  const db = createClient(SUPABASE_URL, SERVER_KEY, { auth: { persistSession: false } });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: keyRow, error: keyErr } = await db
    .from('health_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (keyErr) return res.status(500).json({ error: 'Couldn’t check the key. Is the health_tokens table set up?' });
  if (!keyRow) return res.status(401).json({ error: 'That health key isn’t valid. Create a new one in lifestyle+ Settings.' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = { lines: body };
    }
  }
  const text = Array.isArray(body && body.lines) ? body.lines.join('\n') : (body && body.lines) || '';
  const parsed = parseHealthLines(text);
  // Shows up in Vercel's runtime logs, to help debug the Shortcut. No health values are logged.
  console.log('health upload', JSON.stringify({ bytes: text.length, received: parsed.counts }));

  // Keep fields already saved for a day (e.g. steps) when only sleep arrives, and vice versa.
  const healthIds = toRecords(parsed).filter((r) => r.kind === 'health').map((r) => r.id);
  const existing = {};
  if (healthIds.length) {
    const { data } = await db.from('records').select('id, data').eq('user_id', keyRow.user_id).in('id', healthIds);
    for (const r of data || []) existing[r.id] = r.data;
  }

  const rows = toRecords(parsed, existing).map((r) => ({ ...r, user_id: keyRow.user_id }));
  const { error } = await db.from('records').upsert(rows);
  if (error) return res.status(500).json({ error: `Saving failed: ${error.message}` });

  await db.from('health_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', tokenHash);

  const c = parsed.counts;
  return res.status(200).json({
    ok: true,
    message: `Saved ${Object.keys(parsed.days).length} days, ${Object.keys(parsed.weights).length} weigh-ins and ${parsed.workouts.length} workouts.`,
    received: c,
  });
}
