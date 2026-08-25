/**
 * production-rescue-authorize — authenticated staging Edge boundary.
 *
 * The browser submits only a run, stable option, two source revisions and an
 * idempotency key. The complete candidate is regenerated from authoritative
 * database state by the generated bundle of the canonical shared Engine.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.112.3';
import {
  PRODUCTION_RESCUE_AUTHORIZATION_DEADLINE_MS,
  PRODUCTION_RESCUE_TRANSPORT_DEADLINE_MS,
  RescueAuthorizationError,
  authorizeTrustedProductionRescue,
  parseAuthorizeRescueRequest,
  rescuePersistenceErrorForMessage,
  type PersistTrustedAuthorizationInput,
  type StoredTrustedAuthorization,
  type TrustedRescueContext,
} from './logic.ts';

const ALLOWED_ORIGINS = new Set([
  'https://staging.pinguinoai.com',
  'http://localhost:4173',
  'http://localhost:5173',
]);

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin');
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

const json = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });

const boundedFetch: typeof fetch = (input, init = {}) => {
  const timeout = AbortSignal.timeout(PRODUCTION_RESCUE_TRANSPORT_DEADLINE_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin');
    return origin && ALLOWED_ORIGINS.has(origin)
      ? new Response('ok', { headers: corsHeaders(request) })
      : json(request, 403, { error: 'origin_not_allowed' });
  }
  if (request.method !== 'POST') return json(request, 405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(request, 500, { error: 'rescue_authorization_not_configured' });
  }

  const authorizationHeader = request.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorizationHeader)) {
    return json(request, 401, { error: 'authentication_required' });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorizationHeader }, fetch: boundedFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(request, 401, { error: 'invalid_authentication' });
  const ownerUserId = userData.user.id;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return json(request, 400, { error: 'invalid_json' });
  }

  try {
    const body = parseAuthorizeRescueRequest(parsedBody);
    const { data: proEntitled, error: entitlementError } = await userClient.rpc(
      'has_active_production_entitlement_v1',
    );
    if (entitlementError || proEntitled !== true) {
      throw new RescueAuthorizationError('pro_entitlement_required', 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      global: { fetch: boundedFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const dependencies = {
      async loadContext(userId: string, runId: string): Promise<TrustedRescueContext | null> {
        const { data: account, error: accountError } = await admin
          .from('account_profiles')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (accountError) throw new RescueAuthorizationError('account_authority_unavailable', 503);
        // Production currently has personal-account authority. account_profiles
        // is optional for legacy owners; the verified auth UID is the account ID.
        if (account && account.user_id !== userId) {
          throw new RescueAuthorizationError('account_authority_mismatch', 403);
        }

        const { data: run, error: runError } = await admin
          .from('production_runs')
          .select('*')
          .eq('id', runId)
          .eq('owner_user_id', userId)
          .maybeSingle();
        if (runError) throw new RescueAuthorizationError('production_source_unavailable', 503);
        if (!run) return null;

        const [versionResult, recipeResult, plannedResult, actualResult, eventsResult] =
          await Promise.all([
            admin
              .from('recipe_versions')
              .select('*')
              .eq('id', run.recipe_version_id)
              .eq('owner_user_id', userId)
              .maybeSingle(),
            admin
              .from('saved_recipes')
              .select('name')
              .eq('id', run.recipe_id)
              .eq('user_id', userId)
              .maybeSingle(),
            admin
              .from('production_run_planned_items')
              .select('*')
              .eq('run_id', runId)
              .eq('owner_user_id', userId)
              .order('position', { ascending: true }),
            admin
              .from('production_run_actuals')
              .select('*')
              .eq('run_id', runId)
              .eq('owner_user_id', userId)
              .maybeSingle(),
            admin
              .from('production_run_events')
              .select('*')
              .eq('run_id', runId)
              .eq('owner_user_id', userId)
              .order('created_at', { ascending: true }),
          ]);
        if (
          versionResult.error ||
          recipeResult.error ||
          plannedResult.error ||
          actualResult.error ||
          eventsResult.error
        ) {
          throw new RescueAuthorizationError('production_source_unavailable', 503);
        }
        if (!versionResult.data || !recipeResult.data) {
          throw new RescueAuthorizationError('immutable_production_source_missing', 409);
        }
        return {
          recipeTitle:
            typeof recipeResult.data.name === 'string' ? recipeResult.data.name : 'Receptura',
          run,
          version: versionResult.data,
          planned: plannedResult.data ?? [],
          actual: actualResult.data ?? null,
          events: eventsResult.data ?? [],
        } as TrustedRescueContext;
      },

      async persistAuthorization(
        input: PersistTrustedAuthorizationInput,
      ): Promise<StoredTrustedAuthorization> {
        const abort = new AbortController();
        const authorizationStartedAt = Date.now();
        const timer = setTimeout(() => abort.abort(), PRODUCTION_RESCUE_TRANSPORT_DEADLINE_MS);
        try {
          const deadlineAt = new Date(
            authorizationStartedAt + PRODUCTION_RESCUE_AUTHORIZATION_DEADLINE_MS,
          ).toISOString();
          const expiresAt = new Date(
            authorizationStartedAt + input.ttlSeconds * 1000,
          ).toISOString();
          const { data, error } = await admin
            .rpc('production_create_rescue_authorization_v1', {
              p_owner_user_id: input.ownerUserId,
              p_account_id: input.accountId,
              p_run_id: input.runId,
              p_recipe_version_id: input.recipeVersionId,
              p_source_fingerprint: input.sourceFingerprint,
              p_expected_actual_revision: input.expectedActualRevision,
              p_expected_rescue_revision: input.expectedRescueRevision,
              p_recipe_input: input.recipeInput,
              p_product_composition: input.productComposition,
              p_candidate_fingerprint: input.candidateFingerprint,
              p_product_behavior_fingerprint: input.productBehaviorFingerprint,
              p_engine_version: input.engineVersion,
              p_config_version: input.configVersion,
              p_practical_recipe_version: input.practicalRecipeVersion,
              p_rescue_model_version: input.rescueModelVersion,
              p_engine_bundle_sha256: input.engineBundleSha256,
              p_source_closure_sha256: input.sourceClosureSha256,
              p_bundler_version: input.bundlerVersion,
              p_request_fingerprint: input.requestFingerprint,
              p_stable_option_id: input.stableOptionId,
              p_safe_metadata: input.safeMetadata,
              p_deadline_at: deadlineAt,
              p_expires_at: expiresAt,
              p_idempotency_key: input.idempotencyKey,
            })
            .abortSignal(abort.signal);
          if (error) throw rescuePersistenceErrorForMessage(error.message);
          if (!data || typeof data !== 'object') {
            throw new RescueAuthorizationError('invalid_authorization_projection', 500);
          }
          const result = data as Record<string, unknown>;
          return {
            authorizationId: String(result.authorizationId),
            runId: String(result.runId),
            stableOptionId: result.stableOptionId as StoredTrustedAuthorization['stableOptionId'],
            expectedActualRevision: Number(result.expectedActualRevision),
            expectedRescueRevision: Number(result.expectedRescueRevision),
            candidateFingerprint: String(result.candidateFingerprint),
            authorizedAt: String(result.authorizedAt),
            expiresAt: String(result.expiresAt),
            safeMetadata: result.safeMetadata as StoredTrustedAuthorization['safeMetadata'],
          };
        } catch (error) {
          if (abort.signal.aborted) {
            throw new RescueAuthorizationError('authorization_response_timeout', 504);
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      },
    };

    const response = await authorizeTrustedProductionRescue(ownerUserId, body, dependencies);
    return json(request, 200, response as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof RescueAuthorizationError) {
      return json(request, error.status, { error: error.code, ...error.details });
    }
    return json(request, 500, { error: 'rescue_authorization_failed' });
  }
});
