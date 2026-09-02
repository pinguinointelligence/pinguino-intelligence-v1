import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=') || true];
  }),
);
if (args.get('--project-ref') !== STAGING_REF) {
  throw new Error('Refusing: exact staging project ref confirmation is required.');
}
const imagePath = resolve(String(args.get('--image') ?? ''));
if (!imagePath || !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(imagePath).toLowerCase())) {
  throw new Error('A supported --image=/absolute/path fixture is required.');
}
const fixtureEmail = String(args.get('--account') ?? 'pro@pro.com').toLowerCase();
if (!['home@home.com', 'pro@pro.com', 'admin@admin.com'].includes(fixtureEmail)) {
  throw new Error('Only a repository-owned staging QA account is accepted.');
}
const privatePrice = args.has('--private-price')
  ? Number(args.get('--private-price'))
  : null;
const privateCurrency = String(args.get('--currency') ?? 'EUR').toUpperCase();
if (
  (privatePrice !== null && (!Number.isFinite(privatePrice) || privatePrice < 0)) ||
  !/^[A-Z]{3}$/.test(privateCurrency)
) {
  throw new Error('Private price must be non-negative and currency must be ISO-4217 shaped.');
}

const apiKeys = JSON.parse(
  execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', STAGING_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
);
const anonKey = apiKeys.find((row) => row.name === 'anon' && row.type === 'legacy')?.api_key;
if (typeof anonKey !== 'string' || anonKey.length < 100) {
  throw new Error('The staging anonymous API key could not be resolved through the linked CLI.');
}

// The password stays owned by the existing staging fixture source and is never
// copied into this script, command arguments, logs or the completion report.
const fixtureSource = readFileSync(resolve('scripts/seed-staging-admin.mjs'), 'utf8');
const fixturePassword = /const FIXED_PASSWORD = '([^']+)'/.exec(fixtureSource)?.[1];
if (!fixturePassword) throw new Error('Repository staging fixture password is missing.');

const client = createClient(STAGING_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email: fixtureEmail,
  password: fixturePassword,
});
if (signInError || !signIn.session?.access_token) {
  throw new Error(`Staging QA authentication failed for ${fixtureEmail}.`);
}
const accessToken = signIn.session.access_token;

