import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { missingFieldsAfterNotOnLabelConfirmation } from '../_shared/productScanner.ts';
import type { WorkingNumericField } from '../../../src/features/product-intelligence/productFieldTruth.ts';

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

const USER_NUMERIC_FIELDS: Readonly<Record<string, WorkingNumericField>> = Object.freeze({
  energyKcal: 'kcal_per_100g',
  fat: 'fat_percent',
  carbohydrate: 'carbohydrate_percent',
  sugars: 'total_sugars_percent',
  protein: 'protein_percent',
  salt: 'salt_percent',
  fibre: 'fiber_percent',
});

type UserProductFields = {
  nutrition: Partial<Record<keyof typeof USER_NUMERIC_FIELDS, number>>;
  nutritionBasis: 'per_100g' | 'per_100ml' | null;
  ingredientsText: string | null;
  allergensText: string | null;
};

function userProductFields(value: unknown): UserProductFields | null {
  const raw = objectValue(value);
  const nutritionRaw = objectValue(raw.nutrition);
  const nutrition: UserProductFields['nutrition'] = {};
  for (const key of Object.keys(USER_NUMERIC_FIELDS)) {
    const supplied = nutritionRaw[key];
    if (supplied === undefined || supplied === null || supplied === '') continue;
    if (typeof supplied !== 'number' || !Number.isFinite(supplied) || supplied < 0 || supplied > 1000)
      return null;
    if (key !== 'energyKcal' && supplied > 100) return null;
    nutrition[key as keyof typeof USER_NUMERIC_FIELDS] = supplied;
  }
  if (
    typeof nutrition.sugars === 'number' &&
    typeof nutrition.carbohydrate === 'number' &&
    nutrition.sugars > nutrition.carbohydrate
  ) return null;
  const macroMass = ['fat', 'carbohydrate', 'protein', 'fibre', 'salt']
    .reduce((sum, key) => sum + (nutrition[key as keyof typeof USER_NUMERIC_FIELDS] ?? 0), 0);
  if (macroMass > 105) return null;
  return {
    nutrition,
    nutritionBasis:
      raw.nutritionBasis === 'per_100g' || raw.nutritionBasis === 'per_100ml'
        ? raw.nutritionBasis
        : null,
    ingredientsText: text(raw.ingredientsText),
    allergensText: text(raw.allergensText),
  };
}

function applyUserProductFields(
  result: Record<string, unknown>,
  supplied: UserProductFields,
): { result: Record<string, unknown>; confirmed: string[] } {
  const nutrition = { ...objectValue(result.nutrition) };
  const confirmed: string[] = [];
  if (supplied.nutritionBasis) {
    nutrition.basis = supplied.nutritionBasis;
    confirmed.push('nutrition.basis');
  }
  for (const [key, value] of Object.entries(supplied.nutrition)) {
    nutrition[key] = value;
    confirmed.push(`nutrition.${key}`);
  }
  if (Object.keys(supplied.nutrition).length > 0 && !text(nutrition.basis)) {
    nutrition.basis = 'per_100g';
    confirmed.push('nutrition.basis');
  }
  const next = { ...result, nutrition };
  if (supplied.ingredientsText) {
    next.ingredientsText = supplied.ingredientsText;
    confirmed.push('ingredientsText');
  }
  if (supplied.allergensText) {
    next.allergensText = supplied.allergensText;
    confirmed.push('allergensText');
  }
  return { result: next, confirmed };
}

