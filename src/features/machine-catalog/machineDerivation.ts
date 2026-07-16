/**
 * PINGÜINO Machine Catalog — pure derivation helpers.
 *
 * machine → { resolvedVisibleMode, batch suggestion, working capacity,
 * pre-freeze facts } plus region-aware lookup and the §9.3 activation rule
 * (conflicting sources BLOCK activation).
 *
 * Batch rules (test-pinned):
 *  - Ninja modes REUSE the owner-approved serving-mode MASS presets from
 *    `@/features/customer-flow` (`approvedMassForMode`) — grams come ONLY
 *    from those approved presets, NEVER from an ml→g conversion;
 *  - non-Ninja machines get a capacity-based suggestion ONLY as millilitres,
 *    carrying the explicit 'ml_not_grams' marker, and only from quantities
 *    that describe POURABLE MIX (maximum liquid mix / working capacity).
 *    Vessel volume and finished-product volume are never suggested as a
 *    batch: brim volume overfills and finished volume includes overrun;
 *  - no confirmed mix quantity → an honest 'none' (the user decides).
 *
 * Integration note: a per-device owner-approved recipe mass (see
 * `devicePresets.hasVerifiedRecipeMass` in customer-flow) takes precedence
 * over the mode-level preset at integration time; this layer only exposes the
 * mode-level approved mass and never invents a per-device number.
 */
import { approvedMassForMode } from '@/features/customer-flow';
import type {
  HomeMachineProfile,
  HomeVisibleModeId,
  MachineTechnology,
  PreFreezeTarget,
} from './types';
import { isHomeSupportedTechnology, visibleModeForTechnology } from './technologyMode';

/* ------------------------------------------------------------------ */
/* Batch suggestion                                                    */
/* ------------------------------------------------------------------ */

/** Explicit unit marker: the value is millilitres of MIX, never grams. */
export type MlNotGramsMarker = 'ml_not_grams';

export type HomeBatchSuggestion =
  | {
      /** Owner-approved serving-mode MASS preset (grams) — Ninja modes only. */
      readonly kind: 'approved_mass_g';
      readonly massG: number;
      readonly servingModeId: HomeVisibleModeId;
      readonly source: 'serving_mode_preset';
    }
  | {
      /** Capacity-based suggestion in MILLILITRES — explicitly not grams. */
      readonly kind: 'capacity_ml';
      readonly ml: number;
      readonly unit: MlNotGramsMarker;
      /** Which honest §9.1 quantity the ml comes from. */
      readonly basis: 'maximum_liquid_mix' | 'working_capacity';
    }
  | {
      /** No trustworthy quantity — the user sets the batch (never guessed). */
      readonly kind: 'none';
      readonly reason: 'no_confirmed_mix_capacity' | 'machine_not_home_supported';
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
  const base = {
    workingCapacityMl: profile.capacity.workingCapacityMl,
    requiresPreFreeze: profile.requiresPreFreeze,
    preFreezeTarget: profile.preFreezeTarget,
    preFreezeMinimumHours: profile.preFreezeMinimumHours ?? null,
    maxFillDefinedByManufacturer: profile.capacity.maxFillDefinedByManufacturer,
  };
  if (mode === null) {
    return {
      ...base,
      homeSupport: 'unsupported_for_home',
      resolvedVisibleMode: null,
      batchSuggestion: { kind: 'none', reason: 'machine_not_home_supported' },
    };
  }
  return {
    ...base,
    homeSupport: 'supported',
    resolvedVisibleMode: mode,
    batchSuggestion: batchSuggestionForMode(mode, profile),
  };
}

function batchSuggestionForMode(
  mode: HomeVisibleModeId,
  profile: HomeMachineProfile,
): HomeBatchSuggestion {
  if (mode === 'ninja_gelato' || mode === 'ninja_swirl') {
    const massG = approvedMassForMode(mode);
    // The two Ninja modes always carry an approved mass; stay honest if the
    // owner-approved matrix ever changes.
    if (massG !== null) {
      return { kind: 'approved_mass_g', massG, servingModeId: mode, source: 'serving_mode_preset' };
    }
    return { kind: 'none', reason: 'no_confirmed_mix_capacity' };
  }
  const { maximumLiquidMixMl, workingCapacityMl } = profile.capacity;
  if (maximumLiquidMixMl !== null && maximumLiquidMixMl > 0) {
    return {
      kind: 'capacity_ml',
      ml: maximumLiquidMixMl,
      unit: 'ml_not_grams',
      basis: 'maximum_liquid_mix',
    };
  }
  if (workingCapacityMl !== null && workingCapacityMl > 0) {
    return {
      kind: 'capacity_ml',
      ml: workingCapacityMl,
      unit: 'ml_not_grams',
      basis: 'working_capacity',
    };
  }
  return { kind: 'none', reason: 'no_confirmed_mix_capacity' };
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
