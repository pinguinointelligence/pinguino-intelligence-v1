import {
  ICE_ANCHOR_ROWS,
  isSorbetFreezingTemperatureSupported,
  sorbetFreezingUnavailableReasonFromWarnings,
  type RecipeInput,
  type RecipeResult,
  type TargetMetric,
} from '@/engine';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import {
  evaluateRecipeConstraintAuthority,
  type RecipeConstraintAuthorityResult,
} from './recipeConstraintAuthority';

export type FreezingStabilityStatus = 'GOOD' | 'ATTENTION' | 'UNAVAILABLE' | 'STALE';
export type FreezingStabilityCalculationState = 'CURRENT' | 'STALE';

export type FreezingStabilityReason =
  | 'calculation_stale'
  | 'calculation_unavailable'
  | 'product_behavior_unavailable'
  | 'profile_evidence_unavailable'
  | 'direct_ice_authority_unavailable'
  | 'sorbet_freezing_authority_unavailable'
  | 'alcohol_safety_violation'
  | 'canonical_constraint_violation'
  | 'canonical_constraint_passed';

export interface FreezingStabilityAssessment {
  status: FreezingStabilityStatus;
  reasons: FreezingStabilityReason[];
  result: RecipeResult;
  constraintAuthority: RecipeConstraintAuthorityResult;
}

export interface FreezingStabilityAssessmentInput {
  recipe: RecipeInput;
  snapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  calculationState: FreezingStabilityCalculationState;
}

const FREEZING_INDICATORS: readonly TargetMetric[] = ['npac', 'ice_fraction'];

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Anchor-calibrated categories (Gelato / Protein) certify freezing only from a
 * same-temperature seeded row of their OWN category — the milk_gelato category
 * fallback is deliberately insufficient for GOOD. Unchanged by the Sorbet path.
 */
const hasDirectSeededIceAuthority = (recipe: RecipeInput): boolean =>
  ICE_ANCHOR_ROWS.some(
    (row) =>
      row.category === recipe.category &&
      row.temperature_c === recipe.target_temperature_c &&
      row.status === 'seeded',
  );

/**
 * Sorbet never uses seeded ice anchors. Its direct freezing authority is the
 * composition-sensitive solver in `calculateRecipe`: an authoritative result has
 * a finite total-mix ice fraction, carries no `sorbet_freezing_*` unavailable
 * warning and sits at a supported serving temperature. Anything else fails
 * closed — unsupported compositions are never turned green.
 */
const hasSorbetCompositionFreezingAuthority = (
  recipe: RecipeInput,
  result: RecipeResult,
): boolean =>
  recipe.category === 'sorbet' &&
  isSorbetFreezingTemperatureSupported(recipe.target_temperature_c) &&
  finite(result.ice_fraction_percent) &&
  sorbetFreezingUnavailableReasonFromWarnings(result.warnings) === null;

/**
 * Monitor-status ice authority. Deliberately stricter than the engine's
 * `hasDirectIceAuthorityAtTemperature` (which accepts the documented milk_gelato
 * fallback for tuning approval): status GOOD needs own-category direct authority.
 */
const hasMonitorStatusIceAuthority = (recipe: RecipeInput, result: RecipeResult): boolean =>
  recipe.category === 'sorbet'
    ? hasSorbetCompositionFreezingAuthority(recipe, result)
    : hasDirectSeededIceAuthority(recipe);

const directIceAuthorityReason = (recipe: RecipeInput): FreezingStabilityReason =>
  recipe.category === 'sorbet'
    ? 'sorbet_freezing_authority_unavailable'
    : 'direct_ice_authority_unavailable';

const hasCompleteFreezingResult = (result: RecipeResult): boolean => {
  if (
    result.total_batch_g <= 0 ||
    !finite(result.pac_points) ||
    !finite(result.npac_points) ||
    !finite(result.ice_fraction_percent)
  ) {
    return false;
  }

  return FREEZING_INDICATORS.every((metric) => {
    const indicator = result.indicators.find((candidate) => candidate.key === metric);
    return (
      finite(indicator?.value) &&
      finite(indicator?.band?.min) &&
      finite(indicator?.band?.max) &&
      indicator?.band_status === 'seeded' &&
      indicator.category_fallback !== true &&
      indicator.temperature_fallback !== true
    );
  });
};

/**
 * Canonical qualitative truth for the professional Monitor row. It evaluates
 * the exact supplied BASE through the existing unified constraint authority;
 * React only translates the returned state. Category fallback ice curves are
 * deliberately insufficient for GOOD; Sorbet is certified only by its own
 * composition-sensitive freezing authority (never by milk_gelato anchors).
 */
export function evaluateFreezingStabilityStatus(
  input: FreezingStabilityAssessmentInput,
): FreezingStabilityAssessment {
  const snapshots = input.snapshots ?? {};
  const constraintAuthority = evaluateRecipeConstraintAuthority({
    recipe: input.recipe,
    snapshots,
    module: 'MONITOR',
  });
  const result = constraintAuthority.result;

  if (input.calculationState === 'STALE') {
    return {
      status: 'STALE',
      reasons: ['calculation_stale'],
      result,
      constraintAuthority,
    };
  }

  const behaviorAuthority = buildRecipeBehaviorAuthority({
    items: input.recipe.items,
    snapshots,
  });
  if (!recipeBehaviorModuleGate(behaviorAuthority, 'MONITOR').ready) {
    return {
      status: 'UNAVAILABLE',
      reasons: ['product_behavior_unavailable'],
      result,
      constraintAuthority,
    };
  }

  if (!hasCompleteFreezingResult(result)) {
    return {
      status: 'UNAVAILABLE',
      reasons:
        input.recipe.category === 'sorbet' &&
        sorbetFreezingUnavailableReasonFromWarnings(result.warnings) !== null
          ? ['sorbet_freezing_authority_unavailable']
          : ['calculation_unavailable'],
      result,
      constraintAuthority,
    };
  }

  if (
    constraintAuthority.issues.some(
      (issue) => issue.source === 'profile' && issue.code === 'profile_evidence_missing',
    )
  ) {
    return {
      status: 'UNAVAILABLE',
      reasons: ['profile_evidence_unavailable'],
      result,
      constraintAuthority,
    };
  }

  if (result.warnings.some((warning) => warning.code === 'alcohol_above_safe_range')) {
    return {
      status: 'ATTENTION',
      reasons: ['alcohol_safety_violation'],
      result,
      constraintAuthority,
    };
  }

  if (!hasMonitorStatusIceAuthority(input.recipe, result)) {
    return {
      status: 'UNAVAILABLE',
      reasons: [directIceAuthorityReason(input.recipe)],
      result,
      constraintAuthority,
    };
  }

  if (!constraintAuthority.valid) {
    return {
      status: 'ATTENTION',
      reasons: ['canonical_constraint_violation'],
      result,
      constraintAuthority,
    };
  }

  return {
    status: 'GOOD',
    reasons: ['canonical_constraint_passed'],
    result,
    constraintAuthority,
  };
}