function remainingAfterUserConfirmation(
  missing: readonly string[],
  confirmed: readonly string[],
): string[] {
  const fields = new Set(confirmed);
  return missing.filter((field) => {
    if (field === 'nutrition_basis' && fields.has('nutrition.basis')) return false;
    if (field.startsWith('nutrition_') && fields.has(`nutrition.${field.slice('nutrition_'.length)}`))
      return false;
    if (field === 'ingredientsText' && fields.has('ingredientsText')) return false;
    if (field === 'allergen_confirmation' && fields.has('allergensText')) return false;
    return true;
  });
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
  const validation = objectValue(session.validation_json);
  const missingCriticalFields = Array.isArray(validation.missingCriticalFields)
    ? validation.missingCriticalFields.filter((item): item is string => typeof item === 'string')
    : [];
  const confirmations = objectValue(body.confirmations);
  const suppliedProductFields = userProductFields(confirmations.productFields);
  if (!suppliedProductFields) return json({ error: 'invalid_user_confirmed_product_fields' }, 400);
  const appliedProductFields = applyUserProductFields(
    objectValue(session.result_json),
    suppliedProductFields,
  );
  const scanResult = appliedProductFields.result;
  const notOnLabelFields = Array.isArray(confirmations.notOnLabelFields)
    ? confirmations.notOnLabelFields.filter(
        (item): item is string =>
          typeof item === 'string' &&
          ['barcode', 'net_quantity', 'nutrition', 'ingredients', 'allergens'].includes(item),
      )
    : [];
  const confirmedNoAdditionalAllergenStatement =
    confirmations.noAdditionalAllergenStatementVisible === true;
  const allergenConfirmationPath =
    session.state === 'analyzed' &&
    session.overlay_state === 'SCAN_DRAFT' &&
    missingCriticalFields.length === 1 &&
    missingCriticalFields[0] === 'allergen_confirmation' &&
    validation.highRiskAuthorityRequired !== true &&
    confirmedNoAdditionalAllergenStatement;
  const effectiveNotOnLabelFields =
    allergenConfirmationPath && !notOnLabelFields.includes('allergens')
      ? [...notOnLabelFields, 'allergens']
      : notOnLabelFields;
  const remainingMissingCriticalFields = remainingAfterUserConfirmation(
    missingFieldsAfterNotOnLabelConfirmation(
      missingCriticalFields,
      effectiveNotOnLabelFields,
    ),
    appliedProductFields.confirmed,
  );
  const notOnLabelConfirmationPath =
    session.state === 'analyzed' &&
    session.overlay_state === 'SCAN_DRAFT' &&
    remainingMissingCriticalFields.length === 0 &&
    validation.highRiskAuthorityRequired !== true &&
    (effectiveNotOnLabelFields.length > 0 || appliedProductFields.confirmed.length > 0);
  const confirmedAt = new Date().toISOString();
  const allergenConfirmation = {
    kind: 'no_additional_statement_visible',
    confirmedBy: auth.user.id,
    confirmedAt,
  };
  const effectiveValidation = {
    ...validation,
    missingCriticalFields: notOnLabelConfirmationPath
      ? remainingMissingCriticalFields
      : missingCriticalFields,
    ...(allergenConfirmationPath ? { allergenConfirmation } : {}),
    userConfirmedNotOnLabelFields: effectiveNotOnLabelFields,
    userConfirmedProductFields: appliedProductFields.confirmed,
    ...(notOnLabelConfirmationPath
      ? {
          userNotOnLabelConfirmation: {
            fields: effectiveNotOnLabelFields,
            confirmedBy: auth.user.id,
            confirmedAt,
            semantics: 'absence_only_not_zero_or_none',
          },
        }
      : {}),
  };
  if (allergenConfirmationPath && !text(scanResult.allergensText)) {
    scanResult.allergensText =
      'Osobna deklaracja alergenów niewidoczna na dostarczonej etykiecie — potwierdzone przez użytkownika; nie oznacza to automatycznie braku alergenów.';
    scanResult.warnings = [
      ...new Set([
        ...(Array.isArray(scanResult.warnings)
          ? scanResult.warnings.filter((item): item is string => typeof item === 'string')
          : []),
        'allergen_statement_absence_owner_confirmed',
      ]),
    ];
  }
  if (
    session.state !== 'analyzed' ||
    (!['USABLE_FOR_OWNER', 'PENDING_PUBLICATION'].includes(session.overlay_state) &&
      !notOnLabelConfirmationPath)
  ) {
    return json({ error: 'scan_not_ready_for_creation' }, 409);
  }
  if (new Date(session.expires_at).getTime() <= Date.now())
    return json({ error: 'scan_session_expired' }, 409);

  if (notOnLabelConfirmationPath) {
    const { data: confirmedSession, error: confirmationError } = await service
      .from('product_scan_sessions')
      .update({
        overlay_state: 'USABLE_FOR_OWNER',
        result_json: scanResult,
        validation_json: effectiveValidation,
        updated_at: confirmedAt,
      })
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .eq('state', 'analyzed')
      .eq('overlay_state', 'SCAN_DRAFT')
      .select('id')
      .maybeSingle();
    if (confirmationError || !confirmedSession)
      return json({ error: 'allergen_confirmation_persistence_failed' }, 503);
  }

  // Controlled Catalog boundary: an unknown scan is evidence for an Admin
  // request, never authority to create PM/PR or to enter Picker/Engine. The
  // caller's JWT invokes the ownership-checked request RPC; service-role is
  // deliberately not used for the transition because auth.uid() is part of
  // the database authorization proof.
  const { data: submitted, error: submitError } = await authClient.rpc(
    'gellatti_submit_product_request_v1',
    {
      p_scan_session_id: sessionId,
      p_market_country_code: text(body.marketCountryCode),
      p_idempotency_key: idempotencyKey,
      p_payload: {
        result: scanResult,
        userCorrections: {
          productFields: confirmations.productFields ?? {},
          notOnLabelFields: effectiveNotOnLabelFields,
          noAdditionalAllergenStatementVisible: confirmedNoAdditionalAllergenStatement,
        },
        provenance: {
          scannerSchema: 'gellatti_product_scan_v1',
          scannerSessionId: sessionId,
          modelValidation: effectiveValidation,
          ...(allergenConfirmationPath
            ? { warning: 'absence_of_statement_is_not_no_allergens' }
            : {}),
          userConfirmedProductFields: appliedProductFields.confirmed,
          confirmedAt,
        },
      },
    },
  );
  if (submitError || !submitted) {
    return json({ error: 'product_request_submission_failed' }, 503);
  }
  const requestResult = objectValue(submitted);
  if (requestResult.kind !== 'product_request' && requestResult.kind !== 'existing_product') {
    return json({ error: 'product_request_result_invalid' }, 503);
  }
  await service
    .from('product_scan_sessions')
    .update({
      validation_json: {
        ...effectiveValidation,
        controlledCatalog: true,
        productRequestId: requestResult.requestId ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', auth.user.id);
  return json({
    ...requestResult,
    engineUsable: false,
    usableProductCreated: false,
    controlledCatalog: true,
  });
});
