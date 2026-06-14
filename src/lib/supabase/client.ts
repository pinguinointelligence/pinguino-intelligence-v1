/**
 * Supabase browser client (Phase 2A) — the ONLY module that imports
 * `@supabase/supabase-js` or reads the Supabase env.
 *
 * Public anon key only (these values ship in the bundle). The privileged
 * server-side key is NEVER used here or anywhere in the frontend. If the env vars
 * are absent the client is `null` and the app degrades gracefully (auth reports as
 * unavailable); the demo and Advanced Studio keep working.
 *
 * Everything else reaches Supabase through `src/services/**` — UI/stores/features
 * never import this module or `@supabase/supabase-js` directly.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both public env vars are present. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

/** The shared client, or `null` when the env is not configured. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
