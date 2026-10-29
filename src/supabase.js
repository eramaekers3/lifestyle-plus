import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// With no keys, the app runs in local-only mode.
export const supabase =
  url && key && !url.includes('your-project-id')
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
