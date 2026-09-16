import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  EAN_LOOKUP_FIELDS,
  PRODUCT_SCAN_RESPONSE_SCHEMA,
  scanResultFromLookupFacts,
  SYSTEM_PROMPT,
  extractResponseText,
  mergeProductScanResults,
  normalizeValidatedBarcode,
  scannerCaptureFormatForSymbology,
  sha256Text,
  stableJson,
  type AuthoritativeBarcodeIdentity,
  verifyScannerBarcodePayload,
  validateServerResult,
  webCallsInResponse,
} from '../_shared/productScanner.ts';
import { requestedLabelFields } from '../../../src/features/product-scanner/labelAnalysisRequest.ts';
import {
  candidateFromGtinRow,
  exactLookupQueries,
  exactResolverVerdict,
  exactRowsWithRetry,
  isRetryableExactResolverError,
  ExactResolverError,
  type ExactCandidateLike,
  type ExactLookupIdentity,
  type ExactRpcClient,
  type GtinExactRow,
} from '../../../src/features/product-scanner/gtinExactResolver.ts';
// Deno loads these by relative path: the `.ts` extension is REQUIRED on a value import or the
// deploy fails, and nothing in CI can see it.
import {
  rescanReevaluationPlan,
  scanResultFromStoredFacts,
} from '../../../src/features/product-scanner/rescanEvaluation.ts';
import {
  eanLookupVerdict,
  lookupSkippedNoticePl,
} from '../../../src/features/product-scanner/eanLookupOutcome.ts';
import {
  openFoodFactsApiUrl,
  openFoodFactsFactsForExactEan,
} from '../../../src/features/product-scanner/openFoodFactsDirectLookup.ts';

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
const SCANNER_MISSING_FIELDS = new Set([
  'barcode',
  'product_identity',
  'brand_or_unbranded',
  'net_quantity',
  'nutrition',
  'nutrition_basis',
  'nutrition_energyKcal',
  'nutrition_fat',
  'nutrition_carbohydrate',
  'nutrition_sugars',
  'nutrition_protein',
  'nutrition_salt',
  'ingredientsText',
  'allergensText',
  'allergen_confirmation',
  'production_declarations',
]);
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const isOpenFoodFactsSource = (fact: Record<string, unknown>): boolean => {
  if (fact.sourceDomain === 'world.openfoodfacts.org') return true;
  if (typeof fact.sourceUrl !== 'string') return false;
  try {
    return new URL(fact.sourceUrl).hostname === 'world.openfoodfacts.org';
  } catch {
    return false;
  }
};
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

type ExactProductLookup =
  | { kind: 'EXACT_PRODUCT'; product: Record<string, unknown> }
  | { kind: 'NO_EXACT_PRODUCT' }
  | { kind: 'EXACT_CONFLICT'; productIds: readonly string[] }
  | { kind: 'NOT_APPLICABLE' }
  | { kind: 'ERROR'; code: 'UNAVAILABLE' | 'MALFORMED_RESPONSE' };

/** The browser adapter and this Edge function both ask the same caller-scoped exact RPC. */
async function exactRowsForIdentity(
  resolverClient: ExactRpcClient,
  identity: ExactLookupIdentity,
): Promise<{ rows: GtinExactRow[]; candidates: ExactCandidateLike[] }> {
  for (const query of exactLookupQueries(identity)) {
    const rows = await exactRowsWithRetry(resolverClient, query);
    const candidates = rows
      .map((row) => candidateFromGtinRow(row))
      .filter((candidate): candidate is ExactCandidateLike => candidate !== null);
    if (candidates.length > 0) return { rows, candidates };
  }
  return { rows: [], candidates: [] };
}

