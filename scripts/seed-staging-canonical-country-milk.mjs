import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MAPPER_SLOT = 'PI-ING-000236';
const SEED_VERSION = 'canonical-country-milk-v2';
const APPROVAL_REVISION = 'v4';

const PRODUCTS = Object.freeze([
  Object.freeze({
    country: 'ES',
    language: 'es',
    name: 'Leche líquida entera Hacendado',
    brand: 'Hacendado',
    manufacturer: 'Naturleite',
    retailer: 'Mercadona',
    ean: '8402001047251',
    packageSize: '1 L',
    ingredientsText: 'Leche entera de vaca. Origen de la leche: España.',
    allergensText: 'Leche',
    nutrition: Object.freeze({
      basis: 'per_100ml',
      energyKcal: 62,
      fat: 3.5,
      saturatedFat: 2,
      carbohydrate: 4.5,
      sugars: 4.5,
      protein: 3.1,
      salt: 0.13,
      fibre: 0,
    }),
    sources: Object.freeze([
      'https://tienda.mercadona.es/product/10933/leche-entera-hacendado-botella',
      'https://mercadona.tribbal.net/articulo/10933',
      'https://info.mercadona.es/document/en/traceability-at-origin-study-for-hacendado-milk-neoris.pdf',
    ]),
    reviewNotes:
      'Exact current Hacendado bottle EAN 8402001047251: Spanish liquid whole cow milk, 3.5 g fat/100 ml. “Líquida” is a truthful physical-form descriptor for the bottled product. The current label nutrition binds truthfully to canonical MILK 3.5% PI-ING-000236; it must not inherit the older branded 3.6% Mapper profile.',
  }),
  Object.freeze({
    country: 'PL',
    language: 'pl',
    name: 'Mleko płynne Łaciate 3,5%',
    brand: 'Łaciate',
    manufacturer: 'Mlekpol',
    retailer: 'Mlekpol / international retail',
    ean: '5900820012434',
    packageSize: '1 L',
    ingredientsText: 'Mleko krowie UHT.',
    allergensText: 'Mleko',
    nutrition: Object.freeze({
      basis: 'per_100ml',
      energyKcal: 63,
      fat: 3.5,
      saturatedFat: 2.3,
      carbohydrate: 4.7,
      sugars: 4.7,
      protein: 3.2,
      salt: 0.1,
      fibre: 0,
    }),
    sources: Object.freeze([
      'https://mlekpol.com.pl/index.php/produkt/mleko-uht-laciate-35-2/',
      'https://suatuoi.com/laciate/laciate-full-cream-1l',
      'https://apothikiseven.com/en/products/laciate-%CE%B3%CE%AC%CE%BB%CE%B1-uht-3-5-1l-5900820012434',
    ]),
    reviewNotes:
      'Mlekpol manufacturer identity and EAN 5900820012434 are corroborated by current exact-EAN commercial sources. Declared 3.5 g fat and 4.7 g milk sugars per 100 ml bind truthfully to canonical MILK 3.5% PI-ING-000236.',
  }),
  Object.freeze({
    country: 'FR',
    language: 'fr',
    name: 'Lait liquide frais entier Alsace Lait',
    brand: 'Alsace Lait',
    manufacturer: 'Laiterie Coopérative Alsacienne Alsace Lait',
    retailer: 'Auchan France',
    ean: '3262970109108',
    packageSize: '1 L',
    ingredientsText:
      'Lait frais pasteurisé entier. Origine : Alsace, Grand Est, France. Lait issu d’animaux nourris sans OGM <0,9 %.',
    allergensText: 'Lait',
    nutrition: Object.freeze({
      basis: 'per_100ml',
      energyKcal: 65,
      fat: 3.6,
      saturatedFat: 2.5,
      carbohydrate: 4.7,
      sugars: 4.7,
      protein: 3.4,
      salt: 0.12,
      fibre: 0,
    }),
    sources: Object.freeze([
      'https://www.alsace-lait.com/nos-laits/fiche-produit/lait-frais-entier',
      'https://www.auchan.fr/alsace-lait-lait-frais-entier/pr-C1752619',
      'https://www.coursesu.com/p/lait-frais-pasteurise-entier-alsace-lait-brick-1l/4025793.html',
    ]),
    reviewNotes:
      'Exact Alsace Lait EAN 3262970109108 is a French-origin liquid fresh pasteurised whole milk with 3.6 g fat and 4.7 g milk sugars per 100 ml. “Liquide” is a truthful physical-form descriptor for the carton product. EU whole milk is the same canonical 3.5% technological slot PI-ING-000236.',
  }),
]);

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=') || true];
  }),
);
if (args.get('--project-ref') !== STAGING_REF) {
  throw new Error('Refusing: exact pinguino-staging project ref confirmation is required.');
}
if (!args.has('--apply')) {
  throw new Error('Refusing: explicit --apply is required for staging catalog mutations.');
}
const selectedCountry = String(args.get('--only') ?? '').toUpperCase();
if (selectedCountry && !PRODUCTS.some((product) => product.country === selectedCountry)) {
  throw new Error('--only must be ES, PL or FR.');
}
const selectedProducts = selectedCountry
  ? PRODUCTS.filter((product) => product.country === selectedCountry)
  : PRODUCTS;

