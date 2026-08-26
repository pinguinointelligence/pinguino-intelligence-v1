import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  normalizeValidatedBarcode,
  productSemanticEvidenceFromScanResult,
} from '../_shared/productScanner.ts';
import { customerProductProfileProposal } from '../_shared/customerProductProfile.ts';
import {
  finalizeProductProductionAccuracy,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../_shared/intimportWholeProfileAuthority.ts';
import {
  validateProductBehaviorAuthority,
  type MapperProductBehaviorAuthorityRow,
} from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';
import {
  classifyProductSemantics,
  type ProductSemanticClassification,
} from '../../../src/features/product-intelligence/productRecognition.ts';
import {
  applyCustomerProductFamily,
  resolveCustomerProductFamily,
  type CustomerProductFamilyChoice,
} from '../../../src/features/product-scanner/customerProductFamily.ts';
import type { ProductEvidenceField } from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';

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
const text = (value: unknown, limit = 10_000): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const finite = (value: unknown, max = 1000): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
type ServiceClient = ReturnType<typeof createClient>;

const MAPPER_AUTHORITY_COLUMNS = [
  'ingredient_id',
  'ingredient_name_internal',
  'ingredient_name_display',
  'brand',
  'ingredient_category',
  'ingredient_subcategory',
  'is_active',
  'approved_for_base',
  'approved_for_engines',
  'verification_status',
  'ean_code',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
  'pod_value',
  'pac_value',
  'sweetness_factor',
  'freezing_factor',
].join(',');
const MAPPER_BEHAVIOR_AUTHORITY_COLUMNS = [
  'id',
  'mapper_ingredient_id',
  'mapper_dataset_version',
  'taxonomy_version_id',
  'family_id',
  'subfamily_id',
  'form_id',
  'main_eligibility',
  'vegan_eligibility',
  'protein_behavior',
  'approved_liquid_dairy_carrier',
  'profile_permissions',
  'process_behavior',
  'classifier_version',
  'behavior_role',
  'main_policy_status',
  'profile_applicability',
  'classification_reason_codes',
  'is_current',
].join(',');

let mapperRowsCache: Promise<IntimportMapperAuthorityRow[]> | null = null;
let behaviorRowsCache: Promise<MapperProductBehaviorAuthorityRow[]> | null = null;

async function loadMapperRows(service: ServiceClient): Promise<IntimportMapperAuthorityRow[]> {
  if (!mapperRowsCache) {
    mapperRowsCache = (async () => {
      const rows: IntimportMapperAuthorityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await service
          .from('mapper_basement')
          .select(MAPPER_AUTHORITY_COLUMNS)
          .eq('is_active', true)
          .order('ingredient_id', { ascending: true })
          .range(offset, offset + 999);
        if (error) throw new Error('scanner_mapper_authority_read_failed');
        const page = (data ?? []) as unknown as IntimportMapperAuthorityRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    })().catch((error: unknown) => {
      mapperRowsCache = null;
      throw error;
    });
  }
  return mapperRowsCache;
}

async function loadBehaviorRows(
  service: ServiceClient,
): Promise<MapperProductBehaviorAuthorityRow[]> {
  if (!behaviorRowsCache) {
    behaviorRowsCache = (async () => {
      const rows: MapperProductBehaviorAuthorityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await service
          .from('mapper_product_behavior_bindings')
          .select(MAPPER_BEHAVIOR_AUTHORITY_COLUMNS)
          .eq('is_current', true)
          .order('mapper_ingredient_id', { ascending: true })
          .range(offset, offset + 999);
        if (error) throw new Error('scanner_behavior_authority_read_failed');
        const page = (data ?? []) as unknown as MapperProductBehaviorAuthorityRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    })().catch((error: unknown) => {
      behaviorRowsCache = null;
      throw error;
    });
  }
  return behaviorRowsCache;
}

const FAMILY_CHOICES = new Set<CustomerProductFamilyChoice>([
  'dairy',
  'fruit',
  'cocoa_chocolate',
  'nut_paste',
  'alcohol',
  'sweetener',
  'beverage',
  'technical',
  'other',
]);

type AppliedCorrections = {
  result: Record<string, unknown>;
  confirmedEvidenceFields: ProductEvidenceField[];
  barcode: string | null;
};

function applyCustomerCorrections(
  original: unknown,
  value: unknown,
  sessionBarcode: unknown,
): AppliedCorrections | null {
  const result = structuredClone(objectValue(original));
  const correction = objectValue(value);
  const identity = { ...objectValue(result.identity) };
  const identityCorrection = objectValue(correction.identity);
  const displayName = text(identityCorrection.displayName, 300);
  const brand = text(identityCorrection.brand, 200);
  if (identityCorrection.displayName !== undefined && !displayName) return null;
  if (displayName) identity.displayName = displayName;
  if (identityCorrection.brand !== undefined) identity.brand = brand;
  if (identityCorrection.explicitlyUnbranded === true) {
    identity.explicitlyUnbranded = true;
    identity.brand = null;
  }
  result.identity = identity;

  const nutrition = { ...objectValue(result.nutrition) };
  const nutritionCorrection = objectValue(correction.nutrition);
  const nutritionKeys = [
    'energyKj',
    'energyKcal',
    'fat',
    'saturatedFat',
    'carbohydrate',
    'sugars',
    'protein',
    'salt',
    'fibre',
  ];
  const confirmed = new Set<ProductEvidenceField>();
  for (const key of nutritionKeys) {
    if (nutritionCorrection[key] === undefined || nutritionCorrection[key] === '') continue;
    const parsed = finite(nutritionCorrection[key], key.startsWith('energy') ? 10_000 : 100);
    if (parsed === null) return null;
    nutrition[key] = parsed;
    const evidenceKey = key === 'fibre' ? 'fiber' : key === 'energyKj' ? null : key;
    if (evidenceKey) confirmed.add(evidenceKey as ProductEvidenceField);
  }
  if (nutritionCorrection.basis !== undefined) {
    if (!['per_100g', 'per_100ml'].includes(String(nutritionCorrection.basis))) return null;
    nutrition.basis = nutritionCorrection.basis;
    confirmed.add('nutritionBasis');
  }
  if (Object.keys(nutritionCorrection).length > 0 && !nutrition.basis) {
    nutrition.basis = 'per_100g';
    confirmed.add('nutritionBasis');
  }
  if (
    typeof nutrition.sugars === 'number' &&
    typeof nutrition.carbohydrate === 'number' &&
    nutrition.sugars > nutrition.carbohydrate
  )
    return null;
  result.nutrition = nutrition;

  for (const [key, field] of [
    ['ingredientsText', 'ingredients'],
    ['allergensText', 'allergens'],
  ] as const) {
    if (correction[key] === undefined) continue;
    const supplied = text(correction[key], 20_000);
    if (!supplied) return null;
    result[key] = supplied;
    confirmed.add(field);
  }

  const declarations = { ...objectValue(result.productionDeclarations) };
  const declarationCorrection = objectValue(correction.productionDeclarations);
  for (const key of [
    'alcoholAbv',
    'cocoaButterPercent',
    'cocoaSolidsPercent',
    'fruitContentPercent',
    'brix',
  ]) {
    if (declarationCorrection[key] === undefined || declarationCorrection[key] === '') continue;
    const parsed = finite(declarationCorrection[key], 100);
    if (parsed === null) return null;
    declarations[key] = parsed;
    confirmed.add('technicalParameters');
  }
  for (const key of [
    'concentrationText',
    'dosageText',
    'technicalParametersText',
    'formDeclaration',
  ]) {
    if (declarationCorrection[key] === undefined) continue;
    const supplied = text(declarationCorrection[key], 5000);
    if (!supplied) return null;
    declarations[key] = supplied;
    confirmed.add(key === 'dosageText' ? 'dosage' : 'technicalParameters');
  }
  result.productionDeclarations = declarations;

  const firstBarcode = Array.isArray(result.barcodes) ? result.barcodes[0] : null;
  const barcode = normalizeValidatedBarcode(
    correction.barcode ?? sessionBarcode ?? objectValue(firstBarcode).value,
  );
  if (barcode) {
    const format = barcode.length === 8 ? 'EAN_8' : barcode.length === 12 ? 'UPC_A' : 'EAN_13';
    const previous = Array.isArray(result.barcodes) ? result.barcodes.slice(1) : [];
    result.barcodes = [{ value: barcode, format }, ...previous];
    confirmed.add('barcode');
  }
  return { result, confirmedEvidenceFields: [...confirmed], barcode };
}

async function serverSemanticClassification(input: {
  url: string;
  anonKey: string;
  authorization: string;
  sessionId: string;
  evidence: ReturnType<typeof productSemanticEvidenceFromScanResult>;
}): Promise<ProductSemanticClassification> {
  const deterministic = classifyProductSemantics(input.evidence);
  if (!deterministic.modelRequired) return deterministic;
  try {
    const response = await fetch(`${input.url}/functions/v1/intimport-enrich`, {
      method: 'POST',
      signal: AbortSignal.timeout(35_000),
      headers: {
        Authorization: input.authorization,
        apikey: input.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_classification',
        importId: `scanner-${input.sessionId}`,
        evidence: input.evidence,
      }),
    });
    if (!response.ok) return deterministic;
    const payload = objectValue(await response.json());
    const classification = objectValue(
      payload.classification,
    ) as unknown as ProductSemanticClassification;
    if (
      classification.authority === 'PRODUCT_RECOGNITION_V2' &&
      classification.classificationSource === 'SERVER_MODEL' &&
      classification.evidenceFingerprint === deterministic.evidenceFingerprint
    )
      return classification;
  } catch {
    // A model outage cannot create authority. Deterministic UNKNOWN is retained
    // and the short family confirmation remains available to the customer.
  }
  return deterministic;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (
    Deno.env.get('PRODUCT_SCANNER_ENABLED') === 'false' ||
    Deno.env.get('PRODUCT_SCANNER_V1_ENABLED') === 'false'
  )
    return json({ error: 'scanner_disabled' }, 503);

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
  const action = body.action === 'preview' ? 'preview' : 'finalize';
  const sessionId = text(body.sessionId, 64);
  const idempotencyKey = text(body.idempotencyKey, 160);
  if (
    !sessionId ||
    !/^[0-9a-f-]{36}$/i.test(sessionId) ||
    !idempotencyKey ||
    idempotencyKey.length < 8
  )
    return json({ error: 'invalid_finalize_request' }, 400);

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: sessionError } = await service
    .from('product_scan_sessions')
    .select(
      'id,user_id,state,result_json,validation_json,overlay_state,barcode,exact_product_id,expires_at',
    )
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (sessionError || !session) return json({ error: 'owned_scan_session_not_found' }, 404);
  if (new Date(session.expires_at).getTime() <= Date.now())
    return json({ error: 'scan_session_expired' }, 409);
  if (session.state === 'finalized' && session.exact_product_id) {
    const { data: product } = await service
      .from('products')
      .select('id,product_code,product_name_display,brand')
      .eq('id', session.exact_product_id)
      .maybeSingle();
    return json({
      kind: 'idempotent',
      productId: product?.id ?? session.exact_product_id,
      productCode: product?.product_code ?? null,
      displayName: product?.product_name_display ?? null,
      brand: product?.brand ?? null,
      engineUsable: true,
      usableProductCreated: true,
    });
  }
  if (session.state !== 'analyzed') return json({ error: 'scan_not_ready_for_creation' }, 409);

  const corrections = applyCustomerCorrections(
    session.result_json,
    objectValue(body.confirmations).productFields,
    session.barcode,
  );
  if (!corrections) return json({ error: 'invalid_user_confirmed_product_fields' }, 400);
  if (!corrections.barcode) return json({ error: 'customer_product_valid_ean_required' }, 409);

  const recognitionEvidence = productSemanticEvidenceFromScanResult(corrections.result);
  let recognition = await serverSemanticClassification({
    url,
    anonKey,
    authorization,
    sessionId,
    evidence: recognitionEvidence,
  });
  const familyChoice = FAMILY_CHOICES.has(body.customerFamily as CustomerProductFamilyChoice)
    ? (body.customerFamily as CustomerProductFamilyChoice)
    : null;
  let familyResolution = resolveCustomerProductFamily(recognition);
  if (familyResolution.status !== 'RESOLVED' && familyChoice) {
    recognition = applyCustomerProductFamily(recognition, familyChoice);
    familyResolution = resolveCustomerProductFamily(recognition);
  }

  const validation = {
    ...objectValue(session.validation_json),
    customerProductFlow: 'CUSTOMER_ADDED_PRODUCT_V1',
    packageEvidenceExhausted: objectValue(body.confirmations).packageEvidenceExhausted === true,
    customerFamily: familyChoice,
    recognition,
  };
  const persistedAt = new Date().toISOString();
  const { data: persisted, error: persistError } = await service
    .from('product_scan_sessions')
    .update({
      result_json: corrections.result,
      validation_json: validation,
      barcode: corrections.barcode,
      updated_at: persistedAt,
    })
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .eq('state', 'analyzed')
    .select('id')
    .maybeSingle();
  if (persistError || !persisted)
    return json({ error: 'scanner_corrections_persistence_failed' }, 503);

  if (familyResolution.status !== 'RESOLVED') {
    return json({
      kind: 'family_confirmation_required',
      recognition,
      familyResolution,
      barcode: corrections.barcode,
    });
  }

  const proposal = customerProductProfileProposal({
    scanResult: corrections.result,
    recognitionEvidence,
    recognition,
    userConfirmedFields: corrections.confirmedEvidenceFields,
  });
  if (!proposal) return json({ error: 'customer_product_identity_required' }, 409);

  let profile;
  let behavior;
  try {
    profile = validateIntimportProductProfileProposal({
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      matchInput: proposal.matchInput,
      declared: proposal.declared,
      declaredBasis: proposal.declaredBasis,
      evidence: proposal.evidence,
      recognitionEvidence: proposal.recognitionEvidence,
      trustedRecognition: proposal.trustedRecognition,
      rows: await loadMapperRows(service),
    });
    if (!profile) return json({ error: 'customer_product_profile_rejected' }, 409);
    behavior = validateProductBehaviorAuthority({
      productProfile: profile,
      behaviorRows: await loadBehaviorRows(service),
    });
    profile = finalizeProductProductionAccuracy(profile, behavior);
  } catch {
    return json({ error: 'customer_product_profile_unavailable' }, 503);
  }

  const roleReady =
    behavior.classificationOutcome === 'classified' &&
    (behavior.baseRecipeEligible || behavior.toppingEligible);
  const ready = profile.productAccuracy >= 85 && roleReady;
  const criticalGaps = [
    ...new Set([
      ...profile.missingEngineFields,
      ...profile.criticalPhysicsBlockers,
      ...behavior.classificationReasonCodes,
    ]),
  ];
  const preview = {
    kind: 'profile_preview',
    barcode: corrections.barcode,
    recognition,
    familyResolution,
    mapper: {
      selectedDonorId: profile.profileReferenceMapperIngredientId,
      similarity: profile.mapperSimilarity,
      basis: profile.mapperProfileBasis,
      estimatedFromMapperIds: profile.estimatedFromMapperIds,
    },
    fieldTruth: profile.fieldTruth,
    technicalComposition: profile.technicalComposition,
    productAccuracy: profile.productAccuracy,
    productAccuracyAssessment: profile.productAccuracyAssessment,
    productBehavior: behavior,
    engineUsable: profile.engineUsable,
    ready,
    criticalGaps,
  };
  if (action === 'preview') return json(preview);
  if (!ready) return json({ ...preview, kind: 'customer_product_not_ready' }, 409);

  const privateOverlay = objectValue(body.privateOverlay);
  if (
    privateOverlay.price !== undefined &&
    privateOverlay.price !== null &&
    privateOverlay.price !== ''
  ) {
    const price = finite(privateOverlay.price, 1_000_000);
    if (price === null) return json({ error: 'invalid_private_price' }, 400);
    privateOverlay.price = price;
  }
  const { data: saved, error: saveError } = await service.rpc(
    'gellatti_upsert_customer_added_product_v1',
    {
      p_actor_user_id: auth.user.id,
      p_session_id: sessionId,
      p_idempotency_key: idempotencyKey,
      p_scan_result: corrections.result,
      p_product_profile: profile,
      p_product_behavior: behavior,
      p_private_overlay: privateOverlay,
    },
  );
  if (saveError || !saved) return json({ error: 'customer_product_persistence_failed' }, 503);
  return json({
    ...objectValue(saved),
    engineUsable: profile.engineUsable,
    usableProductCreated: true,
    controlledCatalog: false,
    recognition,
    mapper: preview.mapper,
  });
});