const persistPrivatePrice = async (productId) => {
  if (privatePrice === null) return null;
  const { error } = await client.from('user_product_relations').upsert(
    {
      user_id: signIn.user.id,
      product_id: productId,
      private_price: privatePrice,
      currency: privateCurrency,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,product_id' },
  );
  if (error) throw new Error(`Private price persistence failed: ${error.message}`);
  return { pricePerKg: privatePrice, currency: privateCurrency };
};

const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const productBehaviorSnapshot = ({ lineId, resolved }) => {
  const policy = record(resolved.mainPolicy);
  const context = record(resolved.context);
  const capability = resolved.mainCapability ?? null;
  const mainEligible =
    capability === 'MAIN_CAPABLE' || capability === 'MAIN_CAPABLE_UNCALIBRATED';
  return {
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId,
    productId: resolved.productId,
    productVersionId: resolved.productVersionId,
    source: 'catalog_import',
    factsFingerprint: resolved.factsFingerprint,
    behaviorBindingId: resolved.behaviorBindingId,
    behaviorBindingVersion: resolved.behaviorBindingVersion,
    taxonomyVersion: resolved.taxonomyVersion,
    familyId: resolved.familyId ?? null,
    subfamilyId: resolved.subfamilyId ?? null,
    formId: resolved.formId ?? null,
    verificationState:
      resolved.catalogStatus === 'pi_base' ? 'manual_unverified' : resolved.catalogStatus,
    mapperVerificationStatus: resolved.mapperVerificationStatus ?? null,
    technicalAuthority: resolved.mapperIngredientId ? 'mapper_exact' : 'none',
    mapperIngredientId: resolved.mapperIngredientId ?? null,
    mainClassification: resolved.mainEligibility,
    ...(resolved.behaviorRole ? { behaviorRole: resolved.behaviorRole } : {}),
    ...(capability ? { mainCapability: capability } : {}),
    ...(resolved.mainAuthority ? { mainAuthority: resolved.mainAuthority } : {}),
    ...(resolved.mainCalibrationLevel
      ? { mainCalibrationLevel: resolved.mainCalibrationLevel }
      : {}),
    mainPolicyId: policy.policyId ?? null,
    mainPolicyVersion: policy.policyVersion ?? null,
    ecoFloorPercent: policy.ecoFloorPercent ?? null,
    optimalCeilingPercent: policy.optimalCeilingPercent ?? null,
    hardLimitPercent: policy.hardLimitPercent ?? null,
    multiMainHardLimitPercent: policy.multiMainHardLimitPercent ?? null,
    mainEquivalentFactor: policy.mainEquivalentFactor ?? null,
    mainBasis: policy.basis ?? null,
    requiresLiquidDairyCarrier: policy.requiresLiquidDairyCarrier ?? false,
    liquidDairyCarrierFloorPercent: policy.liquidDairyCarrierFloorPercent ?? null,
    approvedLiquidDairyCarrier: resolved.approvedLiquidDairyCarrier === true,
    approvedMixedFamilyIds: Array.isArray(policy.approvedMixedFamilyIds)
      ? policy.approvedMixedFamilyIds
      : [],
    moduleEligibility: {
      ...record(resolved.moduleEligibility),
      [resolved.module]: resolved.state,
      TOPPING: resolved.state,
      MAIN: mainEligible ? 'eligible' : 'blocked',
    },
    processScope: 'POST_PROCESS_ADDON',
    resolutionContext: context,
    resolverVersion: resolved.resolverVersion,
    sharedFacts: resolved.sharedFacts ?? null,
    warnings: Array.isArray(resolved.warnings) ? resolved.warnings : [],
    blockReasons: Array.isArray(resolved.blockReasons) ? resolved.blockReasons : [],
  };
};

const recipeProof = async (product) => {
  if (!args.has('--recipe-proof')) return null;
  if (fixtureEmail !== 'pro@pro.com') {
    throw new Error('The recipe acceptance proof is restricted to the Pro staging fixture.');
  }
  const { data: pickerRows, error: pickerError } = await client.rpc('search_products_v1', {
    p_query: barcode.lookupValue,
    p_context: 'TOPPING',
    p_market_scope: 'my_markets_and_global',
    p_selected_markets: [],
    p_favorites_only: false,
    p_product_profile: 'sorbet',
    p_entity_kind: 'commercial_product',
    p_limit: 20,
    p_cursor: 0,
    p_token_groups: [],
  });
  if (pickerError) throw new Error(`Picker proof failed: ${pickerError.message}`);
  const pickerHit = (pickerRows ?? []).find((row) => row.id === product.id);
  if (!pickerHit || pickerHit.usable_as_topping !== true) {
    throw new Error('The exact Scanner product is absent from the real TOPPING picker authority.');
  }

  const proofName = 'P0 Scanner HARIBO one-photo proof';
  const { data: priorRows, error: priorError } = await client
    .from('saved_recipes')
    .select('*')
    .eq('name', proofName)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (priorError) throw new Error(`Recipe reopen lookup failed: ${priorError.message}`);
  const prior = priorRows?.[0] ?? null;
  if (prior) {
    const { data: priorVersion, error: versionError } = await client
      .from('recipe_versions')
      .select('*')
      .eq('recipe_id', prior.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();
    if (versionError) throw new Error(`Recipe reopen failed: ${versionError.message}`);
    const topping = priorVersion.product_composition?.toppings?.find(
      (item) => item?.ingredient?.catalog_product_id === product.id,
    );
    if (!topping) throw new Error('Reopened recipe lost the Scanner product topping.');
    return {
      picker: { found: true, context: 'TOPPING', usable: true },
      save: 'REOPENED',
      recipeId: prior.id,
      recipeVersionId: priorVersion.id,
      recipeVersion: priorVersion.version_number,
      productId: topping.ingredient.catalog_product_id,
      productVersionId: topping.ingredient.catalog_version_id,
      grams: topping.planned_grams,
      cost: {
        pricePerKg: topping.ingredient.cost_per_kg,
        currency: topping.ingredient.cost_currency,
      },
      behaviorAuthority: 'RESOLVED',
    };
  }

  const { data: candidates, error: candidatesError } = await client
    .from('saved_recipes')
    .select('*')
    .not('product_composition', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (candidatesError) throw new Error(`Recipe source lookup failed: ${candidatesError.message}`);
  const source = (candidates ?? []).find(
    (row) =>
      row.product_composition?.schemaVersion === 1 &&
      Array.isArray(row.recipe_input?.items) &&
      row.recipe_input.items.length > 0 &&
      Object.keys(record(row.product_composition?.behaviorSnapshots)).length ===
        row.recipe_input.items.length,
  );
  if (!source) throw new Error('No current real Pro recipe is available for the Scanner proof.');

  const lineId = `topping-${randomUUID()}`;
  const productVersionId = product.currentVersionId ?? pickerHit.current_version_id;
  const category = source.recipe_input.category;
  const temperatureC = Number(source.recipe_input.target_temperature_c);
  const mode = source.recipe_input.goals?.formulation_strategy === 'eco' ? 'eco' : 'optimal';
  const { data: resolved, error: resolveError } = await client.rpc(
    'resolve_product_behavior_v1',
    {
      p_entity_kind: 'catalog_product_version',
      p_entity_id: productVersionId,
      p_context: {
        accountId: signIn.user.id,
        productProfile: category,
        temperatureC,
        mode,
        processScope: 'POST_PROCESS_ADDON',
        requestedRole: 'STANDARD',
        module: 'TOPPING',
      },
    },
  );
  if (resolveError) throw new Error(`ProductBehavior resolve failed: ${resolveError.message}`);
  if (resolved?.state !== 'eligible') {
    throw new Error(`ProductBehavior did not accept TOPPING: ${resolved?.blockReasons ?? []}`);
  }
  const shared = record(resolved.sharedFacts);
  const nutrition = record(shared.nutritionPer100g);
  const allergens = record(shared.allergens);
  const requiredNutrition = ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'];
  if (requiredNutrition.some((key) => !Number.isFinite(nutrition[key]))) {
    throw new Error('Resolved topping nutrition is incomplete.');
  }
  if (!allergens.ingredientsText || !allergens.allergensText) {
    throw new Error('Resolved topping allergen authority is incomplete.');
  }
  const topping = {
    id: lineId,
    ingredient: {
      kind: 'catalog_label_topping',
      id: `catalog:${product.id}`,
      canonical_ingredient_id: `catalog:${product.id}`,
      private_product_id: `catalog:${product.id}:version:${productVersionId}`,
      name: pickerHit.brand
        ? `${pickerHit.brand} · ${pickerHit.display_name}`
        : pickerHit.display_name,
      catalog_product_id: product.id,
      catalog_version_id: productVersionId,
      verification_status:
        pickerHit.status === 'verified' ? 'verified' : 'manual_unverified',
      label_nutrition_per_100g: {
        basis: 'per_100g',
        energyKcal: nutrition.energyKcal,
        fat: nutrition.fat,
        saturatedFat: nutrition.saturatedFat ?? null,
        carbohydrate: nutrition.carbohydrate,
        sugars: nutrition.sugars ?? null,
        protein: nutrition.protein,
        salt: nutrition.salt,
        fibre: nutrition.fibre ?? null,
      },
      ingredients_text: allergens.ingredientsText,
      allergens_text: allergens.allergensText,
      cost_per_kg: privatePrice,
      cost_currency: privatePrice === null ? null : privateCurrency,
    },
    planned_grams: 80,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: source.product_composition.toppings?.length ?? 0,
  };
  const composition = structuredClone(source.product_composition);
  composition.toppings = [...(composition.toppings ?? []), topping];
  composition.behaviorSnapshots = {
    ...record(composition.behaviorSnapshots),
    [lineId]: productBehaviorSnapshot({ lineId, resolved }),
  };
  const { data: created, error: createError } = await client.rpc('create_recipe_with_v1', {
    p_name: proofName,
    p_description: 'Golden one-photo Scanner acceptance fixture',
    p_recipe_input: source.recipe_input,
    p_batch_grams: source.batch_grams,
    p_total_batch_g: source.recipe_input.target_batch_grams,
    p_engine_version: source.engine_version,
    p_config_version: source.config_version,
    p_mapper_dataset_version: null,
    p_product_profile: source.product_type,
    p_temperature_c: temperatureC,
    p_source: 'manual',
    p_note: 'One photo to recipe and Engine acceptance proof',
    p_product_composition: composition,
    p_serving_profile: source.serving_profile,
    p_active_engine_label: source.active_engine_label,
  });
  if (createError) throw new Error(`Recipe save failed: ${createError.message}`);
  const createdRecipe = created?.recipe;
  const createdVersion = created?.version;
  if (!createdRecipe?.id || !createdVersion?.id) {
    throw new Error('Recipe save returned an incomplete response.');
  }
  const { data: reopened, error: reopenError } = await client
    .from('recipe_versions')
    .select('*')
    .eq('id', createdVersion.id)
    .single();
  if (reopenError) throw new Error(`Recipe reopen failed: ${reopenError.message}`);
  const reopenedTopping = reopened.product_composition?.toppings?.find(
    (item) => item?.ingredient?.catalog_product_id === product.id,
  );
  if (!reopenedTopping) throw new Error('Saved recipe did not reopen with the Scanner product.');
  return {
    picker: { found: true, context: 'TOPPING', usable: true },
    save: 'CREATED_AND_REOPENED',
    recipeId: createdRecipe.id,
    recipeVersionId: reopened.id,
    recipeVersion: reopened.version_number,
    productId: reopenedTopping.ingredient.catalog_product_id,
    productVersionId: reopenedTopping.ingredient.catalog_version_id,
    grams: reopenedTopping.planned_grams,
    cost: {
      pricePerKg: reopenedTopping.ingredient.cost_per_kg,
      currency: reopenedTopping.ingredient.cost_currency,
    },
    behaviorAuthority: reopened.product_composition.behaviorSnapshots[lineId].resolutionState,
  };
};

const invoke = async (name, body) => {
  const response = await fetch(`${STAGING_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${name}:${response.status}:${String(payload.error ?? 'unknown_error')}`);
  }
  return payload;
};

const sessionId = randomUUID();
const assetId = randomUUID();
const EXPECTED_FIXTURE_EAN = '4001686322536';
let barcode = args.has('--vision-only')
  ? null
  : { kind: 'EAN_13', value: EXPECTED_FIXTURE_EAN, lookupValue: EXPECTED_FIXTURE_EAN };
const bytes = readFileSync(imagePath);
const mime =
  extname(imagePath).toLowerCase() === '.png'
    ? 'image/png'
    : extname(imagePath).toLowerCase() === '.webp'
      ? 'image/webp'
      : 'image/jpeg';
const image = {
  assetId,
  mime,
  base64: bytes.toString('base64'),
  source: 'gallery',
  originalMime: mime,
  transformations: [],
  qualityScore: null,
};

const lookup = args.has('--vision-only')
  ? {
      kind: 'vision_required',
      missingCriticalFields: [
        'barcode',
        'product_identity',
        'brand_or_unbranded',
        'net_quantity',
        'ingredientsText',
        'allergen_confirmation',
        'nutrition_basis',
        'nutrition_energyKcal',
        'nutrition_fat',
        'nutrition_carbohydrate',
        'nutrition_sugars',
        'nutrition_protein',
        'nutrition_salt',
      ],
    }
  : await invoke('product-scan-analyze', {
      sessionId,
      mode: 'ean_lookup',
      images: [],
      barcode,
    });
if (lookup.kind === 'existing_product') {
  const persistedPrice = await persistPrivatePrice(lookup.product.id);
  const recipe = await recipeProof({
    ...lookup.product,
    currentVersionId: lookup.product.currentVersionId ?? null,
  });
  console.log(
    JSON.stringify({
      ok: true,
      path: 'EXACT_EAN_SHORT_CIRCUIT',
      sessionId,
      product: lookup.product,
      privatePrice: persistedPrice,
      recipe,
      usage: lookup.usage,
    }),
  );
  await client.auth.signOut();
  process.exit(0);
}

let analysis = await invoke('product-scan-analyze', {
  sessionId,
  images: [image],
  barcode,
  accurateRetry: false,
  missingFields: lookup.missingCriticalFields ?? [],
});
if (args.has('--vision-only') && analysis.kind !== 'existing_product') {
  const extracted = analysis.result?.barcodes?.find(
    (candidate) => typeof candidate?.value === 'string',
  );
  const digits = extracted?.value?.replace(/\D/g, '') ?? '';
  if (digits !== EXPECTED_FIXTURE_EAN) {
    throw new Error(`Vision did not independently recover the fixture EAN (received ${digits || 'none'}).`);
  }
  barcode = { kind: 'EAN_13', value: digits, lookupValue: digits };
  const exactAfterVision = await invoke('product-scan-analyze', {
    sessionId,
    mode: 'ean_lookup',
    images: [],
    barcode,
  });
  if (exactAfterVision.kind !== 'existing_product') {
    throw new Error('The Vision-discovered exact EAN did not resolve through the internal catalog.');
  }
  const persistedPrice = await persistPrivatePrice(exactAfterVision.product.id);
  const recipe = await recipeProof({
    ...exactAfterVision.product,
    currentVersionId: exactAfterVision.product.currentVersionId ?? null,
  });
  console.log(
    JSON.stringify({
      ok: true,
      path: 'VISION_DISCOVERED_EAN_SHORT_CIRCUIT',
      sessionId,
      extractedEan: digits,
      product: exactAfterVision.product,
      privatePrice: persistedPrice,
      recipe,
      usage: {
        visionCalls: analysis.usage?.visionCalls ?? 1,
        webCalls: analysis.usage?.webCalls ?? 0,
        estimatedCostUsd: analysis.usage?.estimatedCostUsd ?? 0,
      },
    }),
  );
  await client.auth.signOut();
  process.exit(0);
}
if (
  analysis.kind !== 'existing_product' &&
  Array.isArray(analysis.missingCriticalFields) &&
  analysis.missingCriticalFields.length > 0 &&
  Number(analysis.usage?.visionCalls ?? 0) < 2
) {
  analysis = await invoke('product-scan-analyze', {
    sessionId,
    images: [image],
    barcode,
    accurateRetry: true,
    missingFields: analysis.missingCriticalFields,
  });
}
if (analysis.kind === 'existing_product') {
  const persistedPrice = await persistPrivatePrice(analysis.product.id);
  const recipe = await recipeProof({
    ...analysis.product,
    currentVersionId: analysis.product.currentVersionId ?? null,
  });
  console.log(
    JSON.stringify({
      ok: true,
      path: 'VISION_EXACT_EAN_SHORT_CIRCUIT',
      sessionId,
      product: analysis.product,
      privatePrice: persistedPrice,
      recipe,
      usage: analysis.usage,
    }),
  );
  await client.auth.signOut();
  process.exit(0);
}

const result = analysis.result;
const nutrition = Object.fromEntries(
  Object.entries(result.nutrition ?? {}).filter(
    ([key, value]) =>
      (key === 'basis' && ['per_100g', 'per_100ml'].includes(value)) ||
      (key !== 'basis' && typeof value === 'number' && Number.isFinite(value)),
  ),
);
const productionDeclarations = Object.fromEntries(
  Object.entries(result.productionDeclarations ?? {}).filter(
    ([, value]) =>
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.trim().length > 0),
  ),
);
const productFields = {
  barcode: barcode?.lookupValue ?? null,
  identity: {
    displayName: result.identity?.displayName ?? result.identity?.originalName ?? null,
    brand: result.identity?.brand ?? null,
    explicitlyUnbranded: result.identity?.explicitlyUnbranded === true,
  },
  nutrition,
  ...(result.ingredientsText ? { ingredientsText: result.ingredientsText } : {}),
  ...(result.allergensText ? { allergensText: result.allergensText } : {}),
  productionDeclarations,
};
const action = args.has('--create') ? 'finalize' : 'preview';
const profile = await invoke('product-scan-finalize', {
  action,
  sessionId,
  idempotencyKey: `${sessionId}:staging-acceptance-v1:${action}`,
  customerFamily: null,
  confirmations: { packageEvidenceExhausted: true, productFields },
  privateOverlay:
    privatePrice === null
      ? {}
      : { price: privatePrice, currency: privateCurrency },
});
const recognition = profile.recognition ?? {};
const behavior = profile.productBehavior ?? {};
const mapper = profile.mapper ?? {};
console.log(
  JSON.stringify({
    ok: profile.ready === true || profile.usableProductCreated === true,
    action,
    path: 'ONE_PHOTO_AUTONOMOUS_LOOP',
    sessionId,
    identity: {
      name: productFields.identity.displayName,
      brand: productFields.identity.brand,
      barcode: productFields.barcode,
    },
    evidence: {
      labelFields: Array.isArray(result.evidence) ? result.evidence.length : 0,
      externalSources: Array.isArray(result.externalSources) ? result.externalSources.length : 0,
      ingredients: Boolean(result.ingredientsText),
      nutritionBasis: result.nutrition?.basis ?? null,
    },
    usage: analysis.usage,
    recognition: {
      archetype: recognition.productArchetype ?? null,
      family: recognition.ingredientFamily ?? null,
      form: recognition.physicalForm ?? null,
      role: recognition.intendedUsageRole ?? null,
      confidence: recognition.confidence ?? null,
      technical: recognition.isTechnicalProduct ?? null,
    },
    mapper: {
      donor: mapper.selectedDonorId ?? null,
      similarity: mapper.similarity ?? null,
      basis: mapper.basis ?? null,
      candidatesBeforeFilter: mapper.candidatesBeforeFilter ?? [],
      candidatesAfterFilter: mapper.candidatesAfterFilter ?? [],
      rejectedCandidates: mapper.rejectedCandidates ?? [],
    },
    productAccuracy: profile.productAccuracy ?? null,
    behavior: {
      outcome: behavior.classificationOutcome ?? null,
      base: behavior.baseRecipeEligible ?? null,
      topping: behavior.toppingEligible ?? null,
      reference: behavior.referenceMapperIngredientId ?? null,
    },
    engineUsable: profile.engineUsable ?? null,
    ready: profile.ready ?? profile.usableProductCreated ?? false,
    criticalGaps: profile.criticalGaps ?? [],
    productId: profile.productId ?? null,
    productCode: profile.productCode ?? null,
    privatePrice:
      privatePrice === null ? null : { pricePerKg: privatePrice, currency: privateCurrency },
  }),
);
await client.auth.signOut();