const apiKeys = JSON.parse(
  execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || anonKey.length < 100) {
  throw new Error('The staging anonymous API key could not be resolved.');
}

// The established QA password stays in its owner fixture and process memory.
// It is never copied into arguments, logs, reports, or this script.
const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const clientFor = async (email) => {
  const client = createClient(STAGING_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: fixturePassword,
  });
  if (error || !data.session?.access_token || !data.user) {
    throw new Error(`Staging QA authentication failed for ${email}.`);
  }
  return { client, user: data.user };
};

const { client: admin, user: adminUser } = await clientFor('admin@admin.com');
const { client: pro } = await clientFor('pro@pro.com');

const functionErrorDetail = async (error) => {
  const fallback = error instanceof Error ? error.message : String(error);
  const response = error?.context;
  try {
    const body = await response?.clone?.().json?.();
    const detail = body?.detail ?? body?.error ?? body?.message;
    if (detail) return `${response.status ?? 'unknown'} ${detail}`;
  } catch {
    // Fall through to the text response when the payload is not JSON.
  }
  try {
    const bodyText = await response?.clone?.().text?.();
    if (bodyText) return `${response.status ?? 'unknown'} ${bodyText}`;
  } catch {
    // Fall back to the original SDK error below.
  }
  return `${response?.status ?? 'unknown'} ${response?.statusText ?? fallback}`;
};

const exactProductByEan = async (ean) => {
  const { data, error } = await admin
    .from('products')
    .select(
      'id,product_code,current_version_id,current_behavior_binding_id,canonical_verification_status,canonical_provenance',
    )
    .eq('ean_code_normalized', ean)
    .is('merged_into_product_id', null)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Exact product lookup failed for ${ean}: ${error.message}`);
  return data;
};

const requestFor = async (spec) => {
  const idempotencyKey = `${SEED_VERSION}:${spec.country}:${spec.ean}`;
  const { data: existing, error: existingError } = await pro
    .from('product_add_requests')
    .select('id,status,approved_product_id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(`Product request lookup failed: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await pro.rpc('gellatti_submit_product_request_v1', {
    p_scan_session_id: null,
    p_market_country_code: spec.country,
    p_idempotency_key: idempotencyKey,
    p_payload: {
      result: {
        identity: {
          displayName: spec.name,
          originalName: spec.name,
          brand: spec.brand,
          countryOfOrigin: spec.country,
          labelLanguages: [spec.language],
        },
        package: { netQuantityText: spec.packageSize },
        manufacturer: spec.manufacturer,
        barcodes: [{ kind: 'EAN_13', value: spec.ean }],
        ingredientsText: spec.ingredientsText,
        allergensText: spec.allergensText,
        nutrition: spec.nutrition,
      },
      provenance: {
        authority: 'INDEPENDENT_PRODUCT_RESEARCH_V1',
        sourceUrls: spec.sources,
        researchedFor: 'CANONICAL_PRODUCT_PICKER_V1_9',
      },
    },
  });
  if (error) throw new Error(`Product request submission failed: ${error.message}`);
  if (data?.kind === 'existing_product') {
    return { id: null, status: 'EXISTING', approved_product_id: data.productId };
  }
  if (data?.kind !== 'product_request' || typeof data.requestId !== 'string') {
    throw new Error(`Unexpected product request response for ${spec.ean}.`);
  }
  return { id: data.requestId, status: data.status, approved_product_id: null };
};

