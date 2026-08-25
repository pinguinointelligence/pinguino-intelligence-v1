import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  missingFieldsAfterNotOnLabelConfirmation,
  productSemanticEvidenceFromScanResult,
  sha256Text,
  stableJson,
} from '../_shared/productScanner.ts';
import {
  finalizeProductProductionAccuracy,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
  type IntimportTrustedProductProfile,
} from '../_shared/intimportWholeProfileAuthority.ts';
import type { ProfileMatchInput } from '../../../src/features/product-intelligence/mapperValueInference.ts';
import type {
  EvidenceSource,
  ProductEvidenceField,
  ProductEvidenceInput,
} from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import type { WorkingNumericField } from '../../../src/features/product-intelligence/productFieldTruth.ts';
import type { CarbonationEvidence } from '../../../src/data/products/carbonation.ts';
import {
  validateProductBehaviorAuthority,
  type MapperProductBehaviorAuthorityRow,
  type TrustedProductBehaviorAuthority,
} from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';

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

const MAPPER_AUTHORITY_COLUMNS = [
  'ingredient_id', 'ingredient_name_internal', 'ingredient_name_display', 'brand',
  'ingredient_category', 'ingredient_subcategory', 'is_active', 'approved_for_base',
  'approved_for_engines', 'verification_status', 'ean_code', 'water_percent',
  'total_solids_percent', 'fat_percent', 'protein_percent', 'carbohydrate_percent',
  'total_sugars_percent', 'sucrose_percent', 'dextrose_percent', 'glucose_percent',
  'fructose_percent', 'lactose_percent', 'polyol_percent', 'fiber_percent',
  'salt_percent', 'alcohol_percent', 'kcal_per_100g', 'pod_value', 'pac_value',
  'sweetness_factor', 'freezing_factor',
].join(',');

const MAPPER_BEHAVIOR_AUTHORITY_COLUMNS = [
  'id', 'mapper_ingredient_id', 'mapper_dataset_version', 'taxonomy_version_id',
  'family_id', 'subfamily_id', 'form_id', 'main_eligibility', 'vegan_eligibility',
  'protein_behavior', 'approved_liquid_dairy_carrier', 'profile_permissions',
  'process_behavior', 'classifier_version', 'behavior_role', 'main_policy_status',
  'profile_applicability', 'classification_reason_codes', 'is_current',
].join(',');

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