async function exactProductForBarcode(
  resolverClient: ExactRpcClient,
  identity: ExactLookupIdentity | null,
): Promise<ExactProductLookup> {
  if (!identity) return { kind: 'NOT_APPLICABLE' };
  try {
    const { rows, candidates } = await exactRowsForIdentity(resolverClient, identity);
    const verdict = exactResolverVerdict(candidates);
    if (verdict.kind === 'NO_EXACT_PRODUCT') return verdict;
    if (verdict.kind === 'EXACT_CONFLICT')
      return {
        kind: verdict.kind,
        productIds: verdict.candidates.map((candidate) => candidate.productId),
      };

    const candidate = verdict.product;
    const row = rows.find((item) => item.product_id === candidate.productId);
    if (!row) throw new Error('exact_resolver_row_missing');

    // Identity, lifecycle, visibility and current-version facts come from one RPC row/snapshot.
    // A second table read here could assemble an impossible productId/version/visibility tuple.
    const facts = row.current_version_facts;
    const intelligence = objectValue(facts.productIntelligence);
    const behavior = objectValue(intelligence.productBehaviorAuthority);
    const accuracy = Number(facts.productAccuracy);
    const roleReady =
      behavior.classificationOutcome === 'classified' &&
      (behavior.baseRecipeEligible === true || behavior.toppingEligible === true);
    const privateOverlay = candidates.find(
      (item) =>
        item.productId !== candidate.productId &&
        item.evidence.ownership === 'own' &&
        item.strength !== 'canonical_shared',
    );

    return {
      kind: 'EXACT_PRODUCT',
      product: {
        id: row.product_id,
        // The RPC's matched_gtin records the catalogue key that hit (which may be an explicit
        // EAN-8/UPC alias). The scanner response must carry the already-validated canonical
        // identity, while the row still remains the authority for product/version facts.
        canonical_gtin: identity.canonicalGtin13,
        product_code: row.product_code,
        product_name_display: row.display_name,
        brand: row.brand,
        product_kind: row.product_kind,
        visibility: row.visibility,
        ownership: row.ownership,
        canonical_verification_status: row.verification_status,
        current_version_id: row.current_version_id,
        current_version_facts: facts,
        is_active: row.is_active,
        merged_into_product_id: row.merged_into_product_id,
        stored_facts: facts,
        private_overlay_product_id: privateOverlay?.productId ?? null,
        private_overlay_product_code: privateOverlay?.productCode ?? null,
        product_accuracy: Number.isFinite(accuracy) ? accuracy : null,
        engine_ready: row.engine_usable === true || intelligence.engineUsable === true || roleReady,
      },
    };
  } catch (error) {
    return {
      kind: 'ERROR',
      code:
        error instanceof ExactResolverError
          ? error.code
          : isRetryableExactResolverError(error)
            ? 'UNAVAILABLE'
            : 'MALFORMED_RESPONSE',
    };
  }
}

/**
 * RE-EVALUATE the caller's own private product, through the ONE authority that already decides
 * this. No rule is duplicated here: `product-scan-finalize` re-derives recognition, the Mapper,
 * the rescue, the behaviour and the readiness from the session this function has just re-seeded,
 * and `gellatti_upsert_customer_added_product_v1` applies the single routing rule
 * (`v_ready and v_conf>85 -> PR`) to the result. When that verdict is PR on a product that
 * already exists as this customer's PM, the RPC promotes THAT row — same product id, no second
 * row for the EAN.
 *
 * Nothing paid runs on this path: no photograph is read, no source is called, and the semantic
 * classifier finalize may consult is keyed by evidence fingerprint, so a product whose evidence
 * has not changed reads its stored verdict instead of buying a new one.
 *
 * Any refusal is a legitimate answer — a product that is not production-ready simply stays a PM —
 * so a failure here leaves the stored row untouched and the rescan answers exactly as before.
 */
type OwnPrivateProductReevaluation = {
  attempted: boolean;
  saved: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  reasonCode: string | null;
};

const finalizerErrorCode = (value: unknown): string | null => {
  const candidate = objectValue(value).error;
  return typeof candidate === 'string' && /^[a-z0-9_]{1,120}$/.test(candidate) ? candidate : null;
};

const finalizerReasonCode = (value: unknown): string | null => {
  const candidate = objectValue(value).reasonCode;
  return typeof candidate === 'string' &&
    [
      'scanner_mapper_authority_read_failed',
      'scanner_behavior_authority_read_failed',
      'customer_product_profile_computation_failed',
    ].includes(candidate)
    ? candidate
    : null;
};