const adminAction = async (requestId, action, payload = {}) => {
  const { data, error } = await admin.rpc('gellatti_admin_product_request_action_v1', {
    p_request_id: requestId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(`${action} failed for ${requestId}: ${error.message}`);
  return data;
};

const rejectSupersededPolishResearchRequest = async () => {
  const { data, error } = await pro
    .from('product_add_requests')
    .select('id,status')
    .eq('idempotency_key', 'canonical-country-milk-v1:PL:5900628004242')
    .maybeSingle();
  if (error) throw new Error(`Superseded request lookup failed: ${error.message}`);
  if (!data || ['APPROVED', 'REJECTED', 'DUPLICATE', 'USER_CANCELED'].includes(data.status)) {
    return;
  }
  await adminAction(data.id, 'REJECT', {
    reason:
      'Superseded during canonical country research: the reviewed label does not complete the existing Engine sugar-spectrum gate for this technological slot. No product was published.',
  });
};

const rejectSupersededFrenchResearchRequest = async () => {
  const { data, error } = await pro
    .from('product_add_requests')
    .select('id,status')
    .eq('idempotency_key', 'canonical-country-milk-v2:FR:3257980631343')
    .maybeSingle();
  if (error) throw new Error(`Superseded French request lookup failed: ${error.message}`);
  if (!data || ['APPROVED', 'REJECTED', 'DUPLICATE', 'USER_CANCELED'].includes(data.status)) {
    return;
  }
  await adminAction(data.id, 'REJECT', {
    reason:
      'Superseded during canonical country research: the truthful 4.8 g/100 ml sugar declaration does not complete the existing Engine sweetening/freezing path. No product was published.',
  });
};

const verifiedPatch = (spec) => ({
  ean: spec.ean,
  productName: spec.name,
  brand: spec.brand,
  manufacturer: spec.manufacturer,
  category: 'dairy',
  countryOfOrigin: spec.country,
  netQuantity: spec.packageSize,
  ingredientsText: spec.ingredientsText,
  allergensText: spec.allergensText,
  nutrition: spec.nutrition,
  sourceUrls: spec.sources,
  sourceAuthority: 'INDEPENDENT_PRODUCT_RESEARCH_V1',
});

const ensureApproval = async (spec) => {
  const currentProduct = await exactProductByEan(spec.ean);
  const request = await requestFor(spec);
  if (request.status === 'EXISTING' || request.status === 'APPROVED') {
    if (!currentProduct && !request.approved_product_id) {
      throw new Error(`Approved request has no current exact product for ${spec.ean}.`);
    }
    return currentProduct ?? (await exactProductByEan(spec.ean));
  }
  if (!request.id) throw new Error(`Open request is missing for ${spec.ean}.`);

  if (
    currentProduct?.canonical_provenance === 'product_add_request_admin_v1' &&
    currentProduct.current_version_id
  ) {
    const { data: ingestEvent, error: ingestEventError } = await admin
      .from('product_ingest_events')
      .select('id')
      .eq('product_id', currentProduct.id)
      .eq('actor_user_id', adminUser.id)
      .eq('source', 'admin')
      .eq('idempotency_key', `product-request:${request.id}:approve-${APPROVAL_REVISION}`)
      .maybeSingle();
    if (ingestEventError)
      throw new Error(`Current product ingest lookup failed: ${ingestEventError.message}`);
    if (ingestEvent) {
      await adminAction(request.id, 'APPROVE_LINK', { productId: currentProduct.id });
      return currentProduct;
    }
  }

  if (request.status === 'SUBMITTED' || request.status === 'RESUBMITTED') {
    await adminAction(request.id, 'START_REVIEW');
  }
  await adminAction(request.id, 'ADMIN_EVIDENCE_PATCH', {
    patch: verifiedPatch(spec),
    reason: `Independent exact-EAN review for ${spec.country}: ${spec.sources.join(' | ')}`,
  });

  const { data: duplicateCandidates, error: duplicateError } = await admin.rpc(
    'preview_product_duplicates_v1',
    {
      p_facts: {
        displayName: spec.name,
        brand: spec.brand,
        packageSize: spec.packageSize,
        ean: spec.ean,
        ingredientsText: spec.ingredientsText,
        nutrition: spec.nutrition,
        imagePhashes: [],
      },
    },
  );
  if (duplicateError) throw new Error(`Duplicate preview failed: ${duplicateError.message}`);
  const duplicate = (duplicateCandidates ?? []).find((candidate) => candidate.ean !== spec.ean);
  const input = {
    productKind: 'commercial_product',
    displayName: spec.name,
    originalName: spec.name,
    originalLanguage: spec.language,
    brand: spec.brand,
    manufacturer: spec.manufacturer,
    explicitlyUnbranded: false,
    canonicalFamily: null,
    category: 'dairy',
    countryOfOrigin: spec.country,
    ean: spec.ean,
    barcode: spec.ean,
    provenance: 'product_add_request_admin_v1',
    facts: {
      productAddRequestId: request.id,
      packageSize: spec.packageSize,
      ingredientsText: spec.ingredientsText,
      allergensText: spec.allergensText,
      mayContainAllergens: [],
      labelLanguages: [spec.language],
      nutritionBasis: spec.nutrition.basis,
      nutrition: spec.nutrition,
      sourceEvidence: {
        authority: 'INDEPENDENT_PRODUCT_RESEARCH_V1',
        sourceUrls: spec.sources,
      },
    },
    manualProductProfileProposal: {
      authority: 'ADMIN_PRODUCT_REQUEST_V1',
      requestId: request.id,
    },
  };
  const { data, error } = await admin.functions.invoke('catalog-submit', {
    body: {
      source: 'admin',
      idempotencyKey: `product-request:${request.id}:approve-${APPROVAL_REVISION}`,
      input,
      productId: currentProduct?.id ?? null,
      operation: 'upsert',
      evidence: {
        productAddRequestId: request.id,
        evidenceIds: [],
        userCorrectionsAreEvidenceOnly: true,
        adminVerifiedData: verifiedPatch(spec),
        approvedByAdmin: true,
      },
      privateOverlay: {},
      market: spec.country,
      retailer: spec.retailer,
      packageLanguage: spec.language,
      requireApprovalReady: true,
      duplicateDecision: duplicate ? 'different' : null,
      duplicateProductId: duplicate?.product_id ?? null,
      distinguishingEvidence: duplicate
        ? {
            exactEan: spec.ean,
            comparedProductId: duplicate.product_id,
            reason:
              'Different checksum-valid EAN, brand, and country-specific commercial identity.',
            sourceUrls: spec.sources,
          }
        : {},
    },
  });
  if (error) throw new Error(`Catalog approval failed: ${await functionErrorDetail(error)}`);
  if (data?.kind === 'approval_not_ready') {
    throw new Error(`Catalog approval not ready: ${JSON.stringify(data)}`);
  }
  if (typeof data?.productId !== 'string') {
    throw new Error(
      `Catalog approval returned no product for ${spec.ean}: ${JSON.stringify(data)}`,
    );
  }
  await adminAction(request.id, 'APPROVE_LINK', { productId: data.productId });
  return await exactProductByEan(spec.ean);
};

const ensureCanonicalSlotReview = async (spec, product) => {
  if (!product?.id) throw new Error(`Exact product is absent for ${spec.ean}.`);
  if (!product.current_version_id) {
    throw new Error(`Exact product has no immutable current version for ${spec.ean}.`);
  }
  const { data: current, error: currentError } = await admin
    .from('product_canonical_slot_reviews')
    .select('id,product_version_id,mapper_ingredient_id,active')
    .eq('product_id', product.id)
    .eq('active', true)
    .maybeSingle();
  if (currentError) throw new Error(`Canonical slot review lookup failed: ${currentError.message}`);
  if (current) {
    if (
      current.product_version_id !== product.current_version_id ||
      current.mapper_ingredient_id !== MAPPER_SLOT
    ) {
      throw new Error(
        `Refusing to replace active canonical slot review ${current.id} for ${spec.ean}.`,
      );
    }
    return current.id;
  }
  const { data, error } = await admin
    .from('product_canonical_slot_reviews')
    .insert({
      product_id: product.id,
      product_version_id: product.current_version_id,
      mapper_ingredient_id: MAPPER_SLOT,
      active: true,
      approval_reason: `${SEED_VERSION}: exact-label review for canonical whole-milk technological slot`,
      review_evidence: {
        authority: 'INDEPENDENT_PRODUCT_RESEARCH_V1',
        slotMatchBasis: spec.reviewNotes,
        exactEan: spec.ean,
        sourceUrls: spec.sources,
        productOwnedBehaviorPreserved: true,
        runtimeMapperIdentity: null,
      },
      approved_by: adminUser.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Canonical slot review creation failed: ${error.message}`);
  return data.id;
};

const ensureCountryPrimary = async (spec, product) => {
  const { data: current, error: currentError } = await admin
    .from('country_product_slot_assignments')
    .select('id,product_id,active,assignment_kind')
    .eq('country_code', spec.country)
    .eq('mapper_ingredient_id', MAPPER_SLOT)
    .eq('assignment_kind', 'PRIMARY_DEFAULT')
    .eq('active', true)
    .maybeSingle();
  if (currentError) throw new Error(`Country assignment lookup failed: ${currentError.message}`);
  if (current) {
    if (current.product_id !== product.id) {
      throw new Error(
        `Refusing to replace existing ${spec.country}/${MAPPER_SLOT} primary ${current.product_id}.`,
      );
    }
    return current.id;
  }
  const { data, error } = await admin
    .from('country_product_slot_assignments')
    .insert({
      country_code: spec.country,
      mapper_ingredient_id: MAPPER_SLOT,
      product_id: product.id,
      assignment_kind: 'PRIMARY_DEFAULT',
      fallback_priority: null,
      active: true,
      approval_reason: `${SEED_VERSION}: real exact-EAN whole milk; independent sources ${spec.sources.join(' | ')}`,
      approved_by: adminUser.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Country primary creation failed: ${error.message}`);
  return data.id;
};

const results = [];
if (selectedProducts.some((product) => product.country === 'PL')) {
  await rejectSupersededPolishResearchRequest();
}
if (selectedProducts.some((product) => product.country === 'FR')) {
  await rejectSupersededFrenchResearchRequest();
}
for (const spec of selectedProducts) {
  const approved = await ensureApproval(spec);
  const slotReviewId = await ensureCanonicalSlotReview(spec, approved);
  const assignmentId = await ensureCountryPrimary(spec, approved);
  results.push({
    country: spec.country,
    ean: spec.ean,
    productId: approved.id,
    productCode: approved.product_code,
    mapperIngredientId: MAPPER_SLOT,
    slotReviewId,
    assignmentId,
  });
}

const polish =
  results.find((result) => result.country === 'PL') ??
  (await (async () => {
    const product = await exactProductByEan('5900820012434');
    return product ? { country: 'PL', ean: '5900820012434', productId: product.id } : null;
  })());
if (!selectedCountry && polish?.productId) {
  const { data, error } = await pro.rpc('set_user_preferred_product_for_slot_v1', {
    p_mapper_ingredient_id: MAPPER_SLOT,
    p_preferred_product_id: polish.productId,
  });
  if (error) throw new Error(`Explicit Pro QA preferred SKU failed: ${error.message}`);
  if (data !== polish.productId) throw new Error('Preferred exact SKU pointer did not round-trip.');
}

process.stdout.write(
  `${JSON.stringify(
    {
      projectRef: STAGING_REF,
      authority: 'PRODUCT_SLOT_REVIEW_AND_COUNTRY_ASSIGNMENT_V1',
      mapperIngredientId: MAPPER_SLOT,
      products: results,
      proPreferredProductId: !selectedCountry ? (polish?.productId ?? null) : null,
    },
    null,
    2,
  )}\n`,
);
