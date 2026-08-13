import {
  findMainEnvelopePolicy,
  validateProductBehaviorRegistry,
} from './behaviorPolicyRegistry';
import type {
  ModuleEligibility,
  ProductBehaviorBinding,
  ProductBehaviorContext,
  ProductBehaviorModule,
  ProductBehaviorRegistry,
  ProductBehaviorSnapshot,
  ProductTechnicalAuthority,
  ProductVerificationAuthority,
  ProductVersionRef,
  ResolvedProductBehavior,
  RuntimeEligibilityState,
  ServerResolvedProductBehavior,
} from './contracts';

export const PRODUCT_BEHAVIOR_RESOLVER_VERSION = 'unified-product-behavior-v1';

export interface ResolveProductBehaviorInput {
  product: ProductVersionRef;
  verification: ProductVerificationAuthority;
  technical: ProductTechnicalAuthority;
  binding: ProductBehaviorBinding;
  context: ProductBehaviorContext;
  registry: ProductBehaviorRegistry;
  hasMinimumLabelFacts: boolean;
  hasKnownCompatiblePrice: boolean;
}

const MODULES: readonly ProductBehaviorModule[] = [
  'SEARCH', 'BASE_RECIPE', 'MAIN', 'OPTIMAL', 'ECO', 'TOPPING',
  'SUBSTITUTION', 'COST', 'MONITOR', 'PRODUCTION', 'LABEL', 'NUTRITION',
  'ALLERGENS', 'PROCESS', 'SUMMARY', 'BATCH_RESCUE', 'MASTER_LABEL',
  'RECIPE_VERSION', 'RESTORE', 'EXPORT', 'SAVE',
];

function entry(
  module: ProductBehaviorModule,
  state: RuntimeEligibilityState,
  ...reasons: string[]
): ModuleEligibility {
  return { module, state, reasons };
}

/**
 * One pure authority for product behaviour. It consumes a server-controlled,
 * versioned binding; it never classifies by display copy and never writes data.
 */
