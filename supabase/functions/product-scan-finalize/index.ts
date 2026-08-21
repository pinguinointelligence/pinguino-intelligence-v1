import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sha256Text, stableJson } from '../_shared/productScanner.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function canonicalInput(result: Record<string, unknown>): Record<string, unknown> {
  const identity = objectValue(result.identity);
  const packageValue = objectValue(result.package);
  const nutrition = objectValue(result.nutrition);
  const barcodes = Array.isArray(result.barcodes) ? result.barcodes.map(objectValue) : [];
  const ean = text(barcodes[0]?.value);
  return {
    productKind: 'commercial_product',
    displayName: text(identity.displayName) ?? text(identity.originalName),
    originalName: text(identity.originalName),
    originalLanguage: Array.isArray(identity.labelLanguages)
      ? text(identity.labelLanguages[0])
      : null,
    brand: text(identity.brand),
    explicitlyUnbranded: identity.explicitlyUnbranded === true,
    canonicalFamily: null,
    category: text(identity.category),
    countryOfOrigin: text(identity.countryOfOrigin),
    ean,
    barcode: ean,
    provenance: 'product_scanner_v1',
    facts: {
      packageSize:
        typeof packageValue.netQuantity === 'number'
          ? `${packageValue.netQuantity} ${text(packageValue.unit) ?? ''}`.trim()
          : null,
      netQuantityText: text(packageValue.netQuantityText),
      ingredientsText: text(result.ingredientsText),
      allergensText: text(result.allergensText),
      mayContainAllergens: Array.isArray(result.mayContainAllergens)
        ? result.mayContainAllergens
        : [],
      labelLanguages: Array.isArray(identity.labelLanguages) ? identity.labelLanguages : [],
      nutrition: {
        basis: text(nutrition.basis),
        energyKcal: nutrition.energyKcal ?? null,
        fat: nutrition.fat ?? null,
        saturatedFat: nutrition.saturatedFat ?? null,
        carbohydrate: nutrition.carbohydrate ?? null,
        sugars: nutrition.sugars ?? null,
        protein: nutrition.protein ?? null,
        salt: nutrition.salt ?? null,
        fibre: nutrition.fibre ?? null,
      },
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (
    Deno.env.get('PRODUCT_SCANNER_ENABLED') === 'false' ||
    Deno.env.get('PRODUCT_SCANNER_V1_ENABLED') === 'false'
  ) {
    return json({ error: 'scanner_disabled' }, 503);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization)
    return json({ error: 'scanner_unavailable' }, 503);
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);
  let body: Record<string, unknown>;
  try {
    body = objectValue(await request.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const sessionId = text(body.sessionId);
  const idempotencyKey = text(body.idempotencyKey);
  if (
    !sessionId ||
    !/^[0-9a-f-]{36}$/i.test(sessionId) ||
    !idempotencyKey ||
    idempotencyKey.length > 160
  ) {
    return json({ error: 'invalid_finalize_request' }, 400);
  }
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: sessionError } = await service
    .from('product_scan_sessions')
    .select('id,user_id,state,result_json,validation_json,overlay_state,barcode,expires_at')
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (sessionError || !session) return json({ error: 'owned_scan_session_not_found' }, 404);
  if (session.state === 'finalized') {
    const { data: overlay } = await service
      .from('product_scan_overlay_states')
      .select('product_id,product_version_id,pi_product_code,state')
      .eq('session_id', sessionId)
      .maybeSingle();
    return json({ kind: 'idempotent', ...overlay });
  }
  if (
    session.state !== 'analyzed' ||
    !['USABLE_FOR_OWNER', 'PENDING_PUBLICATION'].includes(session.overlay_state)
  ) {
    return json({ error: 'scan_not_ready_for_creation' }, 409);
  }
  if (new Date(session.expires_at).getTime() <= Date.now())
    return json({ error: 'scan_session_expired' }, 409);

  const { data: quota, error: quotaError } = await service.rpc('reserve_product_scan_creation_v1', {
    p_actor_user_id: auth.user.id,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
  });
  if (quotaError) return json({ error: 'scanner_product_quota_preflight_failed' }, 503);
  const quotaResult = objectValue(quota);
  if (quotaResult.allowed !== true) {
    return json(
      {
        error: quotaResult.reason ?? 'scanner_product_quota_reached',
        retryAt: quotaResult.retryAt ?? null,
        upgradeHook: quotaResult.upgradeHook ?? null,
      },
      429,
    );
  }
  if (quotaResult.consumed === true) {
    const { data: overlay } = await service
      .from('product_scan_overlay_states')
      .select('product_id,product_version_id,pi_product_code,state')
      .eq('session_id', sessionId)
      .maybeSingle();
    return json({ kind: 'idempotent', ...overlay });
  }
  const releaseCreationSlot = async () => {
    await service.rpc('release_product_scan_creation_v1', {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_reservation_id: quotaResult.reservationId,
    });
  };

  const scanResult = objectValue(session.result_json);
  const input = canonicalInput(scanResult);
  const privateValue = objectValue(body.privateOverlay);
  const privateOverlay = {
    privatePrice: typeof privateValue.price === 'number' ? privateValue.price : null,
    currency: text(privateValue.currency),
    supplier: text(privateValue.supplier),
    notes: text(privateValue.notes),
    stock: null,
    favorite: true,
  };
  const source = text(input.ean) ? 'barcode' : 'manual';
  const payloadHash = await sha256Text(stableJson({ source, input, sessionId }));
  const { data: preflight, error: preflightError } = await service.rpc(
    'preflight_product_ingest_v1',
    {
      p_actor_user_id: auth.user.id,
      p_source: source,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: payloadHash,
      p_ip_hash: null,
      p_device_hash: null,
      p_risk_challenge_passed: false,
      p_ocr_session_id: null,
      p_duplicate_decision: null,
      p_review_escalation: false,
    },
  );
  if (preflightError) {
    await releaseCreationSlot();
    return json({ error: 'product_ingest_preflight_failed' }, 400);
  }
  const preflightResult = objectValue(preflight);
  if (preflightResult.allowed !== true || typeof preflightResult.reservationId !== 'string') {
    await releaseCreationSlot();
    return json(
      {
        error: preflightResult.reason ?? 'product_ingest_rate_limited',
        retryAt: preflightResult.retryAt ?? null,
      },
      429,
    );
  }
  const { data: ingest, error: ingestError } = await service.rpc('ingest_product_v1', {
    p_actor_user_id: auth.user.id,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_input: input,
    p_evidence: {
      scannerSessionId: sessionId,
      scannerSchema: 'gellatti_product_scan_v1',
      modelValidation: session.validation_json,
      conflicts: scanResult.conflicts ?? [],
      // Raw image bytes and private overlay are deliberately absent.
    },
    p_private_overlay: privateOverlay,
    p_risk: { rateReservationId: preflightResult.reservationId, preflightPayloadHash: payloadHash },
  });
  if (ingestError) {
    await releaseCreationSlot();
    return json({ error: 'product_ingest_failed' }, 400);
  }
  const result = objectValue(ingest);
  const created = result.kind === 'created';
  const productId = text(result.productId);
  const productVersionId = text(result.productVersionId);
  const productCode = text(result.productCode);
  if (!productId || !productCode) {
    await releaseCreationSlot();
    return json({ error: 'product_ingest_result_invalid' }, 503);
  }
  const { error: completionError } = await service.rpc('complete_product_scan_creation_v1', {
    p_actor_user_id: auth.user.id,
    p_session_id: sessionId,
    p_reservation_id: quotaResult.reservationId,
    p_created: created,
    p_product_id: productId,
    p_product_version_id: productVersionId,
    p_product_code: productCode,
    p_result: result,
  });
  if (completionError) return json({ error: 'scanner_overlay_finalize_failed' }, 503);
  return json(result);
});
