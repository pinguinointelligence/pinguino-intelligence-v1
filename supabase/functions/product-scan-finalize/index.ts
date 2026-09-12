import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  mergeProductScanResults,
  normalizeValidatedBarcode,
  productSemanticEvidenceFromScanResult,
  scanResultFromLookupFacts,
  stableJson,
} from '../_shared/productScanner.ts';
import {
  buildAccumulatedScannerEvidence,
  researchFieldsForScannerGaps,
} from '../_shared/scannerRescuePipeline.ts';
import { customerProductProfileProposal } from '../_shared/customerProductProfile.ts';
import {
  SCAN_ASSESSMENT_VERSION,
  carryForwardRecognition,
  mergeConfirmedEvidenceFields,
  readPersistedScanEvidence,
  recognitionIsResolved,
  scanAssessmentSnapshot,
} from '../_shared/scanAssessment.ts';
import { type IntimportMapperAuthorityRow } from '../_shared/intimportWholeProfileAuthority.ts';
import {
  supportsSemanticBehaviorReference,
  type MapperProductBehaviorAuthorityRow,
} from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';
import {
  usesStandaloneToppingOnboardingAuthority,
  validateSharedProductOnboarding,
} from '../_shared/sharedProductOnboarding.ts';
import { buildSharedProductSemanticBindingProposal } from '../_shared/sharedProductSemanticBinding.ts';
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
import { publicationIdentityEligibilityFromScanResult } from '../../../src/features/product-scanner/productPublicationEligibility.ts';
import { resolveProductScanFinalizeContract } from '../../../src/features/product-scanner/productScanFinalizeContract.ts';
import { AUTHORITY_PAGE_SIZE, readAuthorityPage } from '../_shared/authorityPagination.ts';

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
const productProfileUnavailable = (error: unknown) => {
  const internalCode = error instanceof Error ? error.message : '';
  const reasonCode = [
    'scanner_mapper_authority_read_failed',
    'scanner_behavior_authority_read_failed',
  ].includes(internalCode)
    ? internalCode
    : 'customer_product_profile_computation_failed';
  return json({ error: 'customer_product_profile_unavailable', reasonCode }, 503);
};
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit = 10_000): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const finite = (value: unknown, max = 1000): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
// The generated Database schema is not available in the Edge bundle, so the
// Supabase client must retain its library-provided untyped database generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = ReturnType<typeof createClient<any, 'public', any>>;

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
      for (let offset = 0; ; offset += AUTHORITY_PAGE_SIZE) {
        const page = await readAuthorityPage<IntimportMapperAuthorityRow>(
          () =>
            service
              .from('mapper_basement')
              .select(MAPPER_AUTHORITY_COLUMNS)
              .eq('is_active', true)
              .order('ingredient_id', { ascending: true })
              .range(offset, offset + AUTHORITY_PAGE_SIZE - 1),
          'scanner_mapper_authority_read_failed',
        );
        rows.push(...page);
        if (page.length < AUTHORITY_PAGE_SIZE) break;
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
      for (let offset = 0; ; offset += AUTHORITY_PAGE_SIZE) {
        const page = await readAuthorityPage<MapperProductBehaviorAuthorityRow>(
          () =>
            service
              .from('mapper_product_behavior_bindings')
              .select(MAPPER_BEHAVIOR_AUTHORITY_COLUMNS)
              .eq('is_current', true)
              .order('mapper_ingredient_id', { ascending: true })
              .range(offset, offset + AUTHORITY_PAGE_SIZE - 1),
          'scanner_behavior_authority_read_failed',
        );
        rows.push(...page);
        if (page.length < AUTHORITY_PAGE_SIZE) break;
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
const PRODUCT_EVIDENCE_FIELDS = new Set<ProductEvidenceField>([
  'identity',
  'brand',
  'manufacturer',
  'variant',
  'netQuantity',
  'ingredients',
  'allergens',
  'nutritionBasis',
  'energyKcal',
  'fat',
  'carbohydrate',
  'sugars',
  'fiber',
  'protein',
  'salt',
  'barcode',
  'countryOfOrigin',
  'dosage',
  'technicalParameters',
  'technicalSource',
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
  customerAction: boolean,
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
    if (customerAction && evidenceKey) confirmed.add(evidenceKey as ProductEvidenceField);
  }
  // Only a name (and a brand, or explicit "no brand") submitted by the customer form may become
  // customer-confirmed. Automatic exact-GTIN facts use the separate external-source ledger below.
  if (customerAction && displayName) confirmed.add('identity');
  if (customerAction && (brand || identityCorrection.explicitlyUnbranded === true))
    confirmed.add('brand');
  if (nutritionCorrection.basis !== undefined) {
    if (!['per_100g', 'per_100ml'].includes(String(nutritionCorrection.basis))) return null;
    nutrition.basis = nutritionCorrection.basis;
    if (customerAction) confirmed.add('nutritionBasis');
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
    if (customerAction) confirmed.add(field);
  }

  const declarations = { ...objectValue(result.productionDeclarations) };
  const declarationCorrection = objectValue(correction.productionDeclarations);
  for (const key of [
    'alcoholAbv',
    'cocoaButterPercent',
    'cocoaSolidsPercent',
    'fruitContentPercent',
    'brix',
    'waterPercent',
    'totalSolidsPercent',
  ]) {
    if (declarationCorrection[key] === undefined || declarationCorrection[key] === '') continue;
    const parsed = finite(declarationCorrection[key], 100);
    if (parsed === null) return null;
    declarations[key] = parsed;
    if (customerAction) confirmed.add('technicalParameters');
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
    if (customerAction) confirmed.add(key === 'dosageText' ? 'dosage' : 'technicalParameters');
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
    if (customerAction && correction.barcode !== undefined) confirmed.add('barcode');
  }
  return { result, confirmedEvidenceFields: [...confirmed], barcode };
}

function setPathIfMissing(root: Record<string, unknown>, path: string, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const parts = path.split('.');
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const next = objectValue(cursor[part]);
    cursor[part] = next;
    cursor = next;
  }
  const key = parts.at(-1)!;
  if (cursor[key] !== null && cursor[key] !== undefined && cursor[key] !== '') return false;
  cursor[key] = value;
  return true;
}

function isTrustedExactRegistryUrl(value: string, barcode: string): boolean {
  try {
    const source = new URL(value);
    return (
      source.protocol === 'https:' &&
      source.hostname === 'world.openfoodfacts.org' &&
      source.pathname === `/product/${barcode}`
    );
  } catch {
    return false;
  }
}

/** Automatic OFF/registry facts are exact-source evidence, never customer confirmations. */
function applyAutomaticEvidence(
  original: unknown,
  value: unknown,
  sessionBarcode: unknown,
): Record<string, unknown> | null {
  const bundle = objectValue(value);
  if (Object.keys(bundle).length === 0) return structuredClone(objectValue(original));
  if (bundle.source !== 'barcode_registry') return null;
  const barcode = normalizeValidatedBarcode(sessionBarcode);
  const exactGtin = normalizeValidatedBarcode(bundle.exactGtin);
  const sourceUrl = text(bundle.sourceUrl, 2000);
  if (
    !barcode ||
    exactGtin !== barcode ||
    !sourceUrl ||
    !isTrustedExactRegistryUrl(sourceUrl, barcode)
  )
    return null;

  const fields = objectValue(bundle.productFields);
  const identity = objectValue(fields.identity);
  const nutrition = objectValue(fields.nutrition);
  const packageValue = objectValue(fields.package);
  const result = mergeProductScanResults(original, {}, barcode);
  const fieldsUsed: string[] = [];
  const fill = (path: string, supplied: unknown) => {
    if (setPathIfMissing(result, path, supplied)) fieldsUsed.push(path);
  };
  fill('identity.displayName', text(identity.displayName, 300));
  fill('identity.brand', text(identity.brand, 200));
  fill('identity.variant', text(identity.variant, 300));
  fill('identity.category', text(identity.category, 300));
  const netQuantity = finite(packageValue.netQuantity, 1_000_000);
  const quantityUnit = text(packageValue.unit, 10)?.toLowerCase() ?? null;
  const quantityText = text(packageValue.netQuantityText, 500);
  if (netQuantity !== null && ['kg', 'g', 'ml', 'l'].includes(quantityUnit ?? '')) {
    fill('package.netQuantity', netQuantity);
    fill('package.unit', quantityUnit);
    fill('package.netQuantityText', quantityText);
  }
  for (const key of [
    'energyKj',
    'energyKcal',
    'fat',
    'saturatedFat',
    'carbohydrate',
    'sugars',
    'protein',
    'salt',
    'fibre',
  ]) {
    const parsed = finite(nutrition[key], key.startsWith('energy') ? 10_000 : 100);
    if (parsed !== null) fill(`nutrition.${key}`, parsed);
  }
  if (nutrition.basis === 'per_100g' || nutrition.basis === 'per_100ml')
    fill('nutrition.basis', nutrition.basis);
  fill('ingredientsText', text(fields.ingredientsText, 20_000));
  fill('allergensText', text(fields.allergensText, 20_000));

  const existingSources = Array.isArray(result.externalSources) ? result.externalSources : [];
  result.externalSources = [
    ...existingSources,
    {
      sourceType: 'barcode_registry',
      url: sourceUrl,
      title: null,
      fieldsUsed,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      sourceStatedEan: barcode,
      sourceEanConfirmationMethod: 'url',
      sourceEanConfirmedAt: new Date(
        typeof bundle.queriedAt === 'number' ? bundle.queriedAt : Date.now(),
      ).toISOString(),
    },
  ];
  return result;
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

async function serverTargetedScannerResearch(input: {
  url: string;
  anonKey: string;
  authorization: string;
  sessionId: string;
  barcode: string;
  scanResult: Record<string, unknown>;
  recognition: ProductSemanticClassification;
  fieldTruth: unknown;
  unresolvedFields: readonly string[];
  readinessContext: unknown;
}): Promise<{ result: Record<string, unknown>; applied: boolean; requestedFields: string[] }> {
  const requestedFields = researchFieldsForScannerGaps(input.unresolvedFields);
  if (requestedFields.length === 0)
    return { result: input.scanResult, applied: false, requestedFields };
  const accumulatedEvidence = buildAccumulatedScannerEvidence({
    scanResult: input.scanResult,
    recognition: input.recognition,
    fieldTruth: input.fieldTruth,
    unresolvedFields: input.unresolvedFields,
    readinessContext: input.readinessContext,
  });
  const semanticEvidence = productSemanticEvidenceFromScanResult(input.scanResult);
  const packageValue = objectValue(input.scanResult.package);
  const netQuantity =
    typeof packageValue.netQuantity === 'number' && typeof packageValue.unit === 'string'
      ? `${packageValue.netQuantity} ${packageValue.unit}`
      : null;
  try {
    const response = await fetch(`${input.url}/functions/v1/intimport-enrich`, {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: {
        Authorization: input.authorization,
        apikey: input.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        importId: `scanner-${input.sessionId}`,
        product: {
          brand: semanticEvidence.brand,
          manufacturer: semanticEvidence.manufacturer,
          name: semanticEvidence.name,
          variant: semanticEvidence.variant,
          barcode: input.barcode,
          netQuantity,
          knownSourceUrl: semanticEvidence.sourceUrls[0] ?? null,
        },
        fields: requestedFields,
        researchStep: { kind: 'OPEN_WEB_SEARCH', allowedDomains: [] },
        accumulatedEvidence,
      }),
    });
    if (!response.ok) return { result: input.scanResult, applied: false, requestedFields };
    const payload = objectValue(await response.json());
    const facts = Array.isArray(payload.facts) ? payload.facts.map(objectValue) : [];
    const partial = scanResultFromLookupFacts(facts);
    if (!partial) return { result: input.scanResult, applied: false, requestedFields };
    const merged = mergeProductScanResults(input.scanResult, partial, input.barcode);
    return {
      result: merged,
      applied: stableJson(merged) !== stableJson(input.scanResult),
      requestedFields,
    };
  } catch {
    // Provider or network failure cannot erase evidence or reduce readiness. The unchanged
    // accumulated scan continues to the exact-question/private-review route.
    return { result: input.scanResult, applied: false, requestedFields };
  }
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
  /*
    OWNER CONTRACT 2026-09-07 — three actions, not two.

    'preview'          — dry run, nothing is written.
    'finalize'         — the normal save. A product that is not production-ready still stops here
                         with 409 `customer_product_not_ready`, because the customer must first be
                         OFFERED the completion form; that refusal is what opens it.
    'save_unverified'  — the customer skipped or abandoned that form, or the data is still missing
                         after the whole rescue. The product is then persisted as PM UNVERIFIED
                         instead of being thrown away. It is a DELIBERATE customer action: nothing
                         auto-saves an unverified product behind their back.
  */
  const action =
    body.action === 'preview'
      ? 'preview'
      : body.action === 'save_unverified'
        ? 'save_unverified'
        : 'finalize';
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
      .select('id,product_code,product_name_display,brand,current_version_id')
      .eq('id', session.exact_product_id)
      .maybeSingle();
    /*
      A REPEATED FINALIZE MUST REPORT WHAT WAS SAVED. This branch used to answer usable-and-created
      unconditionally, so pressing save twice on an UNVERIFIED product turned it into a usable one in
      the client's eyes and re-enabled the recipe button the routing verdict had just refused.
      Readiness is read back from the saved version through the SAME predicate
      `gellatti_my_unverified_products_v1` uses — never re-derived here.
    */
    const { data: version } = product?.current_version_id
      ? await service
          .from('product_versions')
          .select('facts')
          .eq('id', product.current_version_id)
          .maybeSingle()
      : { data: null };
    const savedIntelligence = objectValue(
      objectValue(objectValue(version).facts).productIntelligence,
    );
    const savedReady =
      objectValue(objectValue(savedIntelligence.productAccuracyAssessment).gellattiReadiness)
        .ready === true;
    const savedCode = typeof product?.product_code === 'string' ? product.product_code : null;
    return json({
      kind: 'idempotent',
      productId: product?.id ?? session.exact_product_id,
      productCode: savedCode,
      displayName: product?.product_name_display ?? null,
      brand: product?.brand ?? null,
      route: savedCode?.startsWith('PR-ING-') ? 'PR' : savedReady ? 'PM_READY' : 'PM_UNVERIFIED',
      productionReady: savedReady,
      engineUsable: savedReady,
      usableProductCreated: savedReady,
    });
  }
  if (session.state !== 'analyzed') return json({ error: 'scan_not_ready_for_creation' }, 409);

  const contract = resolveProductScanFinalizeContract(body);
  if (contract.mode === 'unsupported')
    return json({ error: 'unsupported_finalize_contract_version' }, 400);
  const automaticResult = applyAutomaticEvidence(
    session.result_json,
    contract.automaticEvidence,
    session.barcode,
  );
  if (!automaticResult) return json({ error: 'invalid_automatic_product_evidence' }, 400);
  const confirmationEnvelope = objectValue(body.confirmations);
  const corrections = applyCustomerCorrections(
    automaticResult,
    contract.customerProductFields,
    session.barcode,
    contract.customerAction,
  );
  if (!corrections) return json({ error: 'invalid_user_confirmed_product_fields' }, 400);
  if (!corrections.barcode) return json({ error: 'customer_product_valid_ean_required' }, 409);

  /*
    A SCAN ACCUMULATES; ONE REQUEST NEVER SUBTRACTS FROM IT.

    `applyCustomerCorrections` can only see the confirmations THIS request carries, and the
    completion form only ever shows what is still missing — so every later round legitimately
    carries fewer fields than the one before it. The corrected result is written back onto the
    session, so on the next call the customer's VALUES are still there while their PROVENANCE is
    gone, and every field they typed comes back as `mapper_similar_profile/ESTIMATED`. Reproduced
    against the deployed function on one session: 90 → 73.4 → 90, driven by nothing but whether the
    request repeated the answers, with `INGREDIENTS_EVIDENCE_REQUIRED` raised for an ingredient text
    that was sitting on the session. 73.4 is the number the owner's Cola Zero was saved with.
  */
  const persistedScan = readPersistedScanEvidence(session.validation_json);
  const confirmedEvidenceFields = mergeConfirmedEvidenceFields(
    persistedScan.confirmedFields,
    corrections.confirmedEvidenceFields,
  ).filter((field): field is ProductEvidenceField =>
    PRODUCT_EVIDENCE_FIELDS.has(field as ProductEvidenceField),
  );
  let publicationEligibility = publicationIdentityEligibilityFromScanResult(
    corrections.result,
    confirmedEvidenceFields,
  );
  corrections.result.publicationEligibility = publicationEligibility;

  let recognitionEvidence = productSemanticEvidenceFromScanResult(corrections.result);
  const deterministicRecognition = classifyProductSemantics(recognitionEvidence);
  const reusableRecognition = carryForwardRecognition({
    fresh: deterministicRecognition as unknown as Record<string, unknown>,
    persisted: persistedScan.recognition,
  });
  // A later photo/answer that adds facts without contradicting resolved family/form/role must not
  // buy or rerun semantic AI. Only a genuine semantic contradiction reopens classification.
  let recognition = reusableRecognition.carriedForward
    ? (reusableRecognition.recognition as unknown as ProductSemanticClassification)
    : await serverSemanticClassification({
        url,
        anonKey,
        authorization,
        sessionId,
        evidence: recognitionEvidence,
      });
  const familyChoice = FAMILY_CHOICES.has(body.customerFamily as CustomerProductFamilyChoice)
    ? (body.customerFamily as CustomerProductFamilyChoice)
    : null;
  if (resolveCustomerProductFamily(recognition).status !== 'RESOLVED' && familyChoice)
    recognition = applyCustomerProductFamily(recognition, familyChoice);
  /*
    The same rule for the semantic verdict. `serverSemanticClassification` re-runs on every call and
    its model answer is cached under a hash of the MUTATING evidence — so the moment the customer
    adds a fact the fingerprint moves, the cache misses, and a model that does not answer leaves the
    deterministic `REVIEW_REQUIRED`. `modelRequired === true` is a hard gate in BOTH authorities, so
    a resolution the scan had already reached silently became `PRODUCT_SEMANTICS_UNRESOLVED`: that
    is Vitamin Well's 87.8/ready → 71.9/not ready. A fresh RESOLVED classification still wins; only
    an unresolved one is refused the right to erase what the scan already knows.
  */
  let carriedRecognition = reusableRecognition.carriedForward
    ? reusableRecognition
    : carryForwardRecognition({
        fresh: recognition as unknown as Record<string, unknown>,
        persisted: persistedScan.recognition,
      });
  recognition = carriedRecognition.recognition as unknown as ProductSemanticClassification;
  let familyResolution = resolveCustomerProductFamily(recognition);

  let validation = {
    ...objectValue(session.validation_json),
    customerProductFlow: 'CUSTOMER_ADDED_PRODUCT_V1',
    packageEvidenceExhausted: confirmationEnvelope.packageEvidenceExhausted === true,
    customerFamily: familyChoice,
    recognition,
    // what this scan has established, carried to every later call in it
    scanEvidence: {
      confirmedFields: confirmedEvidenceFields,
      recognition: recognitionIsResolved(recognition)
        ? recognition
        : (persistedScan.recognition ?? null),
    },
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

  const recomputeProductAuthorities = async () => {
    const proposal = customerProductProfileProposal({
      scanResult: corrections.result,
      recognitionEvidence,
      recognition,
      userConfirmedFields: confirmedEvidenceFields,
    });
    if (!proposal) return { kind: 'identity_required' as const };
    const sharedProposal = {
      origin: 'CUSTOMER_ADDED',
      proposedMapperIngredientId: null,
      matchInput: proposal.matchInput,
      declared: proposal.declared,
      declaredBasis: proposal.declaredBasis,
      evidence: proposal.evidence,
      /*
          The scan path never filled this, so productProductionAccuracy's web-source test —
          `trustedWebAuthority(input.evidenceProvenance?.[field]?.sourceAuthorityClass)` — always
          read undefined and scored 0. The finalizer now builds it only through
          `applyAutomaticEvidence`, after matching the session GTIN and the exact-source URL. This
          provenance still cannot bypass the independent name-quality gate below or the SQL gate.
        */
      evidenceProvenance: proposal.evidenceProvenance,
      recognitionEvidence: proposal.recognitionEvidence,
      trustedRecognition: proposal.trustedRecognition,
    } as const;
    const standaloneTopping = usesStandaloneToppingOnboardingAuthority(sharedProposal);
    const authority = validateSharedProductOnboarding({
      source: 'SCANNER',
      proposal: sharedProposal,
      mapperRows: standaloneTopping ? [] : await loadMapperRows(service),
      behaviorRows: standaloneTopping ? [] : await loadBehaviorRows(service),
    });
    if (!authority) return { kind: 'profile_rejected' as const };
    return {
      kind: 'complete' as const,
      profile: authority.profile,
      behavior: authority.behavior,
    };
  };

  let authorityPass;
  try {
    authorityPass = await recomputeProductAuthorities();
  } catch (error) {
    return productProfileUnavailable(error);
  }
  if (authorityPass.kind === 'identity_required')
    return json({ error: 'customer_product_identity_required' }, 409);
  if (authorityPass.kind === 'profile_rejected')
    return json({ error: 'customer_product_profile_rejected' }, 409);
  let profile = authorityPass.profile;
  let behavior = authorityPass.behavior;

  // One readiness authority for every surface. Product Accuracy already evaluates the accepted
  // role, ProductBehavior and role-sensitive physics. Only if that complete deterministic + Mapper
  // Rescue pass remains blocked do we buy one targeted research pass on the accumulated evidence.
  let ready = profile.productAccuracyAssessment.gellattiReadiness.ready;
  let criticalGaps = [...profile.productAccuracyAssessment.criticalBlockers];
  let researchOutcome: Awaited<ReturnType<typeof serverTargetedScannerResearch>> = {
    result: corrections.result,
    applied: false,
    requestedFields: [],
  };
  if (!ready) {
    researchOutcome = await serverTargetedScannerResearch({
      url,
      anonKey,
      authorization,
      sessionId,
      barcode: corrections.barcode,
      scanResult: corrections.result,
      recognition,
      fieldTruth: profile.fieldTruth,
      unresolvedFields: criticalGaps,
      readinessContext: profile.productAccuracyAssessment,
    });
    if (researchOutcome.applied) {
      corrections.result = researchOutcome.result;
      publicationEligibility = publicationIdentityEligibilityFromScanResult(
        corrections.result,
        confirmedEvidenceFields,
      );
      corrections.result.publicationEligibility = publicationEligibility;
      recognitionEvidence = productSemanticEvidenceFromScanResult(corrections.result);
      const recognitionBeforeResearch = recognition;
      const deterministicAfterResearch = classifyProductSemantics(recognitionEvidence);
      const reusableAfterResearch = carryForwardRecognition({
        fresh: deterministicAfterResearch as unknown as Record<string, unknown>,
        persisted: recognitionBeforeResearch as unknown as Record<string, unknown>,
      });
      recognition = reusableAfterResearch.carriedForward
        ? (reusableAfterResearch.recognition as unknown as ProductSemanticClassification)
        : await serverSemanticClassification({
            url,
            anonKey,
            authorization,
            sessionId,
            evidence: recognitionEvidence,
          });
      if (resolveCustomerProductFamily(recognition).status !== 'RESOLVED' && familyChoice)
        recognition = applyCustomerProductFamily(recognition, familyChoice);
      carriedRecognition = reusableAfterResearch.carriedForward
        ? reusableAfterResearch
        : carryForwardRecognition({
            fresh: recognition as unknown as Record<string, unknown>,
            persisted: recognitionBeforeResearch as unknown as Record<string, unknown>,
          });
      recognition = carriedRecognition.recognition as unknown as ProductSemanticClassification;
      familyResolution = resolveCustomerProductFamily(recognition);
      validation = {
        ...validation,
        recognition,
        scanEvidence: {
          confirmedFields: confirmedEvidenceFields,
          recognition: recognitionIsResolved(recognition)
            ? recognition
            : (persistedScan.recognition ?? null),
        },
      };
      if (familyResolution.status !== 'RESOLVED') {
        await service
          .from('product_scan_sessions')
          .update({
            result_json: corrections.result,
            validation_json: validation,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
          .eq('user_id', auth.user.id)
          .eq('state', 'analyzed');
        return json({
          kind: 'family_confirmation_required',
          recognition,
          familyResolution,
          barcode: corrections.barcode,
        });
      }
      try {
        authorityPass = await recomputeProductAuthorities();
      } catch (error) {
        return productProfileUnavailable(error);
      }
      if (authorityPass.kind === 'identity_required')
        return json({ error: 'customer_product_identity_required' }, 409);
      if (authorityPass.kind === 'profile_rejected')
        return json({ error: 'customer_product_profile_rejected' }, 409);
      profile = authorityPass.profile;
      behavior = authorityPass.behavior;
      ready = profile.productAccuracyAssessment.gellattiReadiness.ready;
      criticalGaps = [...profile.productAccuracyAssessment.criticalBlockers];
    }
  }
  const roleReadiness = profile.productAccuracyAssessment.roleReadiness;
  const roleReady = roleReadiness === 'BASE_READY' || roleReadiness === 'TOPPING_READY';
  const finalIdentity = objectValue(corrections.result.identity);
  const finalPackage = objectValue(corrections.result.package);
  const { data: exactCanonicalProduct } = session.exact_product_id
    ? await service
        .from('products')
        .select('id,product_name_display,brand')
        .eq('id', session.exact_product_id)
        .eq('is_active', true)
        .is('merged_into_product_id', null)
        .maybeSingle()
    : { data: null };
  const semanticBindingProposal = await buildSharedProductSemanticBindingProposal({
    source: 'scanner',
    identity: {
      ean: corrections.barcode,
      brand: text(exactCanonicalProduct?.brand, 200) ?? text(finalIdentity.brand, 200),
      productName:
        text(exactCanonicalProduct?.product_name_display, 300) ??
        text(finalIdentity.displayName, 300) ??
        text(finalIdentity.originalName, 300) ??
        '',
      variant: text(finalIdentity.variant, 300),
      pack:
        text(finalPackage.netQuantityText, 500) ??
        (typeof finalPackage.netQuantity === 'number' && typeof finalPackage.unit === 'string'
          ? `${finalPackage.netQuantity} ${finalPackage.unit}`
          : null),
      category: text(finalIdentity.category, 300),
      description: recognitionEvidence.claims.join(' '),
    },
    recognition,
    behavior,
    profileEngineUsable: profile.engineUsable,
    profileRoleReady: roleReady && ready,
    publicationReady: ready && publicationEligibility.eligible,
    marketCountries: [],
  });
  const profileWithSemanticBinding = { ...profile, semanticBindingProposal };
  /*
    THE FINAL ASSESSMENT SNAPSHOT — one scan, one versioned verdict. Preview shows it, Finalize
    saves it and routing classifies it, and its hash is what proves the three were the same thing.
  */
  const assessment = await scanAssessmentSnapshot({
    sessionId,
    barcode: corrections.barcode,
    result: corrections.result,
    confirmedFields: confirmedEvidenceFields,
    recognition: recognition as unknown as Record<string, unknown>,
    // This public flag answers whether accepted semantic evidence reached the working authority,
    // not only whether it had to be reused from an earlier HTTP request. Fresh, sufficiently
    // supported Recognition is carried forward too; unresolved/ambiguous evidence remains false.
    recognitionCarriedForward:
      carriedRecognition.carriedForward || supportsSemanticBehaviorReference(recognition),
    behavior: behavior as unknown as Record<string, unknown>,
    profile: profile as unknown as Record<string, unknown>,
  });
  const preview = {
    kind: 'profile_preview',
    assessmentVersion: SCAN_ASSESSMENT_VERSION,
    assessmentHash: assessment.assessmentHash,
    assessment,
    barcode: corrections.barcode,
    recognition,
    familyResolution,
    mapper: {
      selectedDonorId: profile.profileReferenceMapperIngredientId,
      similarity: profile.mapperSimilarity,
      basis: profile.mapperProfileBasis,
      estimatedFromMapperIds: profile.estimatedFromMapperIds,
      candidatesBeforeFilter: profile.mapperCandidatesBeforeFilter,
      candidatesAfterFilter: profile.mapperCandidatesAfterFilter,
      rejectedCandidates: profile.mapperRejectedCandidates,
    },
    fieldTruth: profile.fieldTruth,
    technicalComposition: profile.technicalComposition,
    productAccuracy: profile.productAccuracy,
    productAccuracyAssessment: profile.productAccuracyAssessment,
    productBehavior: behavior,
    semanticBinding: semanticBindingProposal,
    engineUsable: profile.engineUsable,
    ready,
    criticalGaps,
    publicationEligibility,
  };
  const trace = {
    authority: 'AUTONOMOUS_PRODUCT_SCANNER_V1',
    scanId: sessionId,
    exactIdentity: {
      barcode: corrections.barcode,
      displayName: recognitionEvidence.name,
      brand: recognitionEvidence.brand,
      manufacturer: recognitionEvidence.manufacturer,
    },
    evidence: {
      labelFields: Array.isArray(objectValue(corrections.result).evidence)
        ? objectValue(corrections.result).evidence
        : [],
      sources: Array.isArray(objectValue(corrections.result).externalSources)
        ? objectValue(corrections.result).externalSources
        : [],
    },
    classification: recognition,
    completion: {
      accumulatedEvidenceResearch: {
        requestedFields: researchOutcome.requestedFields,
        strongerEvidenceApplied: researchOutcome.applied,
      },
      mapperDonorId: profile.profileReferenceMapperIngredientId,
      mapperSimilarity: profile.mapperSimilarity,
      estimatedFromMapperIds: profile.estimatedFromMapperIds,
      candidatesBeforeFilter: profile.mapperCandidatesBeforeFilter,
      candidatesAfterFilter: profile.mapperCandidatesAfterFilter,
      rejectedCandidates: profile.mapperRejectedCandidates,
      fieldTruth: profile.fieldTruth,
    },
    confidence: profile.productAccuracyAssessment,
    readiness: {
      engineUsable: profile.engineUsable,
      productAccuracy: profile.productAccuracy,
      productBehavior: behavior,
      roleReady,
      ready,
      criticalGaps,
      publicationEligibility,
    },
  };
  const { error: traceError } = await service
    .from('product_scan_sessions')
    .update({
      result_json: corrections.result,
      validation_json: {
        ...validation,
        missingCriticalFields: criticalGaps,
        autonomousTrace: trace,
        finalAssessment: assessment,
      },
      overlay_state: ready ? 'PENDING_PUBLICATION' : 'SCAN_DRAFT',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .eq('state', 'analyzed');
  if (traceError) return json({ error: 'scanner_trace_persistence_failed' }, 503);
  if (action === 'preview') return json(preview);
  /*
    A SAVE MAY ONLY SAVE THE VERDICT THE CUSTOMER WAS SHOWN. The client sends back the hash of the
    assessment it is acting on; if what this run produced is a different verdict, the save stops
    rather than quietly persisting a product the customer never saw. It is optional so an older
    client is refused nothing — but the moment it is sent, it is binding.
  */
  const expectedAssessmentHash = text(body.expectedAssessmentHash, 128);
  if (expectedAssessmentHash && expectedAssessmentHash !== assessment.assessmentHash)
    return json({ ...preview, kind: 'scan_assessment_stale' }, 409);
  // the completion form is offered first; only an explicit save_unverified persists an unready one
  if (!ready && action !== 'save_unverified')
    return json({ ...preview, kind: 'customer_product_not_ready' }, 409);

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
      p_product_profile: profileWithSemanticBinding,
      p_product_behavior: behavior,
      p_private_overlay: privateOverlay,
    },
  );
  if (saveError?.message.includes('shared_product_requires_separate_correction'))
    return json({ error: 'shared_product_requires_separate_correction' }, 409);
  if (saveError || !saved) return json({ error: 'customer_product_persistence_failed' }, 503);
  const savedRow = objectValue(saved);
  return json({
    ...savedRow,
    /*
      `engineUsable` is what the client turns into the recipe button's enabled state, so it must be
      the ROUTING verdict, not `profile.engineUsable`. The profile flag can be true on a product the
      pipeline has just declared not production-ready — and reporting that would put an enabled
      "Dodaj do receptury" in front of a product the add path will refuse, which is exactly the
      falsely-active button the owner rejected.
    */
    engineUsable: savedRow.productionReady === true,
    // `route` is PR | PM_READY | PM_UNVERIFIED, decided by the RPC from this same profile
    usableProductCreated: savedRow.route !== 'PM_UNVERIFIED',
    controlledCatalog: false,
    recognition,
    mapper: preview.mapper,
    // the verdict that was saved — the same object Preview returned, by hash
    assessmentVersion: SCAN_ASSESSMENT_VERSION,
    assessmentHash: assessment.assessmentHash,
    assessment,
  });
});
