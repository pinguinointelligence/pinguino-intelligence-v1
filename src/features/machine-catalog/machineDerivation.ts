/**
 * PINGÜINO Machine Catalog — pure derivation helpers.
 *
 * machine → { resolvedVisibleMode, recommended Home batch, working capacity,
 * pre-freeze facts } plus region-aware lookup, the §9.3 activation rule and
 * the owner container-split planner.
 *
 * Batch rules (test-pinned; OWNER CORRECTION 2026-07-17 — universal Home
 * safety margin, see `homeBatchRule.ts`):
 *  - the recommended batch is DERIVED (never stored per model) by the
 *    configurable, versioned rule: manufacturer max-mix GRAMS used directly;
 *    official max-fill / working-capacity ml × 0.95; unconflicted re-spin tub
 *    figures × 0.95; physical bowl volumes NEVER auto-used; conflicted
 *    figures NEVER produce a number; user-declared capacity → ESTIMATED;
 *  - the rule is the ONLY permitted ml→g arithmetic in the product — no
 *    other density guess exists anywhere;
 *  - mode-level serving presets are never borrowed here: a mode preset says
 *    nothing about a specific machine's container;
 *  - no rule fires → an honest 'none' (the user decides);
 *  - a request ABOVE `recommendedBatchGrams` never overfills one container:
 *    `planContainerSplit` spreads it EVENLY across ceil(total/recommended)
 *    containers (owner examples: 900→2×450; 1000→3×~333.3; 1350→3×450).
 */
import type {
  HomeMachineProfile,
  HomeVisibleModeId,
  MachineTechnology,
  PreFreezeTarget,
} from './types';
import { isHomeSupportedTechnology, visibleModeForTechnology } from './technologyMode';
import {
  recommendMachineBatch,
  vesselFigureConflicted,
  type RecommendedBatch,
} from './homeBatchRule';

/* ------------------------------------------------------------------ */
/* Batch suggestion                                                    */
/* ------------------------------------------------------------------ */

export type HomeBatchSuggestion =
  | {
      /**
       * The DERIVED „Zalecany wsad PINGÜINO” (owner correction 2026-07-17):
       * grams from the versioned Home batch rule, with full provenance
       * (source-of-truth field, factor applied or null, rule version,
       * estimated flag for user-declared capacity). Never presented as the
       * manufacturer's official figure.
       */
      readonly kind: 'recommended_grams';
      readonly grams: number;
      readonly source: RecommendedBatch['source'];
      readonly safetyFactorApplied: number | null;
      readonly ruleVersion: string;
      readonly estimated: boolean;
      readonly servingModeId: HomeVisibleModeId;
    }
  | {
      /** No trustworthy quantity — the user sets the batch (never guessed). */
      readonly kind: 'none';
      readonly reason:
        | 'machine_not_home_supported'
        /** The usable-capacity figure is under an OPEN source conflict (§9.3). */
        | 'capacity_conflict_unresolved'
        /** Nothing rule-eligible (bowl-only, program/finished volumes, or unstated). */
        | 'no_confirmed_usable_capacity';
    };

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

export type MachineHomeSupport = 'supported' | 'unsupported_for_home';

/** Everything Home setup needs from a machine — and NOTHING recipe-math. */
export interface MachineDerivation {
  readonly homeSupport: MachineHomeSupport;
  /** The EXISTING visible mode (from technology); null when unsupported. */
  readonly resolvedVisibleMode: HomeVisibleModeId | null;
  readonly batchSuggestion: HomeBatchSuggestion;
  /**
   * The DERIVED „Zalecany wsad PINGÜINO” in grams, surfaced flat (owner
   * correction 2026-07-17). Doubles as the per-container limit for
   * `planContainerSplit`. Null = no source-of-truth rule fired — the batch is
   * honestly user-set, never invented.
   */
  readonly recommendedBatchGrams: number | null;
  /** Recommended working capacity in ml, when the sources state one. */
  readonly workingCapacityMl: number | null;
  readonly requiresPreFreeze: boolean;
  readonly preFreezeTarget: PreFreezeTarget;
  readonly preFreezeMinimumHours: number | null;
  /** MAX FILL is a RULE (§9.1) — surface it for fill guidance, not math. */
  readonly maxFillDefinedByManufacturer: boolean;
}

