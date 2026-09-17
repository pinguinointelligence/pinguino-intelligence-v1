import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { BUCKET, JSON_HEADERS } from './protocol.ts';
import { handleCleanupRequest } from './worker.ts';

/**
 * share-photo-cleanup — deletes share photos that nothing uses any more.
 *
 * Called by pg_cron through `gellatti_share_photo_cleanup_tick_v1`, which sends
 * the cleanup call secret from Vault (`gellatti_share_photo_cleanup_key`) in the
 * `x-gellatti-cleanup-key` header. The worker compares it with its own Edge
 * secret SHARE_PHOTO_CLEANUP_KEY before it touches anything and refuses when that
 * secret is unset, so the gateway is deployed WITHOUT a JWT check
 * (`supabase functions deploy share-photo-cleanup --no-verify-jwt`): the checked
 * authorisation lives here, ahead of claim, confirm, remove and settle.
 *
 * The service role key is NOT the call credential. It is used only for this
 * worker's own calls — the database decisions and the Storage removal — and the
 * admin client is created only after the caller has been authorised.
 *
 * The DATABASE decides what may be deleted: claim re-checks each file under the
 * lock an attach takes, and confirm repeats that check in the moment before the
 * delete. The worker removes exactly those names from `recipe-share-photos`;
 * settle records a deletion only when Storage no longer has the file. It never
 * lists a bucket, never touches another bucket and logs nothing about the files.
 *
 * Required secrets (names only): SHARE_PHOTO_CLEANUP_KEY, plus the auto-injected
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
let client: SupabaseClient | null = null;
const admin = (url: string, serviceRoleKey: string): SupabaseClient =>
  (client ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  return await handleCleanupRequest(
    req,
    { cleanupKey: Deno.env.get('SHARE_PHOTO_CLEANUP_KEY') },
    {
      claim: (limit) =>
        admin(url, serviceRoleKey).rpc('gellatti_share_photo_cleanup_claim_v1', { p_limit: limit }),
      confirm: (token, names) =>
        admin(url, serviceRoleKey).rpc('gellatti_share_photo_cleanup_confirm_v1', {
          p_claim_token: token,
          p_objects: names,
        }),
      remove: (names) => admin(url, serviceRoleKey).storage.from(BUCKET).remove(names),
      settle: (token, removed, error) =>
        admin(url, serviceRoleKey).rpc('gellatti_share_photo_cleanup_settle_v1', {
          p_claim_token: token,
          p_removed: removed,
          p_error: error,
        }),
    },
  );
});
