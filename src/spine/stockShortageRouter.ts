/**
 * PINGUINO Spine — Stock Shortage decision branch (Integration Flow IF10,
 * Phase C Slice 18). The sibling of IF9 (batchRescueRouter).
 *
 * A PURE, unwired router for planned production where one or more required
 * ingredients are unavailable or insufficient — locked Integration_Flow.md §18
 * and Optimizer.md §7A.1. The router assesses each shortage line, applies the
 * substitution safety gates, and recommends ONE feasible strategy; the final
 * choice is ALWAYS the user's, via the LOCKED five-option
 * `StockShortageUserDecision` menu (§18: shortage is an explicit user-decision
 * branch — nothing is chosen silently).
 *
 * Hard rules encoded here (locked §18 rules + slice safety invariants):
 *  - missing stock is never invented; the hero ingredient is never silently
 *    reduced; an ingredient is never silently replaced; the quality tier is
 *    never changed (echoed untouched);
 *  - replacement requires VERIFIED ingredient data (locked acceptance test 28)
 *    — the caller asserts verification; this router never reads any catalog or
 *    Mapper data and never treats Mapper products as calibrated references;
 *  - allergen-carrying, alcohol-carrying and sweetener/polyol/HIS substitutes
 *    are NEVER silent: each requires its own explicit approval flag, and a
 *    dairy substitute into a profile that forbids dairy (sorbet/vegan) is a
 *    hard block that NO flag can override;
 *  - unknown profiles and unknown/unlisted substitute families are blocked or
 *    reported, never remapped or guessed;
 *  - NO exact grams are emitted (no gram field exists on any action) — batch
 *    scaling is expressed as a dimensionless ratio of the limiting line, and
 *    every strategy carries its required NEXT calculation for the engine to
 *    verify; nothing here can fake a recalculated recipe;
 *  - no DB, no inventory write, no Mapper, no persistence, no recipe mutation
 *    (the recipe snapshot is opaque and echoed as a trace flag only).
 *
 * Capability: the spine access layer defines `canUseStockShortageWorkflow`
 * (demo: false, paid: true) — surfaced on the result as the UI gate.
 */
import {
  DAIRY_CORRECTION_FAMILIES,
  PRODUCT_PROFILE_REGISTRY,
  type CorrectionFamily,
} from './productProfiles';
import {
  SPINE_CONTRACT_VERSION,
  type ProductProfile,
  type SpineContractVersion,
} from './types';

export type StockShortageVersion = '0.1.0';
export const STOCK_SHORTAGE_VERSION: StockShortageVersion = '0.1.0';

/* ------------------------------------------------------------------------ *
 * Contracts                                                                  *
 * ------------------------------------------------------------------------ */

/** A candidate replacement for one short line. All safety-relevant properties
 * are CALLER-ASSERTED inputs — this router never reads a catalog to find out. */
export interface StockShortageSubstitute {
  ingredientName: string;
  available: boolean;
  /** Locked rule (§18 / acceptance 28): replacement requires verified data. */
  hasVerifiedIngredientData: boolean;
  /** The substitute's correction family, when known — validated per profile. */
  correctionFamily?: CorrectionFamily | null;
  isDairy?: boolean;
  containsAllergens?: boolean;
  containsAlcohol?: boolean;
  isSweetenerPolyolOrHis?: boolean;
}

/** One short recipe line: what the recipe needs vs what is in stock. */
export interface StockShortageLine {
  lineId: string;
  ingredientName: string;
  /** The line's correction family, when known. */
  correctionFamily?: CorrectionFamily | null;
  /** Grams the recipe requires — null/unknown blocks (missing data). */
  requiredG: number | null;
  /** Grams available in stock — 0 = missing entirely; null/unknown blocks. */
  availableG: number | null;
  /** Hero/main ingredient — never silently reduced (locked §18). */
  isHero?: boolean;
  substitute?: StockShortageSubstitute | null;
}

export interface StockShortageObservation {
  shortages: StockShortageLine[];
}

export interface StockShortageConstraints {
  canScaleBatchDown: boolean;
  /** Smallest batch the operator accepts after scaling, when known. */
  minAcceptableBatchG?: number | null;
  canReformulate: boolean;
  /** Buying the missing ingredient / waiting for delivery is an option today. */
  purchaseOrWaitPossible: boolean;
  /** Explicit approvals — substitution is NEVER silent (locked §18). */
  allergenSubstitutionApproved?: boolean;
  alcoholSubstitutionApproved?: boolean;
  sweetenerSubstitutionRuleApproved?: boolean;
}