/**
 * Derive the Home setup for a machine profile. Pure and default-neutral: the
 * output routes to an EXISTING mode and carries capacity/UX facts only — no
 * recipe parameter is produced or altered here (owner rule / §10.1).
 */
export function deriveMachineSetup(profile: HomeMachineProfile): MachineDerivation {
  const mode = visibleModeForTechnology(profile.technology);
  const recommended = recommendMachineBatch(profile);
  const base = {
    recommendedBatchGrams: recommended?.grams ?? null,
    workingCapacityMl: profile.capacity.workingCapacityMl,
    requiresPreFreeze: profile.requiresPreFreeze,
    preFreezeTarget: profile.preFreezeTarget,
    preFreezeMinimumHours: profile.preFreezeMinimumHours ?? null,
    maxFillDefinedByManufacturer: profile.capacity.maxFillDefinedByManufacturer,
  };
  if (mode === null) {
    return {
      ...base,
      recommendedBatchGrams: null,
      homeSupport: 'unsupported_for_home',
      resolvedVisibleMode: null,
      batchSuggestion: { kind: 'none', reason: 'machine_not_home_supported' },
    };
  }
  if (recommended === null) {
    return {
      ...base,
      homeSupport: 'supported',
      resolvedVisibleMode: mode,
      batchSuggestion: {
        kind: 'none',
        reason: vesselFigureConflicted(profile)
          ? 'capacity_conflict_unresolved'
          : 'no_confirmed_usable_capacity',
      },
    };
  }
  return {
    ...base,
    homeSupport: 'supported',
    resolvedVisibleMode: mode,
    batchSuggestion: {
      kind: 'recommended_grams',
      grams: recommended.grams,
      source: recommended.source,
      safetyFactorApplied: recommended.safetyFactorApplied,
      ruleVersion: recommended.ruleVersion,
      estimated: recommended.estimated,
      servingModeId: mode,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Container split (owner correction, 2026-07-17)                      */
/* ------------------------------------------------------------------ */

/**
 * A plan spreading a requested batch across containers so NO single container
 * ever exceeds the machine's `recommendedBatchGrams`.
 */
export interface ContainerSplitPlan {
  /** ceil(totalBatchGrams / recommendedBatchGrams) — how many containers. */
  readonly containers: number;
  /**
   * EVEN split per container (total / containers, rounded to 0.1 g for
   * display), ALWAYS ≤ the per-container limit.
   */
  readonly gramsPerContainer: number;
  /** The requested total — the even split preserves it. */
  readonly totalGrams: number;
  /** True when one container suffices (no split message needed). */
  readonly withinSingleContainer: boolean;
}

/**
 * Owner split rule (verbatim): containerCount = ceil(total / recommended);
 * prefer the EVEN split gramsPerContainer = total / containerCount with
 * gramsPerContainer ≤ recommendedBatchGrams. The user can always prepare
 * LESS; wanting MORE never overfills a single container.
 *
 * Owner examples for a 450 g limit (test-pinned): 900 → 2 × 450;
 * 1000 → 3 × ~333.3; 1350 → 3 × 450.
 *
 * Pure gram arithmetic — no ml, no density. Returns null for non-finite /
 * non-positive inputs instead of guessing.
 */
export function planContainerSplit(
  requestedGrams: number,
  recommendedBatchGrams: number,
): ContainerSplitPlan | null {
  if (!Number.isFinite(requestedGrams) || requestedGrams <= 0) return null;
  if (!Number.isFinite(recommendedBatchGrams) || recommendedBatchGrams <= 0) return null;
  const containers = Math.ceil(requestedGrams / recommendedBatchGrams);
  // total / containers ≤ limit holds because containers ≥ total / limit; the
  // 0.1 g display rounding is clamped so it can never exceed the limit.
  const even = requestedGrams / containers;
  const gramsPerContainer = Math.min(recommendedBatchGrams, Math.round(even * 10) / 10);
  return {
    containers,
    gramsPerContainer,
    totalGrams: requestedGrams,
    withinSingleContainer: containers === 1,
  };
}

/* ------------------------------------------------------------------ */
/* Region-aware lookup (§9.3)                                          */
/* ------------------------------------------------------------------ */

/**
 * True when a record's market covers a region token. Markets are
 * '/'-separated token lists ('EU/ES' covers 'EU' and 'ES'); matching is
 * token-exact and case-insensitive — no substring guessing.
 */
export function marketMatchesRegion(market: string, region: string): boolean {
  const wanted = region.trim().toLowerCase();
  if (wanted.length === 0) return false;
  return market
    .split('/')
    .map((token) => token.trim().toLowerCase())
    .includes(wanted);
}

/** All catalog records applicable to a region (active or not). */
export function machinesForMarket(
  catalog: readonly HomeMachineProfile[],
  region: string,
): readonly HomeMachineProfile[] {
  return catalog.filter((profile) => marketMatchesRegion(profile.market, region));
}

/** Region-aware model-code lookup (case-insensitive), or null when absent. */
export function findMachineByModelCode(
  catalog: readonly HomeMachineProfile[],
  modelCode: string,
  region?: string,
): HomeMachineProfile | null {
  const wanted = modelCode.trim().toLowerCase();
  if (wanted.length === 0) return null;
  const scope = region === undefined ? catalog : machinesForMarket(catalog, region);
  return scope.find((p) => p.modelCodes.some((code) => code.toLowerCase() === wanted)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Activation (§9.3) and validation                                    */
/* ------------------------------------------------------------------ */

/**
 * §9.3: a specification conflict must be resolved with the exact model's
 * manual BEFORE activation — `conflicting_sources` therefore hard-blocks.
 * A machine without a Home mode can never activate for Home either.
 */
export function isMachineActivatable(profile: HomeMachineProfile): boolean {
  if (profile.specificationStatus === 'conflicting_sources') return false;
  if (!isHomeSupportedTechnology(profile.technology)) return false;
  return profile.resolvedVisibleMode === visibleModeForTechnology(profile.technology);
}

/** The machines Home may offer: flagged active AND allowed to be active. */
export function listActiveHomeMachines(
  catalog: readonly HomeMachineProfile[],
): readonly HomeMachineProfile[] {
  return catalog.filter((profile) => profile.active && isMachineActivatable(profile));
}

const PRE_FREEZE_EXPECTATION: Readonly<Record<MachineTechnology, PreFreezeTarget>> = {
  respin: 'mixture',
  respin_soft: 'mixture',
  compressor: 'none',
  frozen_bowl: 'bowl',
  continuous_soft_serve: 'none',
};

/**
 * Structural invariants for one record. Returns plain-language issues (empty
 * = valid). Used by tests to pin the whole seed catalog.
 */
export function validateHomeMachineProfile(profile: HomeMachineProfile): string[] {
  const issues: string[] = [];
  const expectedMode = visibleModeForTechnology(profile.technology);
  if (expectedMode === null) {
    issues.push(
      `${profile.id}: technology '${profile.technology}' has no Home mode (Pro/future) — not a Home profile`,
    );
  } else if (profile.resolvedVisibleMode !== expectedMode) {
    issues.push(
      `${profile.id}: resolvedVisibleMode '${profile.resolvedVisibleMode}' disagrees with §10 mapping '${expectedMode}'`,
    );
  }
  if (profile.specificationStatus === 'conflicting_sources' && profile.active) {
    issues.push(`${profile.id}: conflicting_sources must block activation (§9.3)`);
  }
  const conflicts = profile.sourceConflicts ?? [];
  if (conflicts.length > 0 && profile.specificationStatus !== 'conflicting_sources') {
    issues.push(`${profile.id}: documented source conflicts require conflicting_sources status`);
  }
  const maxMixGrams = profile.capacity.manufacturerMaxMixGrams ?? null;
  if (maxMixGrams !== null && (!Number.isFinite(maxMixGrams) || maxMixGrams <= 0)) {
    issues.push(`${profile.id}: manufacturerMaxMixGrams must be a positive number when stated`);
  }
  if (profile.specificationStatus === 'verified' && profile.specificationVerifiedAt === undefined) {
    issues.push(`${profile.id}: verified requires a specificationVerifiedAt date`);
  }
  const expectedPreFreeze = PRE_FREEZE_EXPECTATION[profile.technology];
  if (profile.preFreezeTarget !== expectedPreFreeze) {
    issues.push(
      `${profile.id}: preFreezeTarget '${profile.preFreezeTarget}' disagrees with technology semantics '${expectedPreFreeze}'`,
    );
  }
  if (profile.requiresPreFreeze !== (expectedPreFreeze !== 'none')) {
    issues.push(`${profile.id}: requiresPreFreeze disagrees with preFreezeTarget`);
  }
  return issues;
}
