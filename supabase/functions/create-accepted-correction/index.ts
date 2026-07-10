/**
 * create-accepted-correction — Edge Function (Deno). ***NOT DEPLOYED.***
 *
 * Deploying requires explicit owner approval and is ONE atomic cutover with
 * the Option-B grant revocation + client rewire (see
 * docs/spine/proposals/accepted_corrections_tier_policy.proposal.sql). Until
 * then the live create path stays the direct RLS table insert, and the
 * client is deliberately NOT wired to this function.
 *
 * Server-side responsibilities (decision F hardening):
 *  - identity comes ONLY from the verified JWT (Authorization header) — anon
 *    rejected; the request body can never choose whose row is written;
 *  - Pro entitlement comes ONLY from the server-written public.subscriptions
 *    cache (select-own RLS; the client has no write grant on it) — the
 *    tier can never be supplied by the request;
 *  - the draft is re-validated against the SAME closed contract as the app
 *    (key set mirrored from ACCEPTED_CORRECTION_DRAFT_KEYS and pinned equal
 *    by a repo test; FNV-1a source hash recomputed here);
 *  - the insert goes through the service-role client because the cutover
 *    revokes the authenticated INSERT grant; user_id/created_by are FORCED
 *    from the JWT user. Write-once: there is NO update path here.
 *  - this function touches exactly three tables: subscriptions (read own
 *    row), saved_recipes (read own row ONLY to verify an optional recipe
 *    link) and accepted_corrections (insert one row). It never writes
 *    anything except the one correction row — never Mapper, products,
 *    PAC/POD, statuses, recipes, or inventory.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** MIRROR of ACCEPTED_CORRECTION_DRAFT_KEYS (src/features/optimization/
 * acceptedCorrectionDraft.ts). A repo test pins the two lists equal. */
const DRAFT_KEYS = [
  'schemaVersion',
  'ownerId',
  'recipeId',
  'sourceRecipeHash',
  'originalRecipeSnapshot',
  'correctedRecipeSnapshot',
  'optimizerDecision',
  'correctionActions',
  'beforeMetrics',
  'afterMetrics',
  'targetMode',
  'productProfile',
  'servingTemperatureC',
  'warnings',
  'trace',
  'engineVersion',
  'configVersion',
  'createdBy',
] as const;

/** MIRROR of planFromSubscription (src/access/subscription.ts) — a repo test
 * pins the status literals equal. active|trialing → Pro; past_due → Pro only
 * until current_period_end (grace); anything else → free. */
function isProSubscription(row: {
  subscription_status: string;
  current_period_end: string | null;
}): boolean {
  const status = row.subscription_status;
  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due') {
    return row.current_period_end !== null && new Date(row.current_period_end).getTime() > Date.now();
  }
  return false;
}

/** FNV-1a 32-bit hex — byte-identical mirror of sourceRecipeHash. */
function fnv1a(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function validateDraft(draft: unknown): string[] {
  const errors: string[] = [];
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    return ['draft_not_an_object'];
  }
  const d = draft as Record<string, unknown>;
  const allowed = new Set<string>(DRAFT_KEYS);
  for (const key of Object.keys(d)) {
    if (!allowed.has(key)) errors.push(`unexpected_key:${key}`);
  }
  for (const key of DRAFT_KEYS) {
    if (!(key in d)) errors.push(`missing_key:${key}`);
  }
  if (d.schemaVersion !== '1') errors.push('unsupported_schema_version');
  if (d.optimizerDecision !== 'optimized' && d.optimizerDecision !== 'tradeoff') {
    errors.push('decision_not_saveable');
  }
  if (d.targetMode !== 'engine_seeded' && d.targetMode !== 'regulator_shadow') {
    errors.push('invalid_target_mode');
  }
  if (!Array.isArray(d.correctionActions) || d.correctionActions.length === 0) {
    errors.push('no_correction_actions');
  } else {
    for (const action of d.correctionActions as Array<Record<string, unknown>>) {
      const grams = action?.grams;
      if (!action?.ingredient || typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
        errors.push(`invalid_action:${String(action?.ingredient ?? 'unnamed')}`);
      }
    }
  }
  if (d.originalRecipeSnapshot == null) errors.push('missing_original_snapshot');
  if (d.correctedRecipeSnapshot == null) errors.push('missing_corrected_snapshot');
  if (d.afterMetrics == null) errors.push('missing_after_metrics');
  if (fnv1a(d.originalRecipeSnapshot) !== d.sourceRecipeHash) {
    errors.push('source_recipe_hash_mismatch');
  }
  return errors;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Identity from the verified JWT only — anon rejected.
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'sign_in_required' });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json(401, { error: 'sign_in_required' });

  // 2. Draft from the body — data only, never identity, never tier.
  let draft: unknown;
  try {
    draft = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const d = draft as Record<string, unknown>;

  // 3. Ownership: the draft must belong to the JWT user (and to itself).
  if (d.ownerId !== user.id || d.createdBy !== user.id) {
    return json(403, { error: 'owner_mismatch' });
  }

  // 4. Pro entitlement from the server-written subscriptions cache, read AS
  //    THE USER (select-own RLS). The request cannot influence this.
  const { data: subscription, error: subscriptionError } = await userClient
    .from('subscriptions')
    .select('subscription_status, current_period_end')
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) return json(500, { error: 'entitlement_check_failed' });
  if (!subscription || !isProSubscription(subscription)) {
    return json(403, { error: 'pro_required' });
  }

  // 5. Same closed validation contract as the app.
  const errors = validateDraft(d);
  if (errors.length > 0) return json(422, { error: 'invalid_draft', details: errors });

  // 6. An optional recipe link must point at the CALLER'S OWN saved recipe —
  //    read AS THE USER (select-own RLS), so a foreign or invented id is
  //    simply not visible (adversarial-review finding: a bare FK would allow
  //    cross-user linkage / uuid probing).
  if (d.recipeId != null) {
    const { data: ownRecipe, error: recipeError } = await userClient
      .from('saved_recipes')
      .select('id')
      .eq('id', d.recipeId)
      .maybeSingle();
    if (recipeError || !ownRecipe) return json(403, { error: 'recipe_not_owned' });
  }

  // 7. Insert (write-once) with identity FORCED from the JWT. Explicit
  //    field mapping — an unknown body key can never reach the row.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: record, error: insertError } = await admin
    .from('accepted_corrections')
    .insert({
      schema_version: d.schemaVersion,
      user_id: user.id,
      recipe_id: d.recipeId ?? null,
      source_recipe_hash: d.sourceRecipeHash,
      original_recipe_snapshot: d.originalRecipeSnapshot,
      corrected_recipe_snapshot: d.correctedRecipeSnapshot,
      optimizer_decision: d.optimizerDecision,
      correction_actions: d.correctionActions,
      before_metrics: d.beforeMetrics,
      after_metrics: d.afterMetrics,
      target_mode: d.targetMode,
      product_profile: d.productProfile,
      serving_temperature_c: d.servingTemperatureC,
      warnings: d.warnings,
      trace: d.trace,
      engine_version: d.engineVersion,
      config_version: d.configVersion,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (insertError) return json(500, { error: 'insert_failed', message: insertError.message });

  return json(201, { id: record.id });
});