export function resolveProductBehavior(
  input: ResolveProductBehaviorInput,
): ResolvedProductBehavior {
  const registryIssues = validateProductBehaviorRegistry(input.registry);
  const bindingMismatch = input.binding.productVersionId !== input.product.productVersionId;
  const taxonomyMismatch = input.binding.taxonomyVersion !== input.registry.taxonomyVersion;
  const blocked = input.verification.state === 'blocked' || input.verification.state === 'processing';
  const mainPolicy = findMainEnvelopePolicy({
    registry: input.registry,
    policyId: input.binding.mainPolicyId,
    familyId: input.binding.familyId,
    subfamilyId: input.binding.subfamilyId,
    formId: input.binding.formId,
    productProfile: input.context.productProfile,
  });
  const systemBlocked = registryIssues.length > 0 || bindingMismatch || taxonomyMismatch;
  const baseReady = !blocked && !systemBlocked && input.binding.baseAllowed && input.technical.engineReady;
  const toppingReady = !blocked && !systemBlocked && input.binding.toppingAllowed && input.hasMinimumLabelFacts;
  const mainReady = baseReady &&
    (input.binding.mainClassification === 'MAIN_ALLOWED' ||
      input.binding.mainClassification === 'MAIN_PROFILE_SPECIFIC') &&
    mainPolicy !== null;
  const substitutionReady = baseReady && input.binding.substitutionAllowed;
  const labelReady = !blocked && input.binding.labelAllowed && input.hasMinimumLabelFacts;

  const eligibility: Record<ProductBehaviorModule, ModuleEligibility> = {
    SEARCH: blocked
      ? entry('SEARCH', 'blocked', 'catalog_verification_blocked')
      : entry('SEARCH', 'eligible'),
    BASE_RECIPE: baseReady
      ? entry('BASE_RECIPE', 'eligible')
      : entry('BASE_RECIPE', 'blocked', input.technical.engineReady
        ? 'base_policy_not_approved'
        : 'technical_authority_missing'),
    MAIN: mainReady
      ? entry('MAIN', 'eligible')
      : entry('MAIN', 'blocked', mainPolicy ? 'main_policy_not_approved' : 'main_policy_missing'),
    OPTIMAL: mainReady
      ? entry('OPTIMAL', 'eligible')
      : entry('OPTIMAL', 'blocked', 'main_envelope_missing'),
    ECO: mainReady
      ? entry('ECO', input.hasKnownCompatiblePrice ? 'eligible' : 'eligible',
          ...(input.hasKnownCompatiblePrice ? [] : ['price_unknown_not_zero']))
      : entry('ECO', 'blocked', 'main_envelope_missing'),
    TOPPING: toppingReady
      ? entry('TOPPING', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('TOPPING', 'blocked', input.hasMinimumLabelFacts
        ? 'topping_policy_not_approved'
        : 'minimum_label_facts_missing'),
    SUBSTITUTION: substitutionReady
      ? entry('SUBSTITUTION', 'eligible')
      : entry('SUBSTITUTION', 'blocked', 'substitution_not_approved'),
    COST: !blocked && input.binding.costAllowed
      ? entry('COST', input.hasKnownCompatiblePrice ? 'eligible' : 'unknown',
          ...(input.hasKnownCompatiblePrice ? [] : ['price_missing']))
      : entry('COST', 'blocked', 'cost_use_not_approved'),
    MONITOR: entry('MONITOR', 'eligible', input.technical.engineReady
      ? 'base_technical_behavior_available'
      : 'summary_only_no_base_science'),
    PRODUCTION: baseReady || toppingReady
      ? entry('PRODUCTION', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('PRODUCTION', 'blocked', 'no_executable_process_scope'),
    LABEL: labelReady
      ? entry('LABEL', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('LABEL', 'blocked', 'label_facts_missing_or_not_approved'),
    NUTRITION: labelReady
      ? entry('NUTRITION', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('NUTRITION', 'blocked', 'nutrition_facts_missing_or_not_approved'),
    ALLERGENS: labelReady
      ? entry('ALLERGENS', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('ALLERGENS', 'blocked', 'allergen_facts_missing_or_not_approved'),
    PROCESS: baseReady || toppingReady
      ? entry('PROCESS', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('PROCESS', 'blocked', 'process_behavior_not_approved'),
    SUMMARY: baseReady || toppingReady
      ? entry('SUMMARY', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('SUMMARY', 'blocked', 'summary_facts_missing_or_not_approved'),
    BATCH_RESCUE: baseReady
      ? entry('BATCH_RESCUE', 'eligible')
      : entry('BATCH_RESCUE', 'blocked', 'rescue_behavior_not_approved'),
    MASTER_LABEL: labelReady
      ? entry('MASTER_LABEL', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('MASTER_LABEL', 'blocked', 'label_facts_missing_or_not_approved'),
    RECIPE_VERSION: baseReady || toppingReady
      ? entry('RECIPE_VERSION', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('RECIPE_VERSION', 'blocked', 'product_behavior_not_versionable'),
    RESTORE: baseReady || toppingReady
      ? entry('RESTORE', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('RESTORE', 'blocked', 'product_behavior_not_restorable'),
    EXPORT: labelReady
      ? entry('EXPORT', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('EXPORT', 'blocked', 'export_facts_missing_or_not_approved'),
    SAVE: baseReady || toppingReady
      ? entry('SAVE', input.technical.engineReady ? 'eligible' : 'label_only')
      : entry('SAVE', 'blocked', 'product_behavior_not_executable'),
  };

  const warnings = [
    ...input.binding.warnings,
    ...input.technical.reasons,
    ...registryIssues,
    ...(bindingMismatch ? ['product_behavior_binding_version_mismatch'] : []),
    ...(taxonomyMismatch ? ['taxonomy_version_mismatch'] : []),
  ];
  const blockReasons = [
    ...input.binding.blockReasons,
    ...(blocked ? [`catalog_${input.verification.state}`] : []),
    ...(systemBlocked ? ['resolver_contract_invalid'] : []),
  ];

  return {
    schemaVersion: 1,
    product: input.product,
    verification: input.verification,
    technical: input.technical,
    binding: input.binding,
    mainPolicy,
    moduleEligibility: eligibility,
    warnings: [...new Set(warnings)],
    blockReasons: [...new Set(blockReasons)],
    resolverVersion: PRODUCT_BEHAVIOR_RESOLVER_VERSION,
  };
}

export function snapshotResolvedProductBehavior(input: {
  lineId: string;
  processScope: ProductBehaviorSnapshot['processScope'];
  resolved: ResolvedProductBehavior;
}): ProductBehaviorSnapshot {
  const policy = input.resolved.mainPolicy;
  return {
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId: input.lineId,
    productId: input.resolved.product.productId,
    productVersionId: input.resolved.product.productVersionId,
    source: input.resolved.product.source,
    factsFingerprint: input.resolved.product.factsFingerprint,
    behaviorBindingId: input.resolved.binding.bindingId,
    behaviorBindingVersion: input.resolved.binding.bindingVersion,
    taxonomyVersion: input.resolved.binding.taxonomyVersion,
    familyId: input.resolved.binding.familyId,
    subfamilyId: input.resolved.binding.subfamilyId,
    formId: input.resolved.binding.formId,
    verificationState: input.resolved.verification.state,
    technicalAuthority: input.resolved.technical.kind,
    mapperIngredientId: input.resolved.technical.mapperIngredientId,
    mainClassification: input.resolved.binding.mainClassification,
    mainPolicyId: policy?.policyId ?? null,
    mainPolicyVersion: policy?.policyVersion ?? null,
    ecoFloorPercent: policy?.ecoFloorPercent ?? null,
    optimalCeilingPercent: policy?.optimalCeilingPercent ?? null,
    hardLimitPercent: policy?.hardLimitPercent ?? null,
    mainEquivalentFactor: policy?.mainEquivalentFactor ?? null,
    mainBasis: policy?.basis ?? null,
    requiresLiquidDairyCarrier: policy?.requiresLiquidDairyCarrier ?? false,
    liquidDairyCarrierFloorPercent: policy?.liquidDairyCarrierFloorPercent ?? null,
    approvedMixedFamilyIds: [...(policy?.approvedMixedFamilyIds ?? [])],
    moduleEligibility: Object.fromEntries(
      Object.entries(input.resolved.moduleEligibility).map(([module, value]) => [module, value.state]),
    ),
    processScope: input.processScope,
    approvedLiquidDairyCarrier: input.resolved.binding.approvedLiquidDairyCarrier,
    resolverVersion: input.resolved.resolverVersion,
    sharedFacts: null,
    warnings: [...input.resolved.warnings],
    blockReasons: [...input.resolved.blockReasons],
  };
}

/** Converts the authenticated server result into the only recipe-side product
 * behavior snapshot. Consumers persist/read this snapshot; they do not
 * reinterpret catalog status, names, or Mapper rows. */
export function snapshotServerResolvedProductBehavior(input: {
  lineId: string;
  processScope: ProductBehaviorSnapshot['processScope'];
  resolved: ServerResolvedProductBehavior;
}): ProductBehaviorSnapshot {
  const policy = input.resolved.mainPolicy;
  const mainEligible =
    input.processScope === 'BASE_FORMULATION' &&
    input.resolved.state === 'eligible' &&
    (input.resolved.mainEligibility === 'MAIN_ALLOWED' ||
      input.resolved.mainEligibility === 'MAIN_PROFILE_SPECIFIC') &&
    policy !== null;
  return {
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId: input.lineId,
    productId: input.resolved.productId,
    productVersionId: input.resolved.productVersionId,
    source: input.resolved.entityKind === 'mapper' ? 'mapper' : 'catalog_import',
    factsFingerprint: input.resolved.factsFingerprint,
    behaviorBindingId: input.resolved.behaviorBindingId,
    behaviorBindingVersion: input.resolved.behaviorBindingVersion,
    taxonomyVersion: input.resolved.taxonomyVersion,
    familyId: input.resolved.familyId,
    subfamilyId: input.resolved.subfamilyId,
    formId: input.resolved.formId,
    verificationState:
      input.resolved.catalogStatus === 'pi_base' ? 'verified' : input.resolved.catalogStatus,
    technicalAuthority: input.resolved.mapperIngredientId ? 'mapper_exact' : 'none',
    mapperIngredientId: input.resolved.mapperIngredientId,
    mainClassification: input.resolved.mainEligibility,
    mainPolicyId: policy?.policyId ?? null,
    mainPolicyVersion: policy?.policyVersion ?? null,
    ecoFloorPercent: policy?.ecoFloorPercent ?? null,
    optimalCeilingPercent: policy?.optimalCeilingPercent ?? null,
    hardLimitPercent: policy?.hardLimitPercent ?? null,
    mainEquivalentFactor: policy?.mainEquivalentFactor ?? null,
    mainBasis: policy?.basis ?? null,
    requiresLiquidDairyCarrier: policy?.requiresLiquidDairyCarrier ?? false,
    liquidDairyCarrierFloorPercent: policy?.liquidDairyCarrierFloorPercent ?? null,
    approvedMixedFamilyIds: [...(policy?.approvedMixedFamilyIds ?? [])],
    processScope: input.processScope,
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
        value.mainPolicyId,
        value.mainPolicyVersion,
        value.mainBasis,
        value.ecoFloorPercent,
        value.optimalCeilingPercent,
        value.hardLimitPercent,
        value.mainEquivalentFactor,
        value.requiresLiquidDairyCarrier,
        value.liquidDairyCarrierFloorPercent,
        value.approvedLiquidDairyCarrier,
        value.approvedMixedFamilyIds,
        value.moduleEligibility,
        value.processScope,
        value.sharedFacts ?? null,
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
  const resolutionState = row.resolutionState ?? 'RESOLVED';
  if (
    resolutionState !== 'RESOLVED' &&
    resolutionState !== 'LEGACY_RECONSTRUCTED' &&
    resolutionState !== 'REVALIDATION_REQUIRED'
  ) return null;
  return structuredClone({ ...row, resolutionState } as ProductBehaviorSnapshot);
}

/** Context is resolved once; consumers only read the named module result. */
export function moduleEligibility(
  resolved: ResolvedProductBehavior,
  module: ProductBehaviorModule,
): ModuleEligibility {
  return resolved.moduleEligibility[module];
}

export const PRODUCT_BEHAVIOR_MODULES = MODULES;
