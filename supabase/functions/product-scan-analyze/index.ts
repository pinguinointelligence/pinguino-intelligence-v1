import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  EAN_LOOKUP_FIELDS,
  PRODUCT_SCAN_RESPONSE_SCHEMA,
  scanResultFromLookupFacts,
  SYSTEM_PROMPT,
  extractResponseText,
  mergeProductScanResults,
  normalizeValidatedBarcode,
  sha256Text,
  stableJson,
  validateServerResult,
  webCallsInResponse,
} from '../_shared/productScanner.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const OPENAI_PROJECTS: Record<string, 'staging' | 'production'> = {
  proj_qfPNkkHlfmI3LAx7NoUjwowZ: 'staging',
  proj_1MvKPXEEkg3KjNL2Fh90eCIj: 'production',
};
const MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-terra': { input: 2, output: 12 },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
const numberEnv = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const nonNegativeIntegerEnv = (name: string, fallback: number) => {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const mimeMatchesBytes = (mime: string, bytes: Uint8Array) => {
  if (mime === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (mime === 'image/png')
    return (
      bytes.length > 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
    );
  if (mime === 'image/webp')
    return (
      bytes.length > 12 &&
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    );
  return false;
};

async function exactProductForBarcode(
  service: ReturnType<typeof createClient>,
  barcode: string | null,
) {
  if (!barcode) return null;
  const digits = barcode.replace(/\D/g, '');
  if (![8, 12, 13].includes(digits.length)) return null;
  const candidates = new Set([digits]);
  if (digits.length === 12) candidates.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) candidates.add(digits.slice(1));
  const { data } = await service
    .from('product_variants')
    .select(
      'product_id,ean,products!inner(id,is_active,merged_into_product_id,product_name_display,brand,product_kind,canonical_verification_status,product_code)',
    )
    .in('ean', [...candidates])
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  const related = data?.products as unknown;
  const product = Array.isArray(related) ? objectValue(related[0]) : objectValue(related);
  return product?.is_active === true && product.merged_into_product_id === null ? product : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  const projectId = Deno.env.get('OPENAI_PROJECT_ID');
  if (!url || !anonKey || !serviceKey || !authorization)
    return json({ error: 'scanner_unavailable' }, 503);
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let body: Record<string, unknown>;
  try {
    body = objectValue(await request.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const sessionId =
    typeof body.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sessionId)
      ? body.sessionId
      : null;
  const images = Array.isArray(body.images) ? body.images.map(objectValue) : [];
  const maxImages = Math.floor(numberEnv('PRODUCT_SCANNER_MAX_IMAGES', 4));
  /**
   * `ean_lookup` asks the barcode's own source and never reads a photograph, so it
   * carries no images — that is the whole point of running it BEFORE the owner is
   * asked to turn the package around.
   */
  const mode = body.mode === 'ean_lookup' ? 'ean_lookup' : 'analyze';
  if (!sessionId || images.length > maxImages || (mode === 'analyze' && images.length < 1))
    return json({ error: 'invalid_scan_session' }, 400);
  let totalEncodedBytes = 0;
  for (const image of images) {
    if (
      typeof image.assetId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(image.assetId) ||
      typeof image.base64 !== 'string' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(String(image.mime)) ||
      !['camera_auto', 'camera_manual', 'gallery', 'drop', 'paste'].includes(String(image.source))
    ) {
      return json({ error: 'invalid_scan_image' }, 400);
    }
    totalEncodedBytes += image.base64.length;
    if (image.base64.length > 14_000_000) return json({ error: 'scan_image_too_large' }, 413);
  }
  if (totalEncodedBytes > 42_000_000) return json({ error: 'scan_payload_too_large' }, 413);

  const suppliedBarcode = objectValue(body.barcode);
  const incomingBarcode = normalizeValidatedBarcode(
    typeof suppliedBarcode.lookupValue === 'string'
      ? suppliedBarcode.lookupValue
      : typeof suppliedBarcode.value === 'string'
        ? suppliedBarcode.value
        : null,
  );
  const { data: existingSession } = await service
    .from('product_scan_sessions')
    .select('user_id,result_json,validation_json,overlay_state,barcode,vision_calls')
    .eq('id', sessionId)
    .maybeSingle();
  if (existingSession && existingSession.user_id !== auth.user.id) {
    return json({ error: 'scan_session_ownership_mismatch' }, 403);
  }
  const establishedBarcode = normalizeValidatedBarcode(existingSession?.barcode);
  if (establishedBarcode && incomingBarcode && establishedBarcode !== incomingBarcode) {
    return json({ error: 'scan_session_barcode_conflict' }, 409);
  }
  const barcode = establishedBarcode ?? incomingBarcode;
  const exact = await exactProductForBarcode(service, barcode);
  if (!existingSession) {
    const { error: insertSessionError } = await service.from('product_scan_sessions').insert({
      id: sessionId,
      user_id: auth.user.id,
      state: exact ? 'matched' : 'collecting',
      barcode,
      exact_product_id: exact?.id ?? null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insertSessionError) return json({ error: 'scan_session_create_failed' }, 503);
  } else if (exact) {
    await service
      .from('product_scan_sessions')
      .update({
        state: 'matched',
        barcode,
        exact_product_id: exact.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id);
  } else if (!establishedBarcode && barcode) {
    await service
      .from('product_scan_sessions')
      .update({ barcode, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .is('barcode', null);
  }
  if (mode === 'ean_lookup') {
    // An exact canonical product answers the scan outright: no model, no source call,
    // no allowance. This is the cheap path a rescan of a known package must take (§16).
    if (exact)
      return json({
        sessionId,
        kind: 'existing_product',
        product: {
          id: exact.id,
          displayName: exact.product_name_display,
          brand: exact.brand ?? null,
          entityKind: exact.product_kind === 'mapper_reference' ? 'pi_base' : 'commercial_product',
          status:
            exact.product_kind === 'mapper_reference'
              ? 'pi_base'
              : exact.canonical_verification_status,
        },
        usage: { visionCalls: 0, webCalls: 0, estimatedCostUsd: 0 },
      });
    if (!barcode) return json({ error: 'lookup_requires_barcode' }, 400);
    const { data: lookupReservation, error: lookupReserveError } = await service.rpc(
      'reserve_product_scan_ean_lookup_v1',
      { p_actor_user_id: auth.user.id, p_session_id: sessionId },
    );
    if (lookupReserveError) return json({ error: 'scanner_lookup_preflight_failed' }, 503);
    const lookupReserved = objectValue(lookupReservation);
    if (lookupReserved.allowed !== true) {
      // A refused lookup is not a failure of the scan. The session keeps whatever it
      // has and the flow continues locally (§24).
      return json({
        sessionId,
        kind: 'ean_lookup',
        skipped: String(lookupReserved.reason ?? 'session_lookup_already_used'),
        result: existingSession?.result_json ?? null,
        overlayState: existingSession?.overlay_state ?? null,
        missingCriticalFields:
          objectValue(existingSession?.validation_json).missingCriticalFields ?? [],
        usage: {
          visionCalls: Number(existingSession?.vision_calls ?? 0),
          webCalls: 0,
          estimatedCostUsd: 0,
        },
      });
    }
    const priorResult = objectValue(existingSession?.result_json);
    const identity = objectValue(priorResult.identity);
    let facts: Record<string, unknown>[] = [];
    let providerError: string | null;
    /** What the provider ACTUALLY did — a cache hit costs nothing and must say so. */
    let providerWebCalls = 0;
    try {
      // The narrowest dedicated server-side source path this repository has, called
      // with its OWN flag, its OWN caps and its OWN source-authority classification.
      // The Scanner's general web search is NOT switched on to reach it (§6).
      const response = await fetch(`${url}/functions/v1/intimport-enrich`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importId: `product-scan-${sessionId}`,
          product: {
            brand: typeof identity.brand === 'string' ? identity.brand : null,
            manufacturer: null,
            name:
              typeof identity.displayName === 'string'
                ? identity.displayName
                : typeof identity.originalName === 'string'
                  ? identity.originalName
                  : null,
            variant: null,
            barcode,
            netQuantity: null,
            knownSourceUrl: null,
            technicalPdfUrl: null,
          },
          researchStep: { kind: 'GTIN_LOOKUP', url: null, allowedDomains: [] },
          fields: [...EAN_LOOKUP_FIELDS],
        }),
      });
      const payload = objectValue(await response.json());
      if (!response.ok) throw new Error('lookup_provider_failed');
      facts = Array.isArray(payload.facts) ? payload.facts.map(objectValue) : [];
      providerError = typeof payload.error === 'string' ? payload.error : null;
      providerWebCalls =
        payload.cacheHit === true ? 0 : Math.max(0, Math.min(3, Number(payload.webCalls ?? 1)));
    } catch {
      providerError = 'lookup_provider_unavailable';
    }
    const lookupResult = providerError ? null : scanResultFromLookupFacts(facts);
    const merged = lookupResult
      ? mergeProductScanResults(existingSession?.result_json ?? null, lookupResult, barcode)
      : null;
    const { data: priorAssets } = await service
      .from('product_scan_assets')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id);
    const lookupValidation = merged
      ? validateServerResult(
          merged,
          (priorAssets ?? []).map((asset) => String(asset.id)),
        )
      : null;
    if (merged && lookupValidation) {
      const { error: lookupCompleteError } = await service.rpc(
        'complete_product_scan_ean_lookup_v1',
        {
          p_actor_user_id: auth.user.id,
          p_session_id: sessionId,
          p_result: merged,
          p_validation: {
            missingCriticalFields: lookupValidation.missingCriticalFields,
            highRiskAuthorityRequired: lookupValidation.highRiskAuthorityRequired,
          },
          p_overlay_state: lookupValidation.overlayState,
          p_cost_usd: providerWebCalls * 0.01,
        },
      );
      if (lookupCompleteError) return json({ error: 'scanner_result_persistence_failed' }, 503);
    }
    return json({
      sessionId,
      kind: 'ean_lookup',
      resolvedNothing: merged === null,
      providerUnavailable: providerError !== null,
      result: merged ?? existingSession?.result_json ?? null,
      overlayState: lookupValidation?.overlayState ?? null,
      missingCriticalFields: lookupValidation?.missingCriticalFields ?? [],
      usage: {
        visionCalls: Number(existingSession?.vision_calls ?? 0),
        webCalls: providerWebCalls,
        estimatedCostUsd: providerWebCalls * 0.01,
      },
    });
  }

  const assetRows = [];
  try {
    for (const image of images) {
      const binary = atob(String(image.base64));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
      if (bytes.byteLength > 10_485_760) throw new Error('image_too_large');
      if (!mimeMatchesBytes(String(image.mime), bytes)) throw new Error('mime_mismatch');
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      assetRows.push({
        id: image.assetId,
        session_id: sessionId,
        user_id: auth.user.id,
        source: image.source,
        original_mime:
          typeof image.originalMime === 'string' ? image.originalMime.slice(0, 100) : image.mime,
        normalized_mime: image.mime,
        byte_size: bytes.byteLength,
        checksum_sha256: checksum,
        transformations: Array.isArray(image.transformations)
          ? image.transformations.filter((item) => typeof item === 'string').slice(0, 12)
          : [],
        quality_score:
          typeof image.qualityScore === 'number'
            ? Math.max(0, Math.min(100, Math.round(image.qualityScore)))
            : null,
      });
    }
  } catch {
    return json({ error: 'invalid_scan_image_encoding' }, 400);
  }
  const { data: existingAssets, error: existingAssetsError } = await service
    .from('product_scan_assets')
    .select('id,session_id,user_id,checksum_sha256')
    .in(
      'id',
      assetRows.map((row) => row.id),
    );
  if (existingAssetsError) return json({ error: 'scan_asset_metadata_failed' }, 503);
  if (
    (existingAssets ?? []).some((prior) => {
      const incoming = assetRows.find((row) => row.id === prior.id);
      return (
        !incoming ||
        prior.session_id !== sessionId ||
        prior.user_id !== auth.user.id ||
        prior.checksum_sha256 !== incoming.checksum_sha256
      );
    })
  )
    return json({ error: 'scan_asset_identity_conflict' }, 409);
  const { error: assetError } = await service.from('product_scan_assets').upsert(assetRows, {
    onConflict: 'id',
    ignoreDuplicates: true,
  });
  if (assetError) return json({ error: 'scan_asset_metadata_failed' }, 503);
  const { data: sessionAssets, error: sessionAssetsError } = await service
    .from('product_scan_assets')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id);
  if (sessionAssetsError) return json({ error: 'scan_asset_metadata_failed' }, 503);
  const sessionAssetIds = (sessionAssets ?? []).map((asset) => String(asset.id));
  if (exact)
    return json({
      sessionId,
      kind: 'existing_product',
      product: {
        id: exact.id,
        displayName: exact.product_name_display,
        brand: exact.brand ?? null,
        entityKind: exact.product_kind === 'mapper_reference' ? 'pi_base' : 'commercial_product',
        status:
          exact.product_kind === 'mapper_reference'
            ? 'pi_base'
            : exact.canonical_verification_status,
      },
      usage: { visionCalls: 0, webCalls: 0, estimatedCostUsd: 0 },
    });

  if (
    Deno.env.get('PRODUCT_SCANNER_ENABLED') === 'false' ||
    Deno.env.get('PRODUCT_SCANNER_V1_ENABLED') === 'false'
  ) {
    return json({ error: 'scanner_disabled' }, 503);
  }
  if (!openAiKey || !projectId) return json({ error: 'scanner_analysis_not_configured' }, 503);
  const environment = OPENAI_PROJECTS[projectId];
  if (!environment) return json({ error: 'scanner_openai_project_not_allowed' }, 503);

  const accurateRetry = body.accurateRetry === true;
  const callKind = accurateRetry ? 'accurate' : 'fast';
  const maxVisionCalls = Math.min(2, nonNegativeIntegerEnv('PRODUCT_SCANNER_MAX_VISION_CALLS', 2));
  const priorVisionCalls = Number(existingSession?.vision_calls ?? 0);
  if (accurateRetry && priorVisionCalls < 1) {
    return json({ error: 'accurate_retry_requires_fast_evidence' }, 409);
  }
  if ((accurateRetry ? 2 : 1) > maxVisionCalls) {
    return json({ error: 'session_vision_limit' }, 429);
  }
  const model = accurateRetry
    ? Deno.env.get('PRODUCT_SCANNER_ACCURATE_MODEL') || 'gpt-5.6-terra'
    : Deno.env.get('PRODUCT_SCANNER_FAST_MODEL') || 'gpt-5.6-luna';
  const pricing = MODEL_PRICING_USD_PER_MILLION[model];
  if (!pricing) return json({ error: 'scanner_model_pricing_not_configured' }, 503);
  const configuredDetail = Deno.env.get('PRODUCT_SCANNER_IMAGE_DETAIL') || 'original';
  const detail = ['auto', 'low', 'high', 'original'].includes(configuredDetail)
    ? configuredDetail
    : 'original';
  // Scanner web isolation (§6). The client's `allowWeb` is NOT read here any more: it
  // was sent on every ordinary scan, so the moment this flag was ever unset or set to
  // anything other than 'false' every label analysis silently gained a web-search tool.
  // General search is now opt-IN, and the exact GTIN lookup above is what a scan uses.
  const allowWeb =
    Deno.env.get('PRODUCT_SCANNER_WEB_SEARCH_ENABLED') === 'true' &&
    Boolean(barcode) &&
    Math.min(1, nonNegativeIntegerEnv('PRODUCT_SCANNER_MAX_WEB_CALLS', 1)) === 1;
  const estimatedCost = accurateRetry ? 0.18 : 0.035;
  if (estimatedCost > numberEnv('PRODUCT_SCANNER_MAX_ESTIMATED_CALL_USD', 0.25)) {
    return json({ error: 'scanner_call_cost_limit' }, 429);
  }
  const payloadHash = await sha256Text(
    stableJson({
      images: images.map((image) => ({
        assetId: image.assetId,
        mime: image.mime,
        length: String(image.base64).length,
        checksumSha256: assetRows.find((row) => row.id === image.assetId)?.checksum_sha256,
        transformations: image.transformations,
      })),
      barcode,
      callKind,
      model,
      detail,
      allowWeb,
      projectId,
    }),
  );
  const forwardedIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unavailable';
  const deviceSource =
    request.headers.get('x-product-scanner-device') ??
    request.headers.get('user-agent') ??
    'unavailable';
  const ipHash = await sha256Text(`product-scanner-ip-v1:${forwardedIp}`);
  const deviceHash = await sha256Text(`product-scanner-device-v1:${auth.user.id}:${deviceSource}`);
  const { data: reservation, error: reserveError } = await service.rpc(
    'reserve_product_scan_analysis_v1',
    {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_call_kind: callKind,
      p_environment: environment,
      p_project_id: projectId,
      p_model: model,
      p_image_count: images.length,
      p_detail_level: detail,
      p_ip_hash: ipHash,
      p_device_hash: deviceHash,
      p_retry_reason: accurateRetry ? 'missing_or_uncertain_label_evidence' : null,
      p_idempotency_key: `${sessionId}:${callKind}`,
      p_payload_hash: payloadHash,
      p_estimated_cost_usd: estimatedCost,
      p_web_requested: allowWeb,
      p_daily_cost_limit_usd: numberEnv('PRODUCT_SCANNER_DAILY_COST_LIMIT', 5),
      p_monthly_cost_limit_usd: numberEnv('PRODUCT_SCANNER_MONTHLY_COST_LIMIT', 100),
    },
  );
  if (reserveError) return json({ error: 'scanner_budget_preflight_failed' }, 503);
  const reserved = objectValue(reservation);
  if (reserved.allowed !== true)
    return json(
      {
        error: String(reserved.reason ?? 'scanner_budget_exceeded'),
        retryAt: reserved.retryAt ?? null,
      },
      429,
    );
  if (reserved.completed === true) {
    const { data: prior } = await service
      .from('product_scan_sessions')
      .select('result_json,validation_json,overlay_state,vision_calls,web_calls,estimated_cost_usd')
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .single();
    return json({
      sessionId,
      result: prior?.result_json,
      overlayState: prior?.overlay_state,
      missingCriticalFields: objectValue(prior?.validation_json).missingCriticalFields ?? [],
      usage: {
        visionCalls: prior?.vision_calls ?? 0,
        webCalls: prior?.web_calls ?? 0,
        estimatedCostUsd: Number(prior?.estimated_cost_usd ?? 0),
      },
    });
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: `Asset ids: ${images.map((image) => image.assetId).join(', ')}. Barcode observed locally: ${barcode ?? 'none'}. Read all visible label languages.`,
    },
  ];
  for (const image of images)
    content.push({
      type: 'input_image',
      image_url: `data:${image.mime};base64,${image.base64}`,
      detail,
    });
  const openAiBody: Record<string, unknown> = {
    model,
    store: false,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
      { role: 'user', content },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'gellatti_product_scan',
        strict: true,
        schema: PRODUCT_SCAN_RESPONSE_SCHEMA,
      },
    },
  };
  if (allowWeb) {
    openAiBody.tools = [{ type: 'web_search' }];
    openAiBody.max_tool_calls = 1;
  }
  let responsePayload: Record<string, unknown>;
  const requestStartedAt = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Project': projectId,
      },
      body: JSON.stringify(openAiBody),
    });
    responsePayload = objectValue(await response.json());
    if (!response.ok) throw new Error('provider_request_failed');
  } catch {
    const latencyMs = Date.now() - requestStartedAt;
    await service.rpc('complete_product_scan_analysis_v1', {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_reservation_id: reserved.reservationId,
      p_status: 'failed',
      p_result: null,
      p_validation: { error: 'provider_request_failed' },
      p_overlay_state: 'BLOCKED',
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_web_calls: 0,
      p_latency_ms: latencyMs,
      p_actual_cost_usd: 0,
    });
    return json(
      {
        error: 'scanner_provider_unavailable',
        usage: { visionCalls: accurateRetry ? 2 : 1, webCalls: 0, estimatedCostUsd: 0 },
      },
      502,
    );
  }
  const outputText = extractResponseText(responsePayload);
  let result: unknown;
  try {
    result = outputText ? JSON.parse(outputText) : null;
  } catch {
    result = null;
  }
  const usage = objectValue(responsePayload.usage);
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const webCalls = Math.min(1, webCallsInResponse(responsePayload));
  const latencyMs = Date.now() - requestStartedAt;
  const actualCost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    webCalls * 0.01;
  const currentCallResult = mergeProductScanResults(null, result, barcode);
  const currentCallValidation = validateServerResult(
    currentCallResult,
    images.map((image) => String(image.assetId)),
  );
  if (!currentCallValidation.ok) {
    await service.rpc('complete_product_scan_analysis_v1', {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_reservation_id: reserved.reservationId,
      p_status: 'failed',
      p_result: currentCallResult,
      p_validation: currentCallValidation,
      p_overlay_state: 'BLOCKED',
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_web_calls: webCalls,
      p_latency_ms: latencyMs,
      p_actual_cost_usd: actualCost,
    });
    return json(
      {
        error: 'scanner_result_validation_failed',
        usage: { visionCalls: accurateRetry ? 2 : 1, webCalls, estimatedCostUsd: actualCost },
      },
      422,
    );
  }
  const cumulativeResult = mergeProductScanResults(
    existingSession?.result_json,
    currentCallResult,
    barcode,
  );
  const validation = validateServerResult(cumulativeResult, sessionAssetIds);
  if (!validation.ok) {
    await service.rpc('complete_product_scan_analysis_v1', {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_reservation_id: reserved.reservationId,
      p_status: 'failed',
      p_result: cumulativeResult,
      p_validation: validation,
      p_overlay_state: 'BLOCKED',
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_web_calls: webCalls,
      p_latency_ms: latencyMs,
      p_actual_cost_usd: actualCost,
    });
    return json(
      {
        error: 'scanner_cumulative_validation_failed',
        usage: { visionCalls: accurateRetry ? 2 : 1, webCalls, estimatedCostUsd: actualCost },
      },
      422,
    );
  }
  const { error: completeError } = await service.rpc('complete_product_scan_analysis_v1', {
    p_actor_user_id: auth.user.id,
    p_session_id: sessionId,
    p_reservation_id: reserved.reservationId,
    p_status: 'completed',
    p_result: cumulativeResult,
    p_validation: {
      missingCriticalFields: validation.missingCriticalFields,
      highRiskAuthorityRequired: validation.highRiskAuthorityRequired,
    },
    p_overlay_state: validation.overlayState,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_web_calls: webCalls,
    p_latency_ms: latencyMs,
    p_actual_cost_usd: actualCost,
  });
  if (completeError)
    return json(
      {
        error: 'scanner_result_persistence_failed',
        usage: { visionCalls: accurateRetry ? 2 : 1, webCalls, estimatedCostUsd: actualCost },
      },
      503,
    );
  return json({
    sessionId,
    result: cumulativeResult,
    overlayState: validation.overlayState,
    missingCriticalFields: validation.missingCriticalFields,
    usage: { visionCalls: accurateRetry ? 2 : 1, webCalls, estimatedCostUsd: actualCost },
  });
});