async function reevaluateOwnPrivateProduct(input: {
  url: string;
  anonKey: string;
  authorization: string;
  sessionId: string;
}): Promise<OwnPrivateProductReevaluation> {
  try {
    const response = await fetch(`${input.url}/functions/v1/product-scan-finalize`, {
      method: 'POST',
      headers: {
        Authorization: input.authorization,
        apikey: input.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'finalize',
        sessionId: input.sessionId,
        idempotencyKey: `product-scan-rescan-${input.sessionId}`,
        confirmations: {},
        privateOverlay: {},
      }),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // HTTP status remains authoritative when an upstream gateway returns no JSON.
    }
    if (!response.ok)
      return {
        attempted: true,
        saved: false,
        httpStatus: response.status,
        errorCode: finalizerErrorCode(payload),
        reasonCode: finalizerReasonCode(payload),
      };
    const body = objectValue(payload);
    // A newly routed product reports `route`; request-driven revalidation of an existing shared
    // PR reports either its semantic-binding revalidation or a material immutable-version
    // supersession. Refusals, stale assessments and family questions report none of those and
    // must remain unsaved.
    return {
      attempted: true,
      saved:
        typeof body.route === 'string' ||
        body.semanticRevalidated === true ||
        body.versionSuperseded === true,
      httpStatus: response.status,
      errorCode: finalizerErrorCode(body),
      reasonCode: finalizerReasonCode(body),
    };
  } catch {
    return {
      attempted: true,
      saved: false,
      httpStatus: null,
      errorCode: 'product_scan_finalize_transport_failed',
      reasonCode: null,
    };
  }
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
  /*
    The client sends `missingFields: [...session.missingCritical]`. Once web discovery started
    filling every field the readiness check tracks, that array arrived EMPTY — and an empty array
    is still an array, so it was read as a wish list of length zero and the prompt below told the
    model "Requested missing fields only: none. Analyze only those unresolved fields". The model
    complied: HTTP 200, one vision call spent, `evidence: []`, no row in
    product_scan_field_evidence, and the score identical before and after the photograph
    (owner run 2026-09-07, Sport 001 session 6b8f1040 asset b9d15efc: 77.9 -> 77.9).

    Absent and empty now mean the same thing — read the whole label. Narrowing requires naming
    fields, which is what a follow-up photo for one missing field already does.
  */
  const { fields: requestedMissingFields, rejected: invalidMissingFields } = requestedLabelFields(
    body.missingFields as readonly unknown[] | null | undefined,
    SCANNER_MISSING_FIELDS,
  );
  if (invalidMissingFields) {
    return json({ error: 'invalid_missing_fields' }, 400);
  }
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
  const hasBarcodePayload = Object.keys(suppliedBarcode).length > 0;
  const hasCanonicalValue = suppliedBarcode.canonicalValue !== undefined;
  const suppliedRawValue = hasCanonicalValue
    ? suppliedBarcode.rawValue
    : suppliedBarcode.rawValue !== undefined
      ? suppliedBarcode.rawValue
      : suppliedBarcode.value;
  const suppliedCapturedFormat =
    suppliedBarcode.capturedFormat !== undefined
      ? suppliedBarcode.capturedFormat
      : suppliedBarcode.format;
  const barcodeIdentity = hasBarcodePayload
    ? verifyScannerBarcodePayload({
        rawValue: suppliedRawValue,
        capturedFormat: suppliedCapturedFormat,
        ...(suppliedBarcode.canonicalValue !== undefined
          ? { canonicalValue: suppliedBarcode.canonicalValue }
          : {}),
      })
    : null;
  if (barcodeIdentity && !barcodeIdentity.ok) {
    return json({ error: 'invalid_barcode_identity', reason: barcodeIdentity.reason }, 400);
  }
  const incomingBarcode = barcodeIdentity?.ok ? barcodeIdentity.identity.canonicalGtin13 : null;
  const barcodeAuthority: AuthoritativeBarcodeIdentity | string | null = barcodeIdentity?.ok
    ? {
        canonicalValue: barcodeIdentity.identity.canonicalGtin13,
        capturedFormat: scannerCaptureFormatForSymbology(barcodeIdentity.identity.symbology),
        rawValue: barcodeIdentity.identity.rawValue,
      }
    : null;
  const { data: existingSession, error: existingSessionError } = await service
    .from('product_scan_sessions')
    .select('user_id,result_json,validation_json,overlay_state,barcode,vision_calls')
    .eq('id', sessionId)
    .maybeSingle();
  if (existingSessionError) return json({ error: 'scan_session_read_failed' }, 503);
  if (existingSession && existingSession.user_id !== auth.user.id) {
    return json({ error: 'scan_session_ownership_mismatch' }, 403);
  }
  const establishedBarcode = normalizeValidatedBarcode(existingSession?.barcode);
  if (establishedBarcode && incomingBarcode && establishedBarcode !== incomingBarcode) {
    return json({ error: 'scan_session_barcode_conflict' }, 409);
  }
  const barcode = establishedBarcode ?? incomingBarcode;
  // A stored session barcode is already a validated canonical GTIN-13. It carries no new capture
  // alias, so the stored-session fallback deliberately uses the canonical-only RPC query.
  const exactIdentity: ExactLookupIdentity | null = barcodeIdentity?.ok
    ? barcodeIdentity.identity
    : barcode && /^\d{13}$/.test(barcode)
      ? {
          symbology: 'EAN-13',
          canonicalGtin13: barcode,
          lookupKeys: [barcode],
          rawValue: null,
        }
      : null;
  const effectiveBarcodeAuthority = barcodeAuthority ?? barcode;
  if (mode === 'ean_lookup' && !barcode) return json({ error: 'lookup_requires_barcode' }, 400);
  const exactLookup = await exactProductForBarcode(authClient, exactIdentity);
  if (exactLookup.kind === 'ERROR') {
    // ERROR/UNAVAILABLE is not a no-match. Stop before session persistence, OFF, Recognition or
    // any other later Scanner stage can observe a false negative.
    return json({ error: 'exact_resolver_unavailable', code: exactLookup.code }, 503);
  }
  if (exactLookup.kind === 'EXACT_CONFLICT')
    return json(
      {
        error: 'exact_product_conflict',
        kind: 'EXACT_CONFLICT',
        productIds: exactLookup.productIds,
      },
      409,
    );
  const exactNoMatch = exactLookup.kind === 'NO_EXACT_PRODUCT';
  const exact = exactLookup.kind === 'EXACT_PRODUCT' ? exactLookup.product : null;
  // Only the authoritative NO_EXACT_PRODUCT verdict may open the barcode fallback. Image-only
  // analysis is NOT_APPLICABLE and follows its primary Recognition path; ERROR is handled above.
  if (mode === 'ean_lookup' && !exact && !exactNoMatch)
    return json({ error: 'exact_resolver_unavailable' }, 503);
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
    const { error: sessionUpdateError } = await service
      .from('product_scan_sessions')
      .update({
        state: 'matched',
        barcode,
        exact_product_id: exact.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id);
    if (sessionUpdateError) return json({ error: 'scan_session_update_failed' }, 503);
  } else if (!establishedBarcode && barcode) {
    const { error: barcodeUpdateError } = await service
      .from('product_scan_sessions')
      .update({ barcode, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .is('barcode', null);
    if (barcodeUpdateError) return json({ error: 'scan_session_update_failed' }, 503);
  }
  if (mode === 'ean_lookup') {
    // An exact canonical product answers the scan outright: no model, no source call,
    // no allowance. This is the cheap path a rescan of a known package must take (§16).
    if (exact) {
      /*
        RESCAN RE-EVALUATION (owner contract 2026-09-07). Answering from the stored row is right
        and stays free. What was wrong is that it was the WHOLE answer: a product saved earlier
        with weaker evidence was handed back unchanged for ever, because the evaluation that
        could promote it was never reached again.

        So for the caller's OWN private product the session is re-seeded from the evidence that
        product was built from — reused verbatim, nothing re-acquired — and the normal finalize
        authority re-derives the verdict on today's Mapper, rescue and classification. A shared
        PR and a Mapper reference skip this entirely: neither has anything to promote.
      */
      const plan = rescanReevaluationPlan({ productKind: exact.product_kind as string });
      const storedResult = plan.reevaluate ? scanResultFromStoredFacts(exact.stored_facts) : null;
      let current = exact;
      let reevaluation: OwnPrivateProductReevaluation | null = null;
      if (storedResult) {
        const seeded = mergeProductScanResults(storedResult, {}, effectiveBarcodeAuthority);
        const seededValidation = validateServerResult(seeded, []);
        const { error: seedError } = await service.rpc('complete_product_scan_ean_lookup_v1', {
          p_actor_user_id: auth.user.id,
          p_session_id: sessionId,
          p_result: seeded,
          p_validation: {
            missingCriticalFields: seededValidation.missingCriticalFields,
            highRiskAuthorityRequired: seededValidation.highRiskAuthorityRequired,
          },
          p_overlay_state: seededValidation.overlayState,
          // The evidence is REUSED, not bought again. A rescan still costs nothing.
          p_cost_usd: 0,
        });
        if (seedError) {
          reevaluation = {
            attempted: false,
            saved: false,
            httpStatus: null,
            errorCode: 'scan_session_reseed_failed',
            reasonCode: null,
          };
        } else {
          reevaluation = await reevaluateOwnPrivateProduct({
            url,
            anonKey,
            authorization,
            sessionId,
          });
          // Read the row back only when something was actually saved, so the answer carries the
          // PR article code and the readiness the promotion has just granted.
          if (reevaluation.saved) {
            const refreshed = await exactProductForBarcode(authClient, exactIdentity);
            if (refreshed.kind === 'ERROR')
              return json({ error: 'exact_resolver_unavailable', code: refreshed.code }, 503);
            if (refreshed.kind === 'EXACT_PRODUCT') current = refreshed.product;
          }
        }
        /*
          Keep the bounded, non-secret result beside the disposable scan session. Exact-product
          revalidation used to collapse every refusal and transport failure into the same boolean,
          which made a live acceptance failure impossible to distinguish from a legitimate
          fail-closed verdict. This field contains no token, response body or customer data.
        */
        const { data: latestSession, error: latestSessionError } = await service
          .from('product_scan_sessions')
          .select('validation_json')
          .eq('id', sessionId)
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (latestSessionError) return json({ error: 'scan_session_read_failed' }, 503);
        if (latestSession) {
          const { error: latestSessionUpdateError } = await service
            .from('product_scan_sessions')
            .update({
              validation_json: {
                ...objectValue(latestSession.validation_json),
                exactProductReevaluation: reevaluation,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId)
            .eq('user_id', auth.user.id);
          if (latestSessionUpdateError)
            return json({ error: 'scan_session_update_failed' }, 503);
        }
      }
      return json({
        sessionId,
        kind: 'existing_product',
        reevaluated: reevaluation?.saved === true,
        reevaluation,
        product: {
          id: current.id,
          canonicalGtin: current.canonical_gtin,
          displayName: current.product_name_display,
          brand: current.brand ?? null,
          ownership: current.ownership,
          visibility: current.visibility,
          entityKind:
            current.product_kind === 'mapper_reference' ? 'pi_base' : 'commercial_product',
          status:
            current.product_kind === 'mapper_reference'
              ? 'pi_base'
              : current.canonical_verification_status,
          productCode: current.product_code ?? null,
          currentVersionId: current.current_version_id ?? null,
          isActive: current.is_active === true,
          mergedIntoProductId: current.merged_into_product_id ?? null,
          productAccuracy: current.product_accuracy,
          engineReady: current.engine_ready,
        },
        usage: { visionCalls: 0, webCalls: 0, estimatedCostUsd: 0 },
      });
    }
    const { data: lookupReservation, error: lookupReserveError } = await service.rpc(
      'reserve_product_scan_ean_lookup_v1',
      { p_actor_user_id: auth.user.id, p_session_id: sessionId },
    );
    if (lookupReserveError) return json({ error: 'scanner_lookup_preflight_failed' }, 503);
    const lookupReserved = objectValue(lookupReservation);
    if (lookupReserved.allowed !== true) {
      // A refused lookup is not a failure of the scan. The session keeps whatever it
      // has and the flow continues locally (§24).
      const skippedReason = String(lookupReserved.reason ?? 'session_lookup_already_used');
      return json({
        sessionId,
        kind: 'ean_lookup',
        skipped: skippedReason,
        retryable: false,
        notice: lookupSkippedNoticePl(skippedReason),
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
    /*
      DIRECT GTIN LOOKUP (owner approval 2026-09-12).

      `GTIN_LOOKUP` used to be only a sentence in an OpenAI web-search prompt. Search ranking
      could miss a real OpenFoodFacts record even though OFF is already an approved structured
      database. Ask its exact keyless product endpoint first and accept its fields only when the
      response's own `code` is byte-for-byte the normalized scanned EAN. Existing research remains
      available, but only for fields the direct record did not supply.
    */
    let directFacts: Record<string, unknown>[] = [];
    try {
      const endpoint = new URL(openFoodFactsApiUrl(barcode));
      endpoint.searchParams.set(
        'fields',
        [
          'code',
          'product_name',
          'generic_name',
          'brands',
          'quantity',
          'categories',
          'categories_tags',
          'ingredients_text',
          'allergens',
          'allergens_tags',
          'origins',
          'origins_tags',
          'nutrition_data_per',
          'nutriments',
        ].join(','),
      );
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GellattiProductScanner/1.0 (https://pinguinoai.com)',
        },
      });
      if (response.status === 404) {
        directFacts = [];
      } else if (response.ok) {
        directFacts = openFoodFactsFactsForExactEan(
          await response.json(),
          barcode,
          new Date().toISOString(),
        ).facts;
      }
    } catch {
      // The existing research provider below is the bounded fallback for every missing field.
    }

    const directFields = new Set(directFacts.map((fact) => String(fact.field ?? '')));
    const unresolvedLookupFields = EAN_LOOKUP_FIELDS.filter((field) => !directFields.has(field));
    let fallbackFacts: Record<string, unknown>[] = [];
    let fallbackProviderError: string | null = null;
    /** What the provider ACTUALLY did — a cache hit costs nothing and must say so. */
    let providerWebCalls = 0;
    if (unresolvedLookupFields.length > 0) {
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
              brand:
                typeof directFacts.find((fact) => fact.field === 'brand')?.value === 'string'
                  ? directFacts.find((fact) => fact.field === 'brand')?.value
                  : typeof identity.brand === 'string'
                    ? identity.brand
                    : null,
              manufacturer: null,
              name:
                typeof directFacts.find((fact) => fact.field === 'productName')?.value === 'string'
                  ? directFacts.find((fact) => fact.field === 'productName')?.value
                  : typeof identity.displayName === 'string'
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
            fields: unresolvedLookupFields,
          }),
        });
        const payload = objectValue(await response.json());
        if (!response.ok) throw new Error('lookup_provider_failed');
        /*
          OFF was already acquired and exact-EAN verified above. The fallback may supply missing
          manufacturer/retailer facts, but any OFF copy it reports is discarded so it cannot
          become a second registry receipt or independently populate competing OFF fields.
        */
        fallbackFacts = Array.isArray(payload.facts)
          ? payload.facts.map(objectValue).filter((fact) => !isOpenFoodFactsSource(fact))
          : [];
        fallbackProviderError = typeof payload.error === 'string' ? payload.error : null;
        providerWebCalls =
          payload.cacheHit === true ? 0 : Math.max(0, Math.min(3, Number(payload.webCalls ?? 1)));
      } catch {
        fallbackProviderError = 'lookup_provider_unavailable';
      }
    }
    const facts = [...directFacts, ...(fallbackProviderError ? [] : fallbackFacts)];
    const lookupResult = scanResultFromLookupFacts(facts);
    // A usable direct OFF record is already an answer even if research for its remaining fields
    // was temporarily unavailable. With no direct facts, preserve the prior retryable semantics.
    const providerAnswered = directFacts.length > 0 || fallbackProviderError === null;
    const verdict = eanLookupVerdict({
      providerAnswered,
      resultSurvived: lookupResult !== null,
      providerWebCalls,
    });
    /*
      A LOOKUP THAT RESOLVES NOTHING MUST STILL LEAVE A SESSION THE FLOW CAN USE (owner defect
      2026-09-07, session b414f3e6, EAN 8480000804693). `scanResultFromLookupFacts` returns null
      as soon as no external source survives, so a provider that honestly answered "this code is
      in no public source" produced no result, skipped the completion RPC entirely, and left the
      session in `collecting`. The next step of the flow finalizes, finalize accepts only
      `analyzed`, and its 409 carries no `kind` — so the discovery adapter rethrows it and the
      customer reads a generic failure about a lookup that had in fact answered clearly.

      The answer "nothing" is a RESULT. It is persisted like one: the authoritative barcode with
      no other field, which is exactly what is true, and which leaves the session `analyzed` with
      every critical field listed as missing so the flow asks for the label. A provider that never
      answered is different — there is nothing to persist, and the allowance is given back below.
    */
    const merged =
      verdict.outcome === 'provider_unavailable'
        ? null
        : mergeProductScanResults(
            existingSession?.result_json ?? null,
            lookupResult ?? {},
            effectiveBarcodeAuthority,
          );
    const { data: priorAssets, error: priorAssetsError } = await service
      .from('product_scan_assets')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id);
    if (priorAssetsError) return json({ error: 'scan_asset_metadata_failed' }, 503);
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
    /*
      GIVE AN UNSPENT ALLOWANCE BACK. `reserve_product_scan_ean_lookup_v1` increments web_calls
      BEFORE the provider is called and refuses at `web_calls >= 1`, so a provider that never
      answered used to spend the session's only lookup on nothing — and the retry button, which
      reuses the same session id for the life of the mount, could never succeed. Releasing is
      restricted to the case where nothing was billed, and the RPC checks that independently
      against the session, its external sources and the provider's own usage ledger.
    */
    if (verdict.releaseReservation) {
      const { error: releaseError } = await service.rpc('release_product_scan_ean_lookup_v1', {
        p_actor_user_id: auth.user.id,
        p_session_id: sessionId,
      });
      if (releaseError) return json({ error: 'scanner_lookup_release_failed' }, 503);
    }
    return json({
      sessionId,
      kind: 'ean_lookup',
      outcome: verdict.outcome,
      resolvedNothing: verdict.outcome === 'resolved_nothing',
      providerUnavailable: verdict.outcome === 'provider_unavailable',
      /** Whether pressing "try again" on THIS session can produce a different answer. */
      retryable: verdict.retryable,
      /** Plain Polish, ready to show: what happened, and what resolves it. */
      notice: verdict.noticePl,
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

  // Pre-existing implicit any[], surfaced once this file was actually type-checked: `npm run
  // build` never reaches supabase/functions (root tsconfig is `files: []` + refs over src).
  const assetRows: Record<string, unknown>[] = [];
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
        canonicalGtin: exact.canonical_gtin,
        displayName: exact.product_name_display,
        brand: exact.brand ?? null,
        ownership: exact.ownership,
        visibility: exact.visibility,
        entityKind: exact.product_kind === 'mapper_reference' ? 'pi_base' : 'commercial_product',
        status:
          exact.product_kind === 'mapper_reference'
            ? 'pi_base'
            : exact.canonical_verification_status,
        productCode: exact.product_code ?? null,
        currentVersionId: exact.current_version_id ?? null,
        isActive: exact.is_active === true,
        mergedIntoProductId: exact.merged_into_product_id ?? null,
        productAccuracy: exact.product_accuracy,
        engineReady: exact.engine_ready,
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
      requestedMissingFields,
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
      text: `Asset ids: ${images.map((image) => image.assetId).join(', ')}. Barcode observed locally: ${barcode ?? 'none'}. Requested missing fields only: ${requestedMissingFields.join(', ') || 'none'}. Analyze only those unresolved fields from these new assets. Do not repeat or replace fields not requested. Read all visible label languages.`,
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
  let providerDiagnostic: Record<string, unknown> = {};
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
    if (!response.ok) {
      const providerError = objectValue(responsePayload.error);
      providerDiagnostic = {
        providerStatus: response.status,
        providerType:
          typeof providerError.type === 'string' ? providerError.type.slice(0, 100) : null,
        providerCode:
          typeof providerError.code === 'string' ? providerError.code.slice(0, 100) : null,
        providerParam:
          typeof providerError.param === 'string' ? providerError.param.slice(0, 200) : null,
      };
      throw new Error('provider_request_failed');
    }
  } catch {
    const latencyMs = Date.now() - requestStartedAt;
    await service.rpc('complete_product_scan_analysis_v1', {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_reservation_id: reserved.reservationId,
      p_status: 'failed',
      p_result: null,
      p_validation: { error: 'provider_request_failed', ...providerDiagnostic },
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
        providerDiagnostic,
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
  const currentCallResult = mergeProductScanResults(null, result, effectiveBarcodeAuthority);
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
    effectiveBarcodeAuthority,
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
