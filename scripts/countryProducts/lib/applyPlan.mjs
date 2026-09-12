// Pure planning and guard logic for the GELATO base DB packages — one package
// per owner-workbook registry (v12, v23), each with its own owner approval
// token. Nothing in this module performs I/O; the apply entry points
// (applyGelatoBaseV12.mjs, applyGelatoBaseV23.mjs) own the owner-approved,
// never-default network path (lib/applyCli.mjs → lib/applyExecutor.mjs).

export const PLAN_SCHEMA = 'gellatti.country-products.gelato-base.db-plan/v1';
export const REGISTRY_SCHEMA = 'gellatti.country-products.gelato-base.registry/v1';
export const APPLY_PROJECT_REF = 'tunabqqrwabacxjcxxkz';
// v12 package constants (named exports kept for the v12 entry point and tests).
export const APPLY_APPROVAL_TOKEN = 'GELLATTI-V12-PR-ING';
export const IDEMPOTENCY_NAMESPACE = 'gellatti-v12-pr-ing';
export const CATALOG_SUBMIT_REVISION = 'approve-v12';
export const SOURCE_AUTHORITY = 'OWNER_WORKBOOK_GELATO_BASE_V12';
// v23 has its own token: approving the v12 package never approves the v23 one.
export const V23_APPLY_APPROVAL_TOKEN = 'GELLATTI-V23-PR-ING';

/** DB-package constants per registry (keyed by registry.registryId). */
export const APPLY_PROFILES = Object.freeze({
  GELATO_BASE_V12: Object.freeze({
    label: 'v12',
    approvalToken: APPLY_APPROVAL_TOKEN,
    idempotencyNamespace: IDEMPOTENCY_NAMESPACE,
    catalogSubmitRevision: CATALOG_SUBMIT_REVISION,
    sourceAuthority: SOURCE_AUTHORITY,
    researchedFor: 'GELATO_BASE_V12_COUNTRY_PRODUCTS',
    scope:
      'NEW PR-ING products that have at least one route creatable now (market row present, selection closed, declared 7-field profile, stated metric pack, no conflicting primary). Everything else is deferred and not written.',
  }),
  GELATO_BASE_V23: Object.freeze({
    label: 'v23',
    approvalToken: V23_APPLY_APPROVAL_TOKEN,
    idempotencyNamespace: 'gellatti-v23-pr-ing',
    catalogSubmitRevision: 'approve-v23',
    sourceAuthority: 'OWNER_WORKBOOK_GELATO_BASE_V23',
    researchedFor: 'GELATO_BASE_V23_COUNTRY_PRODUCTS',
    scope:
      'NEW PR-ING products that have at least one route creatable now (market row present, selection closed, v23 workbook status KANDYDAT_PR, declared 7-field profile in the available-carbohydrate convention, stated metric pack, no conflicting primary). Everything else is deferred and not written. The catalog snapshot must be re-captured read-only immediately before any apply.',
  }),
});

/** The DB-package profile of a registry; an unknown registry id fails. */
export function applyProfileFor(registry) {
  const registryId = String(registry?.registryId);
  if (!Object.hasOwn(APPLY_PROFILES, registryId)) {
    throw new Error(`buildApplyPlan: no DB-package profile for registry ${registryId}`);
  }
  return APPLY_PROFILES[registryId];
}

const ALLOWED_ARGUMENTS = new Set([
  '--apply',
  '--project-ref',
  '--owner-db-approval',
  '--registry',
  '--json',
]);

const CATEGORY_BY_SLOT = Object.freeze({
  MILK: 'dairy',
  CREAM: 'dairy',
  SMP: 'dairy',
  DEXTROSE: 'sugar',
  STABILIZER: 'stabilizer',
});