async function loadMapperAuthorityRows(service: ReturnType<typeof createClient>) {
  const rows: IntimportMapperAuthorityRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service
      .from('mapper_basement')
      .select(MAPPER_AUTHORITY_COLUMNS)
      .order('ingredient_id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error('product_profile_mapper_read_failed');
    const page = (data ?? []) as unknown as IntimportMapperAuthorityRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function loadMapperBehaviorAuthorityRows(
  service: ReturnType<typeof createClient>,
): Promise<MapperProductBehaviorAuthorityRow[]> {
  const rows: MapperProductBehaviorAuthorityRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service
      .from('mapper_product_behavior_bindings')
      .select(MAPPER_BEHAVIOR_AUTHORITY_COLUMNS)
      .eq('is_current', true)
      .order('mapper_ingredient_id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error('product_behavior_mapper_read_failed');
    const page = (data ?? []) as unknown as MapperProductBehaviorAuthorityRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

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

const sourceForPath = (
  result: Record<string, unknown>,
  path: string,
  userConfirmed: ReadonlySet<string>,
): EvidenceSource | null => {
  if (userConfirmed.has(path)) return 'user_confirmed';
  const direct = Array.isArray(result.evidence)
    ? result.evidence.map(objectValue).find((item) => item.field === path)
    : null;
  if (direct) {
    if (direct.source === 'label') return 'label';
    if (direct.source === 'manufacturer') return 'manufacturer';
    if (direct.source === 'barcode_registry') return 'barcode_registry';
    if (direct.source === 'retailer') return 'retailer';
  }
  const external = Array.isArray(result.externalSources)
    ? result.externalSources.map(objectValue).find(
        (item) => Array.isArray(item.fieldsUsed) && item.fieldsUsed.includes(path),
      )
    : null;
  if (!external) return null;
  if (external.sourceType === 'manufacturer') return 'manufacturer';
  if (external.sourceType === 'barcode_registry') return 'barcode_registry';
  if (external.sourceType === 'retailer') return 'retailer';
  return 'web_search';
};

async function trustedPmProfile(input: {
  service: ReturnType<typeof createClient>;
  result: Record<string, unknown>;
  userConfirmed: readonly string[];
  highRisk: boolean;
}): Promise<IntimportTrustedProductProfile> {
  const identity = objectValue(input.result.identity);
  const packageValue = objectValue(input.result.package);
  const nutrition = objectValue(input.result.nutrition);
  const barcode = Array.isArray(input.result.barcodes)
    ? text(objectValue(input.result.barcodes[0]).value)
    : null;
  const confirmed = new Set(input.userConfirmed);
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {};
  const setEvidence = (field: ProductEvidenceField, path: string, present: boolean) => {
    if (!present) return;
    const source = sourceForPath(input.result, path, confirmed);
    if (source) fields[field] = source;
  };
  setEvidence('identity', 'identity.displayName', Boolean(text(identity.displayName) || text(identity.originalName)));
  setEvidence('brand', 'identity.brand', Boolean(text(identity.brand) || identity.explicitlyUnbranded === true));
  setEvidence('variant', 'identity.variant', Boolean(text(identity.variant)));
  setEvidence('countryOfOrigin', 'identity.countryOfOrigin', Boolean(text(identity.countryOfOrigin)));
  setEvidence('manufacturer', 'manufacturer', Boolean(input.result.manufacturer));
  setEvidence('netQuantity', 'package.netQuantity', typeof packageValue.netQuantity === 'number');
  setEvidence('ingredients', 'ingredientsText', Boolean(text(input.result.ingredientsText)));
  setEvidence('allergens', 'allergensText', Boolean(text(input.result.allergensText)));
  for (const field of ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'] as const) {
    setEvidence(field, `nutrition.${field}`, typeof nutrition[field] === 'number');
  }
  if (barcode) fields.barcode = 'label';

  const declared: Partial<Record<WorkingNumericField, number>> = {};
  const declaredBasis: Partial<Record<WorkingNumericField, 'product_declared' | 'user_confirmed'>> = {};
  for (const [nutritionField, workingField] of Object.entries(USER_NUMERIC_FIELDS)) {
    // Per-100 ml facts remain truthful nutrition evidence, but cannot be used as
    // mass percentages without density. Mapper may fill that gap; we never copy
    // the volume number into the Engine profile.
    if (nutrition.basis !== 'per_100g') continue;
    const value = nutrition[nutritionField];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    declared[workingField] = value;
    declaredBasis[workingField] = confirmed.has(`nutrition.${nutritionField}`)
      ? 'user_confirmed'
      : 'product_declared';
  }
  const matchInput: ProfileMatchInput = {
    name: text(identity.displayName) ?? text(identity.originalName),
    variant: text(identity.variant),
    brand: text(identity.brand),
    category: text(identity.category),
    subcategory: null,
    barcode,
    knownMacros: {
      ...(typeof declared.fat_percent === 'number' ? { fat_percent: declared.fat_percent } : {}),
      ...(typeof declared.protein_percent === 'number' ? { protein_percent: declared.protein_percent } : {}),
      ...(typeof declared.carbohydrate_percent === 'number'
        ? { carbohydrate_percent: declared.carbohydrate_percent }
        : {}),
      ...(typeof declared.total_sugars_percent === 'number'
        ? { total_sugars_percent: declared.total_sugars_percent }
        : {}),
      ...(typeof declared.fiber_percent === 'number' ? { fiber_percent: declared.fiber_percent } : {}),
      ...(typeof declared.salt_percent === 'number' ? { salt_percent: declared.salt_percent } : {}),
    },
    technical: input.highRisk,
  };
  const evidence: ProductEvidenceInput = {
    kind: input.highRisk ? 'technical' : 'normal_food',
    fields,
    validatedBarcode: barcode !== null,
    exactCanonicalMatch: false,
    mapperFamilyMatch: false,
    materialConflicts: Array.isArray(input.result.conflicts)
      ? input.result.conflicts.map(objectValue).flatMap((conflict) =>
          conflict.retainedSource === null && typeof conflict.field === 'string'
            ? [conflict.field]
            : [],
        )
      : [],
  };
  const carbonationEvidence: CarbonationEvidence[] = [];
  const ingredientsAssertion = text(input.result.ingredientsText);
  const ingredientsSource = sourceForPath(input.result, 'ingredientsText', confirmed);
  const exactCarbonationSource =
    ingredientsSource === 'label'
      ? 'EXACT_LABEL'
      : ingredientsSource === 'manufacturer'
        ? 'EXACT_MANUFACTURER'
        : ingredientsSource === 'barcode_registry'
          ? 'EXACT_EAN_PRODUCT'
          : ingredientsSource === 'retailer'
            ? 'EXACT_AUTHORITATIVE_RETAILER'
            : null;
  if (ingredientsAssertion && exactCarbonationSource) {
    carbonationEvidence.push({
      source: exactCarbonationSource,
      assertion: ingredientsAssertion,
      assertionPath: 'ingredientsText',
      sourceUrl: null,
      sourceDomain: null,
      sourceAuthorityClass: ingredientsSource,
      evidenceReceipt: null,
      retrievedAt: null,
    });
  }
  const authority = validateIntimportProductProfileProposal({
    origin: 'PM',
    proposedMapperIngredientId: null,
    matchInput,
    recognitionEvidence: productSemanticEvidenceFromScanResult(input.result),
    declared,
    declaredBasis,
    evidence,
    carbonationEvidence,
    rows: await loadMapperAuthorityRows(input.service),
  });
  if (!authority) throw new Error('pm_product_profile_rejected');
  return authority;
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

  const input = canonicalInput(scanResult);
  let productProfileAuthority: IntimportTrustedProductProfile;
  let productBehaviorAuthority: TrustedProductBehaviorAuthority;
  try {
    productProfileAuthority = await trustedPmProfile({
      service,
      result: scanResult,
      userConfirmed: appliedProductFields.confirmed,
      highRisk: effectiveValidation.highRiskAuthorityRequired === true,
    });
  } catch {
    await releaseCreationSlot();
    return json({ error: 'pm_product_profile_unavailable' }, 503);
  }
  try {
    productBehaviorAuthority = validateProductBehaviorAuthority({
      productProfile: productProfileAuthority,
      behaviorRows: await loadMapperBehaviorAuthorityRows(service),
    });
    productProfileAuthority = finalizeProductProductionAccuracy(
      productProfileAuthority,
      productBehaviorAuthority,
    );
  } catch {
    await releaseCreationSlot();
    return json({ error: 'pm_product_behavior_unavailable' }, 503);
  }
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
      modelValidation: effectiveValidation,
      conflicts: scanResult.conflicts ?? [],
      ownerConfirmations: notOnLabelConfirmationPath
        ? allergenConfirmationPath
          ? {
              noAdditionalAllergenStatementVisible: true,
              warning: 'absence_of_statement_is_not_no_allergens',
              notOnLabelFields: effectiveNotOnLabelFields,
            }
          : {
              notOnLabelFields: effectiveNotOnLabelFields,
              warning: 'absence_only_not_zero_or_none',
            }
        : {},
      userConfirmedProductFields: {
        fields: appliedProductFields.confirmed,
        provenance: 'USER_CONFIRMED',
        confirmedAt,
      },
      // Raw image bytes and private overlay are deliberately absent.
    },
    p_private_overlay: privateOverlay,
    p_risk: {
      rateReservationId: preflightResult.reservationId,
      preflightPayloadHash: payloadHash,
      productProfileAuthority,
      productBehaviorAuthority,
    },
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
  return json({
    ...result,
    productBehaviorAuthority,
    productAccuracy: productProfileAuthority.productAccuracy,
    rawProductAccuracy: productProfileAuthority.productAccuracyAssessment.rawProductAccuracy,
    productAccuracyAssessment: productProfileAuthority.productAccuracyAssessment,
    readiness: productProfileAuthority.readiness,
    engineUsable: productProfileAuthority.engineUsable,
    missingEngineFields: productProfileAuthority.missingEngineFields,
    criticalPhysicsBlockers: productProfileAuthority.criticalPhysicsBlockers,
    sweetnessPath: productProfileAuthority.sweetnessPath,
    mapperCandidatesBeforeFilter: productProfileAuthority.mapperCandidatesBeforeFilter,
    mapperCandidatesAfterFilter: productProfileAuthority.mapperCandidatesAfterFilter,
    mapperRejectedCandidates: productProfileAuthority.mapperRejectedCandidates,
    selectedMapperDonor: productProfileAuthority.profileReferenceMapperIngredientId,
    mapperSimilarity: productProfileAuthority.mapperSimilarity,
    allergenEvidenceStatus: productProfileAuthority.allergenEvidenceStatus,
    ingredientsEvidenceStatus: productProfileAuthority.ingredientsEvidenceStatus,
    carbonationStatus: productProfileAuthority.carbonation.status,
    carbonation: productProfileAuthority.carbonation,
  });
});