export interface StockShortageIntent {
  /** Untrusted — an unsupported profile is blocked, never remapped. */
  productProfile: string;
  /** Echoed untouched — the quality tier is never silently changed. */
  qualityTier?: string;
  /** Planned batch mass, when known (bounds the scale-down check). */
  batchSizeG?: number | null;
  /** The planned recipe / snapshot — opaque to this router, never mutated. */
  recipeSnapshot?: unknown;
  observation: StockShortageObservation;
  constraints: StockShortageConstraints;
}

/**
 * The router's feasibility decision (which strategy it recommends).
 * Naming note: the LOCKED docs bind the name `StockShortageDecision` to the
 * five-option USER union (Integration_Flow.md §18 / Optimizer.md §7A.1) — that
 * union is `StockShortageUserDecision` below; this ROUTE decision deliberately
 * takes a different name so the locked vocabulary is never repurposed.
 */
export type StockShortageRouteDecision =
  | 'substitution_possible'
  | 'scale_down_possible'
  | 'reformulation_required'
  | 'purchase_required'
  | 'production_blocked'
  | 'blocked_missing_data'
  | 'not_supported';

/** LOCKED Integration_Flow.md §18 / Optimizer.md §7A.1 — the user-decision
 * menu (named `StockShortageDecision` in the locked docs). The user always
 * chooses; the router only recommends. */
export type StockShortageUserDecision =
  | 'reduce_batch_to_available_stock'
  | 'replace_ingredient'
  | 'keep_batch_and_mark_missing'
  | 'best_possible_lower_intensity'
  | 'stop_and_buy_missing_product';

export const STOCK_SHORTAGE_USER_DECISIONS: readonly StockShortageUserDecision[] = [
  'reduce_batch_to_available_stock',
  'replace_ingredient',
  'keep_batch_and_mark_missing',
  'best_possible_lower_intensity',
  'stop_and_buy_missing_product',
];

/** One direction-level strategy action. STRUCTURALLY gram-free: the only
 * number is a dimensionless batch RATIO — no gram field exists. */
export interface StockShortageAction {
  kind: 'use_substitute' | 'scale_batch_down' | 'reformulate_recipe' | 'purchase_or_wait';
  /** The short line this action addresses; null for batch-level actions. */
  lineId: string | null;
  substituteName: string | null;
  /** Batch scale ratio from the limiting line (0–1) — a ratio, never grams. */
  scaleFactor: number | null;
  notes: string[];
}

/** Per-line assessment — carried in the trace for full auditability. */
export interface StockShortageLineAssessment {
  lineId: string;
  shortageType: 'missing' | 'insufficient' | 'not_short';
  /** availableG / requiredG (0 for missing; null when not computable). */
  availabilityRatio: number | null;
  isHero: boolean;
  substitutionViable: boolean;
  substitutionBlockedReasons: string[];
}

export interface StockShortageTrace {
  stockShortageVersion: StockShortageVersion;
  branch: string;
  profileSupported: boolean;
  lineAssessments: StockShortageLineAssessment[];
  /** min availability ratio across short lines (the limiting line), if computable. */
  limitingRatio: number | null;
  qualityTierEchoed: string | null;
  recipeSnapshotProvided: boolean;
  strategyOrder: 'substitution>scale_down>purchase>reformulation>blocked';
}

export interface StockShortageResult {
  decision: StockShortageRouteDecision;
  recommendedActions: StockShortageAction[];
  risks: string[];
  warnings: string[];
  /** Measurements / next CALCULATIONS required before producing anything. */
  requiredMeasurements: string[];
  blockedReason: string | null;
  /** Locked §18 menu — full on feasible decisions; limited/empty when blocked. */
  nextUserDecisionOptions: StockShortageUserDecision[];
  /** Why the menu is limited, when it is. */
  menuLimitedReason: string | null;
  /** The existing spine capability that gates this flow in the UI. */
  capabilityGate: 'canUseStockShortageWorkflow';
  trace: StockShortageTrace;
  contractVersion: SpineContractVersion;
}

/* ------------------------------------------------------------------------ *
 * Assessment helpers                                                         *
 * ------------------------------------------------------------------------ */

const isSupportedProfile = (p: string): boolean =>
  Object.prototype.hasOwnProperty.call(PRODUCT_PROFILE_REGISTRY, p);

const DAIRY: ReadonlySet<string> = new Set(DAIRY_CORRECTION_FAMILIES);