const compare = (left, right) => {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

/** Source URLs for a list of SRC- ids from the registry's source table. */
export function sourceUrlsFor(registry, ids) {
  return (ids ?? []).map((id) => registry.sources?.[id]?.url).filter((url) => typeof url === 'string');
}

/** Resolves a TXT- id from the registry's text table; other values pass through. */
export function registryText(registry, value) {
  return typeof value === 'string' && /^TXT-[0-9A-F]{10}$/.test(value)
    ? (registry.texts?.[value] ?? value)
    : value;
}

/** "--key=value" → ["--key", "value"], "--flag" → ["--flag", true]. */
export function parseArguments(argv) {
  const map = new Map();
  for (const entry of argv) {
    const [key, ...rest] = String(entry).split('=');
    map.set(key, rest.length > 0 ? rest.join('=') : true);
  }
  return map;
}

/**
 * Decides whether the apply script may touch the database. The default is a
 * dry run; mutation needs all three explicit arguments with exact values. The
 * approval token is the one of the registry version being applied (v12 by
 * default; the v23 entry point passes GELLATTI-V23-PR-ING).
 */
export function evaluateApplyGuard(argv, { approvalToken = APPLY_APPROVAL_TOKEN } = {}) {
  const args = parseArguments(argv);
  const unknown = [...args.keys()].filter((key) => !ALLOWED_ARGUMENTS.has(key));
  if (unknown.length > 0) {
    return { mode: 'REFUSED', refusal: `Refusing: unknown argument(s) ${unknown.join(', ')}.`, args };
  }
  if (!args.has('--apply')) return { mode: 'DRY_RUN', refusal: null, args };
  if (args.get('--project-ref') !== APPLY_PROJECT_REF) {
    return {
      mode: 'REFUSED',
      refusal: `Refusing: --apply requires --project-ref=${APPLY_PROJECT_REF} (one Supabase project serves staging AND production).`,
      args,
    };
  }
  if (args.get('--owner-db-approval') !== approvalToken) {
    return {
      mode: 'REFUSED',
      refusal: `Refusing: --apply requires --owner-db-approval=${approvalToken} (explicit owner approval of this DB package).`,
      args,
    };
  }
  return { mode: 'APPLY', refusal: null, args };
}

function nutritionBasis(product) {
  return ['PER_100ML', 'PER_PORTION_ML'].includes(product.nutrition.declaredBasis)
    ? 'per_100ml'
    : 'per_100g';
}

function declaredNutrition(product) {
  const declared = product.nutrition.declared;
  return {
    basis: nutritionBasis(product),
    energyKcal: declared.energyKcal,
    fat: declared.fat,
    saturatedFat: declared.saturatedFat,
    carbohydrate: declared.carbohydrate,
    sugars: declared.sugars,
    protein: declared.protein,
    salt: declared.salt,
    fibre: declared.fibre,
  };
}

function packageSize(product) {
  const pkg = product.package;
  return pkg.normalizedQuantity !== null && pkg.normalizedUnit
    ? `${pkg.normalizedQuantity} ${pkg.normalizedUnit}`
    : pkg.text;
}

function barcodeKind(product) {
  switch (product.identity.gtinSymbology) {
    case 'EAN_8':
      return 'EAN_8';
    case 'UPC_A':
      return 'UPC_A';
    case 'EAN_13':
      return 'EAN_13';
    default:
      return 'GTIN_14';
  }
}

function sourceEvidence(registry, product, proposalKey) {
  return {
    authority: applyProfileFor(registry).sourceAuthority,
    workbook: registry.source.workbook,
    workbookSha256: registry.source.sha256,
    proposalKey,
    productKey: product.productKey,
    workbookRefs: [product.workbook.anchorSelectionRef, product.workbook.anchorCalculationRef, ...product.workbook.articleRefs],
    sourceUrls: sourceUrlsFor(registry, product.sourceIds),
  };
}

/** Payloads the apply path would send; `<requestId>` is filled at run time. */
export function buildProductPayloads(registry, product, anchorProposalKey) {
  const profile = applyProfileFor(registry);
  const nutrition = declaredNutrition(product);
  const evidence = sourceEvidence(registry, product, anchorProposalKey);
  const requestPayload = {
    result: {
      identity: {
        displayName: product.exactName,
        originalName: product.exactName,
        brand: product.brand,
        countryOfOrigin: null,
        labelLanguages: [],
      },
      package: { netQuantityText: packageSize(product) },
      manufacturer: product.manufacturerOrSupplier,
      barcodes: product.identity.gtin ? [{ kind: barcodeKind(product), value: product.identity.gtin }] : [],
      ingredientsText: product.ingredientsText,
      allergensText: product.allergensText,
      nutrition,
    },
    provenance: {
      ...evidence,
      researchedFor: profile.researchedFor,
      identityBasis: product.identity.basis,
      articleCode: product.identity.articleCode,
    },
  };
  const evidencePatch = {
    ean: product.identity.gtin,
    productName: product.exactName,
    brand: product.brand,
    manufacturer: product.manufacturerOrSupplier,
    category: CATEGORY_BY_SLOT[product.slot],
    countryOfOrigin: null,
    originText: product.origin,
    netQuantity: packageSize(product),
    packageText: product.package.text,
    ingredientsText: product.ingredientsText,
    allergensText: product.allergensText,
    nutrition,
    nutritionNormalization: product.nutrition.normalization,
    rawNutritionBasis: product.nutrition.rawBasisText ?? product.nutrition.declaredBasis,
    sourceUrls: sourceUrlsFor(registry, product.sourceIds),
    sourceAuthority: profile.sourceAuthority,
    proposalKey: anchorProposalKey,
    productKey: product.productKey,
  };
  const catalogInput = {
    productKind: 'commercial_product',
    displayName: product.exactName,
    originalName: product.exactName,
    originalLanguage: null,
    brand: product.brand,
    manufacturer: product.manufacturerOrSupplier,
    explicitlyUnbranded: false,
    canonicalFamily: null,
    category: CATEGORY_BY_SLOT[product.slot],
    countryOfOrigin: null,
    ean: product.identity.gtin,
    barcode: product.identity.gtin,
    provenance: 'product_add_request_admin_v1',
    facts: {
      productAddRequestId: '<requestId>',
      packageSize: packageSize(product),
      packageText: product.package.text,
      ingredientsText: product.ingredientsText,
      allergensText: product.allergensText,
      mayContainAllergens: [],
      labelLanguages: [],
      nutritionBasis: nutrition.basis,
      nutrition,
      sourceEvidence: evidence,
    },
    manualProductProfileProposal: { authority: 'ADMIN_PRODUCT_REQUEST_V1', requestId: '<requestId>' },
  };
  const slotReview = {
    mapper_ingredient_id: product.piIngId,
    approval_reason: `${profile.idempotencyNamespace}: owner workbook ${profile.label} exact-product review for canonical ${product.slot} slot ${product.piIngId}`,
    review_evidence: {
      authority: profile.sourceAuthority,
      slotMatchBasis: `Owner workbook ${registry.source.workbook} selects ${product.exactName} for ${product.slot} (${product.piIngId}); ${product.workbook.piMatch.join(' / ') || 'technical match recorded in workbook'}.`,
      proposalKey: anchorProposalKey,
      productKey: product.productKey,
      workbookSha256: registry.source.sha256,
      productOwnedBehaviorPreserved: true,
      runtimeMapperIdentity: null,
    },
  };
  return { requestPayload, evidencePatch, catalogInput, slotReview };
}

function routeReason(registry, selection) {
  return `${applyProfileFor(registry).idempotencyNamespace}: ${selection.proposalKey}; owner workbook ${registry.source.workbook} sha256 ${registry.source.sha256.slice(0, 12)}`;
}

/** Builds the complete, deterministic DB plan from a registry. */
export function buildApplyPlan(registry) {
  if (registry?.schema !== REGISTRY_SCHEMA) throw new Error('buildApplyPlan: registry schema mismatch');
  const profile = applyProfileFor(registry);
  const selectionByKey = new Map(
    registry.selections.map((selection) => [`${selection.country}|${selection.slot}`, selection]),
  );
  const routeSelection = (product, route) => selectionByKey.get(`${route.country}|${product.slot}`);
  const productsToCreate = [];
  const reuse = [];
  const deferredProducts = [];
  for (const product of registry.products) {
    const routes = product.marketRoutes.map((route) => routeSelection(product, route));
    const creatable = routes.filter((selection) => selection.route.decision === 'ROUTE_CREATABLE_NOW');
    const blockedRoutes = routes
      .filter((selection) => selection.route.decision === 'ROUTE_BLOCKED')
      .map((selection) => ({ country: selection.country, blockers: selection.route.blockers }));
    if (product.catalog.decision === 'REUSE_EXISTING_PR') {
      reuse.push({
        productKey: product.productKey,
        prIng: product.catalog.existingPrIng,
        routesAlreadyPresent: routes
          .filter((selection) => selection.route.decision === 'ROUTE_ALREADY_PRESENT')
          .map((selection) => selection.country),
        routesToAdd: creatable.map((selection) => selection.country),
        blockedRoutes,
      });
      continue;
    }
    if (product.catalog.decision !== 'NEW_PR_REQUIRED' || creatable.length === 0) {
      deferredProducts.push({
        productKey: product.productKey,
        slot: product.slot,
        markets: product.markets,
        catalogDecision: product.catalog.decision,
        engineProfileExpectation: product.readiness.engineProfileExpectation,
        reasons: [
          ...new Set(
            blockedRoutes.flatMap((route) => route.blockers.map((blocker) => blocker.split(':')[0])),
          ),
        ].sort(compare),
      });
      continue;
    }
    const countries = creatable.map((selection) => selection.country).sort(compare);
    const anchor = creatable.find((selection) => selection.country === countries[0]);
    const requestIdempotencyKey = `${profile.idempotencyNamespace}:${product.productKey}`;
    if (requestIdempotencyKey.length < 8 || requestIdempotencyKey.length > 160) {
      throw new Error(`buildApplyPlan: idempotency key length out of range for ${product.productKey}`);
    }
    productsToCreate.push({
      productKey: product.productKey,
      slot: product.slot,
      piIngId: product.piIngId,
      exactName: product.exactName,
      brand: product.brand,
      identityBasis: product.identity.basis,
      gtin: product.identity.gtin,
      requestMarket: countries[0],
      additionalMarkets: countries.slice(1),
      requestIdempotencyKey,
      catalogSubmitIdempotencyKey: `product-request:<requestId>:${profile.catalogSubmitRevision}`,
      routes: creatable
        .map((selection) => ({
          country: selection.country,
          proposalKey: selection.proposalKey,
          mapperIngredientId: product.piIngId,
          assignmentKind: 'PRIMARY_DEFAULT',
          fallbackPriority: null,
          approvalReason: routeReason(registry, selection),
        }))
        .sort((a, b) => compare(a.country, b.country)),
      blockedRoutes,
      ...buildProductPayloads(registry, product, anchor.proposalKey),
    });
  }
  const exact = registry.selections.filter((selection) => selection.selectionKind === 'EXACT_PRODUCT');
  const routeConflicts = exact
    .filter((selection) =>
      selection.route.blockers.some((blocker) => blocker.startsWith('EXISTING_PRIMARY_FOR_OTHER_PRODUCT')),
    )
    .map((selection) => ({
      selectionKey: selection.selectionKey,
      piIngId: selection.piIngId,
      existingPrimary: selection.route.existingPrimary,
      [`${profile.label}ProductKey`]: selection.productKey,
      [`${profile.label}LocalName`]: selection.localName,
      workbookInstruction: registryText(registry, selection.notes.processMessage),
      decision: 'NOT_CHANGED_REQUIRES_SEPARATE_OWNER_DECISION',
    }));
  const fkBlockedByCountry = new Map();
  for (const selection of exact) {
    if (!selection.route.blockers.includes('MARKET_NOT_IN_CATALOG_MARKET_COUNTRIES')) continue;
    if (!fkBlockedByCountry.has(selection.country)) fkBlockedByCountry.set(selection.country, []);
    fkBlockedByCountry.get(selection.country).push(selection.slot);
  }
  const marketRowsNeeded = [...fkBlockedByCountry.entries()]
    .map(([country, slots]) => ({ country, blockedRoutes: slots.length, slots }))
    .sort((a, b) => compare(a.country, b.country));
  const creatableRoutes = productsToCreate.flatMap((product) => product.routes);
  const additionalMarkets = productsToCreate.reduce((sum, product) => sum + product.additionalMarkets.length, 0);
  const productCount = productsToCreate.length;
  return {
    schema: PLAN_SCHEMA,
    registryId: registry.registryId,
    workbook: registry.source.workbook,
    workbookSha256: registry.source.sha256,
    catalogSnapshotCapturedAt: registry.catalogSnapshot.capturedAt,
    projectRef: APPLY_PROJECT_REF,
    sharedWithProduction: true,
    approvalToken: profile.approvalToken,
    scope: profile.scope,
    productsToCreate,
    reuse,
    deferredProducts,
    routeConflicts,
    marketRowsNeeded,
    tableCounts: {
      product_add_requests: productCount,
      products: productCount,
      product_versions: productCount,
      product_behavior_bindings: productCount,
      product_variants: productCount,
      product_variant_markets: productCount + additionalMarkets,
      product_variant_markets_via_ingest: productCount,
      product_variant_markets_via_add_market: additionalMarkets,
      product_canonical_slot_reviews: productCount,
      country_product_slot_assignments: creatableRoutes.length,
      catalog_market_countries: 0,
      mapper_basement: 0,
      pi_ing_created: 0,
    },
    sideEffectsPerProduct: {
      product_add_request_events: 4,
      product_add_request_evidence: 1,
      product_add_request_user_state: 1,
      user_notifications: 2,
      user_contributed_products: 1,
      user_product_relations_favorite_for_requester: 1,
      product_ingest_events: 1,
      admin_audit_rows: 3,
      note: 'Rows written by the sanctioned RPCs themselves (events, audit, notifications, requester favourite). ingest_product_v1 also writes aliases and search documents for the new product.',
    },
    routeCounts: {
      creatableNow: creatableRoutes.length,
      alreadyPresent: reuse.reduce((sum, entry) => sum + entry.routesAlreadyPresent.length, 0),
      blockedByMarketForeignKey: exact.filter((selection) =>
        selection.route.blockers.includes('MARKET_NOT_IN_CATALOG_MARKET_COUNTRIES'),
      ).length,
      blockedOtherwise: exact.filter(
        (selection) =>
          selection.route.decision === 'ROUTE_BLOCKED' &&
          !selection.route.blockers.includes('MARKET_NOT_IN_CATALOG_MARKET_COUNTRIES'),
      ).length,
      existingPrimaryConflicts: routeConflicts.length,
    },
  };
}
