// Apple Health keys. The key itself is shown once; only its SHA-256 hash is stored in Supabase.
import { supabase } from '../supabase.js';

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function getHealthKeyInfo() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('health_tokens')
    .select('created_at, last_used_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message.includes('health_tokens') ? 'The health_tokens table is missing. Run the SQL from the setup steps in Supabase.' : error.message);
  return data && data[0] ? data[0] : null;
}

/** Replaces any existing key with a new one and returns it (shown to you once). */
export async function createHealthKey() {
  const { data: u } = await supabase.auth.getUser();
  if (!u || !u.user) throw new Error('Sign in first.');
  const token = `lph_${toB64url(crypto.getRandomValues(new Uint8Array(24)))}`;
  const hash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  const del = await supabase.from('health_tokens').delete().eq('user_id', u.user.id);
  if (del.error) throw new Error(del.error.message);
  const ins = await supabase.from('health_tokens').insert({ token_hash: hash, user_id: u.user.id });
  if (ins.error) throw new Error(ins.error.message);
  return token;
}

export async function deleteHealthKey() {
  const { data: u } = await supabase.auth.getUser();
  if (!u || !u.user) return;
  await supabase.from('health_tokens').delete().eq('user_id', u.user.id);
}
