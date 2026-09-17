import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  BUCKET,
  CLAIM_LIMIT,
  JSON_HEADERS,
  planRemoval,
  removalOutcome,
  secretEquals,
} from './protocol.ts';

/**
 * share-photo-cleanup — deletes share photos that nothing uses any more.
 *
 * Operator-only. Called by pg_cron through `gellatti_share_photo_cleanup_tick_v1`,
 * which presents the service role key from Vault — the caller shape already
 * used by email-dispatch. `verify_jwt` is not access control (the public anon
 * key is a valid project JWT), so the worker compares the bearer with its own
 * service role key before doing anything.
 *
 * The DATABASE decides: the claim re-checks, under the lock an attach takes,
 * that each file is not attached, belongs to the sharer of an existing link and
 * is due. This worker removes exactly those names from `recipe-share-photos`
 * through the Storage API and reports back; settle records a deletion only when
 * Storage no longer has the file. It never lists a bucket, never touches
 * another bucket and logs nothing about the files.
 */
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return json(500, { error: 'server_not_configured' });

  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secretEquals(presented, serviceRoleKey)) return json(403, { error: 'forbidden' });

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claim, error: claimError } = await admin.rpc(
    'gellatti_share_photo_cleanup_claim_v1',
    { p_limit: CLAIM_LIMIT },
  );
  if (claimError) return json(503, { error: 'claim_failed' });

  const plan = planRemoval(claim);
  if (!plan.token || plan.names.length === 0) return json(200, { claimed: 0 });

  const { error: removeError } = await admin.storage.from(BUCKET).remove(plan.names);
  const outcome = removalOutcome(plan, removeError);

  const { data: settled, error: settleError } = await admin.rpc(
    'gellatti_share_photo_cleanup_settle_v1',
    { p_claim_token: plan.token, p_removed: outcome.removed, p_error: outcome.error },
  );
  if (settleError) return json(503, { error: 'settle_failed' });
  return json(200, { claimed: plan.names.length, settled });
});
