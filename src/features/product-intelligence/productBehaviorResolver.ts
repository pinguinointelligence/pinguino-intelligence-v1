import type {
  ProductBehaviorContext,
  ProductBehaviorSnapshot,
  ServerResolvedProductBehavior,
} from './contracts';

/** Converts the authenticated server result into the only recipe-side product
 * behavior snapshot. Consumers persist/read this snapshot; they do not
 * reinterpret catalog status, names, or Mapper rows. */
export function snapshotServerResolvedProductBehavior(input: {
  lineId: string;
  processScope: ProductBehaviorSnapshot['processScope'];
  resolved: ServerResolvedProductBehavior;
}): ProductBehaviorSnapshot {
  const policy = input.resolved.mainPolicy;
  const provenance = input.resolved.provenance;
  const catalogSource: ProductBehaviorSnapshot['source'] = (() => {
    if (input.resolved.entityKind === 'mapper') return 'mapper';
    if (provenance === 'label_scan' || provenance === 'ocr') return 'ocr';
    if (provenance === 'barcode_ean' || provenance === 'barcode') return 'barcode';
    if (provenance === 'manual') return 'manual';
    if (provenance === 'admin') return 'admin';
    if (provenance === 'retailer_feed' || provenance === 'mercadona') return 'retailer_feed';
    if (provenance === 'spreadsheet' || provenance === 'customer_upload') return 'spreadsheet';
    if (provenance === 'supplier_specification') return 'supplier_specification';
    if (provenance === 'shop') return 'shop';
    if (provenance === 'franchise') return 'franchise';
    if (provenance === 'internal_subproduct') return 'internal_subproduct';
    if (provenance === 'future_integration' || provenance === 'api') return 'future_integration';
    return 'catalog_import';
  })();
  const context = input.resolved.context as Partial<ProductBehaviorContext>;
  const resolutionContext: ProductBehaviorContext | null =
    typeof context.accountId !== 'undefined' &&
    typeof context.productProfile === 'string' &&
    typeof context.temperatureC === 'number' &&
    (context.mode === 'optimal' || context.mode === 'eco') &&
    (context.processScope === 'BASE_FORMULATION' || context.processScope === 'POST_PROCESS_ADDON') &&
    (context.requestedRole === 'STANDARD' || context.requestedRole === 'MAIN') &&
    typeof context.module === 'string'
      ? context as ProductBehaviorContext
      : null;
  // GLOBAL MAIN AUTHORITY (owner v1.4 §4/§5): a missing calibrated envelope is
  // a science gap, not an eligibility gap. The server now answers the semantic
  // question separately; an uncalibrated flavour carrier stays MAIN-eligible
  // and is held at the owner's grams instead of borrowing an invented range.
  const serverCapability = input.resolved.mainCapability ?? null;
  const mainEligible =
    input.processScope === 'BASE_FORMULATION' &&
    (serverCapability === null
      ? input.resolved.state === 'eligible' &&
        (input.resolved.mainEligibility === 'MAIN_ALLOWED' ||
          input.resolved.mainEligibility === 'MAIN_PROFILE_SPECIFIC') &&
        policy !== null
      : serverCapability === 'MAIN_CAPABLE' ||
        serverCapability === 'MAIN_CAPABLE_UNCALIBRATED');
  return {
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId: input.lineId,
    productId: input.resolved.productId,
    productVersionId: input.resolved.productVersionId,
    source: catalogSource,
    factsFingerprint: input.resolved.factsFingerprint,
    behaviorBindingId: input.resolved.behaviorBindingId,
    behaviorBindingVersion: input.resolved.behaviorBindingVersion,
    taxonomyVersion: input.resolved.taxonomyVersion,
    familyId: input.resolved.familyId,
    subfamilyId: input.resolved.subfamilyId,
    formId: input.resolved.formId,
    verificationState:
      // Legacy server builds returned only `pi_base` and therefore cannot prove
      // a Verified provenance state. Keep that fallback honestly unverified;
      // the forward resolver returns exact normalized Mapper provenance.
      input.resolved.catalogStatus === 'pi_base'
        ? 'manual_unverified'
        : input.resolved.catalogStatus,
    mapperVerificationStatus: input.resolved.mapperVerificationStatus ?? null,
    technicalAuthority: input.resolved.mapperIngredientId ? 'mapper_exact' : 'none',
    mapperIngredientId: input.resolved.mapperIngredientId,
    mainClassification: input.resolved.mainEligibility,
    ...(input.resolved.behaviorRole ? { behaviorRole: input.resolved.behaviorRole } : {}),
    ...(serverCapability ? { mainCapability: serverCapability } : {}),
    ...(input.resolved.mainAuthority ? { mainAuthority: input.resolved.mainAuthority } : {}),
    ...(input.resolved.mainCalibrationLevel
      ? { mainCalibrationLevel: input.resolved.mainCalibrationLevel }
      : {}),
    mainPolicyId: policy?.policyId ?? null,
    mainPolicyVersion: policy?.policyVersion ?? null,
    ecoFloorPercent: policy?.ecoFloorPercent ?? null,
    optimalCeilingPercent: policy?.optimalCeilingPercent ?? null,
    hardLimitPercent: policy?.hardLimitPercent ?? null,
    multiMainHardLimitPercent: policy?.multiMainHardLimitPercent ?? null,
    mainEquivalentFactor: policy?.mainEquivalentFactor ?? null,
    mainBasis: policy?.basis ?? null,
    requiresLiquidDairyCarrier: policy?.requiresLiquidDairyCarrier ?? false,
    liquidDairyCarrierFloorPercent: policy?.liquidDairyCarrierFloorPercent ?? null,
    approvedMixedFamilyIds: [...(policy?.approvedMixedFamilyIds ?? [])],
    processScope: input.processScope,
    resolutionContext,
    approvedLiquidDairyCarrier: input.resolved.approvedLiquidDairyCarrier,
    resolverVersion: input.resolved.resolverVersion,
    sharedFacts: input.resolved.sharedFacts
      ? structuredClone(input.resolved.sharedFacts)
      : null,
    moduleEligibility: {
      ...input.resolved.moduleEligibility,
      [input.resolved.module]: input.resolved.state,
      ...(input.processScope === 'BASE_FORMULATION'
        ? { BASE_RECIPE: input.resolved.state, MAIN: mainEligible ? 'eligible' : 'blocked' }
        : { TOPPING: input.resolved.state }),
    },
    warnings: [...input.resolved.warnings],
    blockReasons: [...input.resolved.blockReasons],
  };
}