function assessSubstitution(
  line: StockShortageLine,
  profile: ProductProfile,
  constraints: StockShortageConstraints,
): { viable: boolean; reasons: string[] } {
  const substitute = line.substitute;
  const reasons: string[] = [];
  if (!substitute || !substitute.available) {
    return { viable: false, reasons: ['no_substitute_available'] };
  }
  const def = PRODUCT_PROFILE_REGISTRY[profile];
  const allowed = new Set<string>(def.allowedCorrectionFamilies);
  const forbidden = new Set<string>(def.forbiddenCorrectionFamilies);

  // Locked acceptance 28: replacement requires verified ingredient data. The
  // router never verifies anything itself — the caller must assert it.
  if (!substitute.hasVerifiedIngredientData) reasons.push('substitute_data_not_verified');

  // Dairy into a dairy-forbidding profile (sorbet/vegan) — a HARD block that
  // no approval flag can override.
  const family = substitute.correctionFamily ?? null;
  const substituteIsDairy = substitute.isDairy === true || (family !== null && DAIRY.has(family));
  if (substituteIsDairy && (forbidden.has('milk') || forbidden.has('cream') || forbidden.has('skimmed_milk_powder'))) {
    reasons.push('dairy_substitute_forbidden_for_profile');
  }

  // Family gate: an unknown or unlisted family is NOT allowed — never remapped.
  if (family !== null && !allowed.has(family)) {
    reasons.push('substitute_family_not_allowed_for_profile');
  }
  if (family === null) {
    // Without a family the Designer cannot judge strategy fit (locked §18) —
    // blocked as unverifiable, never guessed.
    reasons.push('substitute_family_unknown');
  }

  // Explicit-approval gates — substitution is never silent.
  if (substitute.containsAllergens === true && constraints.allergenSubstitutionApproved !== true) {
    reasons.push('allergen_substitution_requires_explicit_approval');
  }
  if (substitute.containsAlcohol === true && constraints.alcoholSubstitutionApproved !== true) {
    reasons.push('alcohol_substitution_requires_explicit_approval');
  }
  if (substitute.isSweetenerPolyolOrHis === true && constraints.sweetenerSubstitutionRuleApproved !== true) {
    reasons.push('sweetener_polyol_his_substitution_requires_supported_rule');
  }

  return { viable: reasons.length === 0, reasons };
}

/* ------------------------------------------------------------------------ *
 * Router                                                                     *
 * ------------------------------------------------------------------------ */

/**
 * Route one stock-shortage observation to a feasibility decision. Pure,
 * deterministic, mutates nothing. Strategy precedence (fixed, documented):
 * substitution (safest for the recipe truth) → scale-down (keeps composition,
 * uniform ratio) → purchase/wait (keeps the recipe unchanged) → reformulation
 * (changes the recipe — last resort) → production_blocked. The USER decides
 * via the locked §18 menu; the router never executes anything.
 */