export function productBehaviorSnapshotFingerprint(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): string {
  return JSON.stringify(
    Object.entries(snapshots)
      .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([lineId, value]) => [
        lineId,
        value.productVersionId,
        value.resolutionState,
        value.factsFingerprint,
        value.behaviorBindingId,
        value.behaviorBindingVersion,
        value.taxonomyVersion,
        value.mapperVerificationStatus ?? null,
        value.mainCapability ?? null,
        value.mainAuthority ?? null,
        value.mainCalibrationLevel ?? null,
        value.behaviorRole ?? null,
        value.mainPolicyId,
        value.mainPolicyVersion,
        value.mainBasis,
        value.ecoFloorPercent,
        value.optimalCeilingPercent,
        value.hardLimitPercent,
        value.multiMainHardLimitPercent ?? null,
        value.mainEquivalentFactor,
        value.requiresLiquidDairyCarrier,
        value.liquidDairyCarrierFloorPercent,
        value.approvedLiquidDairyCarrier,
        value.approvedMixedFamilyIds,
        value.moduleEligibility,
        value.processScope,
        value.resolutionContext,
        value.sharedFacts ?? null,
        value.historicalIdentity ?? null,
      ]),
  );
}

export function readProductBehaviorSnapshot(value: unknown): ProductBehaviorSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ProductBehaviorSnapshot>;
  if (
    row.schemaVersion !== 1 ||
    typeof row.lineId !== 'string' || !row.lineId ||
    typeof row.productId !== 'string' || !row.productId ||
    typeof row.productVersionId !== 'string' || !row.productVersionId ||
    typeof row.factsFingerprint !== 'string' || !row.factsFingerprint ||
    typeof row.behaviorBindingId !== 'string' || !row.behaviorBindingId ||
    typeof row.behaviorBindingVersion !== 'string' || !row.behaviorBindingVersion ||
    typeof row.taxonomyVersion !== 'string' || !row.taxonomyVersion ||
    (row.processScope !== 'BASE_FORMULATION' && row.processScope !== 'POST_PROCESS_ADDON') ||
    !Array.isArray(row.warnings) || !row.warnings.every((entry) => typeof entry === 'string') ||
    !Array.isArray(row.blockReasons) || !row.blockReasons.every((entry) => typeof entry === 'string')
  ) return null;
  if (row.sharedFacts !== undefined && row.sharedFacts !== null) {
    const facts = row.sharedFacts;
    if (
      typeof facts !== 'object' ||
      facts.schemaVersion !== 1 ||
      (facts.technicalComposition !== null && typeof facts.technicalComposition !== 'object') ||
      (facts.nutritionPer100g !== null && typeof facts.nutritionPer100g !== 'object') ||
      (facts.allergens !== null && typeof facts.allergens !== 'object') ||
      !Array.isArray(facts.processEvidence) ||
      !Array.isArray(facts.profileEligibility)
    ) return null;
  }
  if (row.historicalIdentity !== undefined) {
    const historical = row.historicalIdentity;
    if (
      !historical ||
      historical.schemaVersion !== 1 ||
      typeof historical.sourceRecipeId !== 'string' ||
      typeof historical.sourceRecipeVersionId !== 'string' ||
      typeof historical.sourceProductId !== 'string' ||
      typeof historical.sourceProductVersionId !== 'string' ||
      typeof historical.sourceBehaviorBindingId !== 'string' ||
      typeof historical.canonicalProductId !== 'string' ||
      typeof historical.canonicalProductVersionId !== 'string' ||
      typeof historical.canonicalBehaviorBindingId !== 'string' ||
      !(historical.canonicalProductCode === null ||
        typeof historical.canonicalProductCode === 'string') ||
      ![
        'DIRECT_CURRENT',
        'VERSION_SUCCESSOR',
        'PRODUCT_MERGE',
        'IMMUTABLE_SNAPSHOT',
      ].includes(historical.resolutionKind)
    ) return null;
  }
  const resolutionContext = row.resolutionContext ?? null;
  const resolutionState = (row.resolutionState ?? 'RESOLVED') === 'RESOLVED' && resolutionContext === null
    ? 'REVALIDATION_REQUIRED'
    : row.resolutionState ?? 'RESOLVED';
  if (
    resolutionState !== 'RESOLVED' &&
    resolutionState !== 'LEGACY_RECONSTRUCTED' &&
    resolutionState !== 'REVALIDATION_REQUIRED'
  ) return null;
  return structuredClone({ ...row, resolutionState, resolutionContext } as ProductBehaviorSnapshot);
}