export function routeStockShortage(intent: StockShortageIntent): StockShortageResult {
  const { observation, constraints } = intent;
  const warnings: string[] = [];
  const risks: string[] = [];
  const requiredMeasurements: string[] = [];

  const trace: StockShortageTrace = {
    stockShortageVersion: STOCK_SHORTAGE_VERSION,
    branch: 'unrouted',
    profileSupported: isSupportedProfile(intent.productProfile),
    lineAssessments: [],
    limitingRatio: null,
    qualityTierEchoed: intent.qualityTier ?? null,
    recipeSnapshotProvided: intent.recipeSnapshot != null,
    strategyOrder: 'substitution>scale_down>purchase>reformulation>blocked',
  };

  const result = (
    decision: StockShortageRouteDecision,
    branch: string,
    extra: Partial<
      Pick<
        StockShortageResult,
        'recommendedActions' | 'blockedReason' | 'nextUserDecisionOptions' | 'menuLimitedReason'
      >
    > = {},
  ): StockShortageResult => ({
    decision,
    recommendedActions: extra.recommendedActions ?? [],
    risks,
    warnings,
    requiredMeasurements,
    blockedReason: extra.blockedReason ?? null,
    nextUserDecisionOptions: extra.nextUserDecisionOptions ?? [],
    menuLimitedReason: extra.menuLimitedReason ?? null,
    capabilityGate: 'canUseStockShortageWorkflow',
    trace: { ...trace, branch },
    contractVersion: SPINE_CONTRACT_VERSION,
  });

  // 1. Unsupported profile — reported, never remapped.
  if (!trace.profileSupported) {
    return result('not_supported', 'unsupported_profile', {
      blockedReason: 'unsupported_product_profile',
      menuLimitedReason: 'profile_not_supported_no_decisions_offered',
    });
  }
  const profile = intent.productProfile as ProductProfile;

  // 2. An observation with at least one line is required.
  if (!observation || !Array.isArray(observation.shortages) || observation.shortages.length === 0) {
    requiredMeasurements.push('list_short_ingredient_lines');
    return result('blocked_missing_data', 'missing_observation', {
      blockedReason: 'missing_shortage_observation',
      menuLimitedReason: 'no_shortage_described_no_decisions_offered',
    });
  }

  // 2b. Line ids must be unique — a duplicated id makes per-line assessment,
  // actions and the trace ambiguous (a malformed observation, never guessed).
  const lineIds = observation.shortages.map((l) => l.lineId);
  if (new Set(lineIds).size !== lineIds.length) {
    requiredMeasurements.push('assign_unique_line_ids');
    return result('blocked_missing_data', 'duplicate_line_ids', {
      blockedReason: 'duplicate_line_ids',
      menuLimitedReason: 'observation_malformed_no_decisions_offered',
    });
  }

  // 3. Every line needs both quantities — missing stock is never invented.
  const quantitiesMissing = observation.shortages.some(
    (l) =>
      l.requiredG === null ||
      l.requiredG === undefined ||
      !Number.isFinite(l.requiredG) ||
      l.requiredG <= 0 ||
      l.availableG === null ||
      l.availableG === undefined ||
      !Number.isFinite(l.availableG) ||
      l.availableG < 0,
  );
  if (quantitiesMissing) {
    requiredMeasurements.push('measure_required_and_available_grams_per_line');
    return result('blocked_missing_data', 'missing_stock_quantity', {
      blockedReason: 'missing_stock_quantity',
      menuLimitedReason: 'quantities_unknown_no_decisions_offered',
    });
  }

  // 4. Assess every line.
  const assessments: StockShortageLineAssessment[] = observation.shortages.map((line) => {
    const required = line.requiredG!;
    const available = line.availableG!;
    const ratio = required > 0 ? Math.min(available / required, 1) : null;
    const shortageType: StockShortageLineAssessment['shortageType'] =
      available <= 0 ? 'missing' : available < required ? 'insufficient' : 'not_short';
    const substitution =
      shortageType === 'not_short'
        ? { viable: false, reasons: ['line_not_short'] }
        : assessSubstitution(line, profile, constraints);
    return {
      lineId: line.lineId,
      shortageType,
      availabilityRatio: ratio,
      isHero: line.isHero === true,
      substitutionViable: substitution.viable,
      substitutionBlockedReasons: substitution.reasons,
    };
  });
  trace.lineAssessments = assessments;

  // Pair every input line with ITS OWN assessment by array index (assessments
  // are built index-aligned above) — never by id lookup.
  const pairs = observation.shortages.map((l, i) => ({ line: l, assessment: assessments[i]! }));
  const shortPairs = pairs.filter((p) => p.assessment.shortageType !== 'not_short');
  const shortLines = shortPairs.map((p) => p.assessment);
  if (shortLines.length === 0) {
    warnings.push('observation_contains_no_actual_shortage');
    return result('not_supported', 'no_shortage', {
      blockedReason: 'observation_contains_no_shortage',
      menuLimitedReason: 'nothing_is_short_no_decisions_needed',
    });
  }
  if (shortLines.length < assessments.length) {
    warnings.push('some_observed_lines_are_not_short');
  }

  // Hero shortage: locked §18 — never silently reduced; any lower-intensity
  // path must keep its warning visible.
  if (shortLines.some((a) => a.isHero)) {
    warnings.push('hero_ingredient_short_never_silently_reduced');
  }
  // Surface every substitution block honestly (they explain the strategy choice).
  for (const a of shortLines) {
    for (const reason of a.substitutionBlockedReasons) {
      if (reason !== 'no_substitute_available' && reason !== 'line_not_short') {
        warnings.push(`substitution_blocked:${a.lineId}:${reason}`);
      }
    }
  }

  // 5. Strategy 1 — substitution: EVERY short line has a viable, verified,
  // profile-allowed, explicitly-approved substitute.
  if (shortLines.every((a) => a.substitutionViable)) {
    const actions: StockShortageAction[] = shortPairs.map(({ line }) => ({
      kind: 'use_substitute',
      lineId: line.lineId,
      // safe: substitutionViable requires an available substitute on THIS line
      substituteName: line.substitute!.ingredientName,
      scaleFactor: null,
      notes: ['replacement_requires_designer_strategy_fit', 'never_applied_without_user_decision'],
    }));
    requiredMeasurements.push('recalculate_recipe_with_substitute_composition_and_verify_bands');
    risks.push('substitute_changes_flavor_and_composition');
    return result('substitution_possible', 'substitution', {
      recommendedActions: actions,
      nextUserDecisionOptions: [...STOCK_SHORTAGE_USER_DECISIONS],
    });
  }
  if (shortLines.some((a) => a.substitutionViable)) {
    warnings.push('mixed_shortage_strategies_not_combined_v01');
  }

  // 6. Strategy 2 — scale down: uniform batch reduction to the limiting line.
  // Uniform scaling keeps every percentage (and thus every band) unchanged;
  // a fully-missing line (ratio 0) can never be scaled around.
  const ratios = shortLines.map((a) => a.availabilityRatio ?? 0);
  const limitingRatio = Math.min(...ratios);
  trace.limitingRatio = limitingRatio;
  // The bound check is possible only when BOTH values are finite numbers.
  // Unverifiable bounds (either one missing or non-finite) allow scaling but
  // are ALWAYS flagged — unknown bounds are flagged, never guessed.
  const boundsVerifiable =
    typeof intent.batchSizeG === 'number' &&
    Number.isFinite(intent.batchSizeG) &&
    typeof constraints.minAcceptableBatchG === 'number' &&
    Number.isFinite(constraints.minAcceptableBatchG);
  const scaledBatchOk = boundsVerifiable
    ? (intent.batchSizeG as number) * limitingRatio >= (constraints.minAcceptableBatchG as number)
    : true;
  if (constraints.canScaleBatchDown && limitingRatio > 0 && scaledBatchOk) {
    if (!boundsVerifiable) {
      warnings.push('scaled_batch_bounds_unverified');
    }
    requiredMeasurements.push('recompute_scaled_recipe_and_verify_machine_minimums');
    risks.push('smaller_batch_changes_churn_and_overrun_behavior');
    return result('scale_down_possible', 'scale_down', {
      recommendedActions: [
        {
          kind: 'scale_batch_down',
          lineId: null,
          substituteName: null,
          scaleFactor: limitingRatio,
          notes: [
            'uniform_scaling_keeps_composition_percentages_unchanged',
            'never_applied_without_user_decision',
          ],
        },
      ],
      nextUserDecisionOptions: [...STOCK_SHORTAGE_USER_DECISIONS],
    });
  }
  if (constraints.canScaleBatchDown && limitingRatio <= 0) {
    warnings.push('scaling_impossible_ingredient_missing_entirely');
  }
  if (constraints.canScaleBatchDown && !scaledBatchOk) {
    warnings.push('scaled_batch_below_minimum_acceptable');
  }

  // 7. Strategy 3 — purchase / wait: keeps the recipe truth unchanged.
  if (constraints.purchaseOrWaitPossible) {
    return result('purchase_required', 'purchase', {
      recommendedActions: [
        {
          kind: 'purchase_or_wait',
          lineId: null,
          substituteName: null,
          scaleFactor: null,
          notes: ['recipe_stays_unchanged_until_stock_arrives'],
        },
      ],
      nextUserDecisionOptions: [...STOCK_SHORTAGE_USER_DECISIONS],
    });
  }

  // 8. Strategy 4 — reformulation: changes the recipe; last resort before blocked.
  if (constraints.canReformulate) {
    if (shortLines.some((a) => a.isHero && a.shortageType === 'missing')) {
      warnings.push('hero_ingredient_missing_reformulation_changes_product_identity');
    }
    requiredMeasurements.push('designer_reformulation_then_full_reevaluation');
    risks.push('reformulation_changes_recipe_identity_and_requires_full_reevaluation');
    return result('reformulation_required', 'reformulation', {
      recommendedActions: [
        {
          kind: 'reformulate_recipe',
          lineId: null,
          substituteName: null,
          scaleFactor: null,
          notes: ['designer_owns_reformulation_strategy', 'never_applied_without_user_decision'],
        },
      ],
      nextUserDecisionOptions: [...STOCK_SHORTAGE_USER_DECISIONS],
    });
  }

  // 9. Nothing feasible today — production is blocked; the menu shrinks to the
  // honest remaining choices (mark missing / stop and buy).
  return result('production_blocked', 'blocked', {
    blockedReason: 'no_feasible_strategy_under_constraints',
    nextUserDecisionOptions: ['keep_batch_and_mark_missing', 'stop_and_buy_missing_product'],
    menuLimitedReason: 'substitution_scaling_purchase_and_reformulation_all_unavailable',
  });
}
