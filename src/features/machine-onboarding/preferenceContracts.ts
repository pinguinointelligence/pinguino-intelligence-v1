/**
 * PINGÜINO Machine Onboarding — machine preference contracts (§8.6, §23.1).
 *
 * The `UserMachinePreference` record + the `MachinePreferenceStore` PORT that
 * every adapter implements:
 *  - device-local adapter (`localStorageMachinePreferenceStore`) — works for
 *    anonymous/demo sessions today;
 *  - a backend adapter lives under `src/services/machinePreference/**`
 *    (FILE-FIRST against migration 0030 — launch-gated, see the selector).
 *
 * Honesty rules carried into the record:
 *  - the batch snapshot is EITHER the DERIVED „Zalecany wsad PINGÜINO” grams
 *    with full provenance (source-of-truth field, safety factor applied or
 *    null, rule version, estimated flag — owner correction 2026-07-17), OR an
 *    honest none. The versioned safety-factor rule is the ONLY ml→g
 *    arithmetic that can ever have produced the grams;
 *  - the capacity snapshot copies the §9.1 facts verbatim (nulls preserved);
 *  - parsing is corrupt-data safe: anything malformed yields `null`, never a
 *    guessed record.
 */
import type {
  HomeMachineProfile,
  HomeVisibleModeId,
  MachineDerivation,
  MachineTechnology,
  RecommendedBatchSource,
} from '@/features/machine-catalog';
import {
  deriveMachineSetup,
  isHomeSupportedTechnology,
  validateHomeMachineProfile,
  visibleModeForTechnology,
} from '@/features/machine-catalog';

/** Bump on breaking record-shape changes; the parser accepts only this version. */
export const MACHINE_PREFERENCE_SCHEMA_VERSION = 1 as const;

/** What the user picked: a catalog record (by id) or their own custom machine. */
export type MachinePreferenceSelection =
  | { readonly kind: 'catalog'; readonly machineProfileId: string }
  | { readonly kind: 'custom'; readonly customProfile: HomeMachineProfile };

/** Verbatim §9.1 facts at save time (nulls preserved — never guessed). */
export interface SavedMachineCapacitySnapshot {
  readonly vesselCapacityMl: number | null;
  readonly maximumLiquidMixMl: number | null;
  readonly workingCapacityMl: number | null;
  readonly manufacturerMaxMixGrams: number | null;
  readonly vesselCount: number | null;
  readonly maxFillDefinedByManufacturer: boolean;
}

/**
 * The saved default batch (owner correction 2026-07-17). Two honest shapes:
 *  - 'grams' — the DERIVED „Zalecany wsad PINGÜINO” with full provenance
 *    (which source-of-truth field, the safety factor applied or null for
 *    direct manufacturer grams, the rule version, the estimated flag for
 *    user-declared capacity). Doubles as the per-container split limit;
 *  - 'none'  — no source-of-truth rule fired; the user decides.
 */
export type SavedDefaultBatch =
  | {
      readonly kind: 'grams';
      readonly grams: number;
      readonly source: RecommendedBatchSource;
      readonly safetyFactorApplied: number | null;
      readonly ruleVersion: string;
      readonly estimated: boolean;
    }
  | { readonly kind: 'none' };

/** The persisted machine preference (§8.6 + §23.1 UserMachinePreference). */
export interface MachinePreferenceRecord {
  readonly schemaVersion: typeof MACHINE_PREFERENCE_SCHEMA_VERSION;
  readonly selection: MachinePreferenceSelection;
  /** Market token of the saved machine record (§8.6 saves the region). */
  readonly market: string;
  readonly resolvedTechnology: MachineTechnology;
  readonly resolvedVisibleMode: HomeVisibleModeId;
  readonly capacity: SavedMachineCapacitySnapshot;
  readonly defaultBatch: SavedDefaultBatch;
  /** ISO datetime the preference was set. */
  readonly setAt: string;
  /** Exact machine-catalog data version the selection was made against. */
  readonly catalogVersion: string;
}

/** The port every preference adapter implements. */
export interface MachinePreferenceStore {
  /** The saved preference, or null (none saved / unreadable / corrupt). */
  load(): Promise<MachinePreferenceRecord | null>;
  save(record: MachinePreferenceRecord): Promise<void>;
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export interface BuildMachinePreferenceInput {
  readonly profile: HomeMachineProfile;
  /** True when the profile came from the §8.4 custom path (user_declared). */
  readonly isCustom: boolean;
  /** ISO datetime of the save (injected — the pure layer has no clock). */
  readonly setAt: string;
  /** The machine-catalog data version at save time. */
  readonly catalogVersion: string;
}

/** Map a derivation's batch suggestion to the honest persisted shape. */
export function savedDefaultBatchFromDerivation(derivation: MachineDerivation): SavedDefaultBatch {
  const suggestion = derivation.batchSuggestion;
  if (suggestion.kind === 'recommended_grams') {
    return {
      kind: 'grams',
      grams: suggestion.grams,
      source: suggestion.source,
      safetyFactorApplied: suggestion.safetyFactorApplied,
      ruleVersion: suggestion.ruleVersion,
      estimated: suggestion.estimated,
    };
  }
  return { kind: 'none' };
}

/**
 * Build the persistable record from a machine profile (pure). Returns null
 * when the profile has no Home mode (continuous soft serve can never be
 * saved as a Home preference — the UI shows the honest unsupported state).
 */
export function buildMachinePreferenceRecord(
  input: BuildMachinePreferenceInput,
): MachinePreferenceRecord | null {
  const { profile } = input;
  const derivation = deriveMachineSetup(profile);
  if (derivation.homeSupport !== 'supported' || derivation.resolvedVisibleMode === null) return null;
  if (!isHomeSupportedTechnology(profile.technology)) return null;
  return {
    schemaVersion: MACHINE_PREFERENCE_SCHEMA_VERSION,
    selection: input.isCustom
      ? { kind: 'custom', customProfile: profile }
      : { kind: 'catalog', machineProfileId: profile.id },
    market: profile.market,
    resolvedTechnology: profile.technology,
    resolvedVisibleMode: derivation.resolvedVisibleMode,
    capacity: {
      vesselCapacityMl: profile.capacity.vesselCapacityMl,
      maximumLiquidMixMl: profile.capacity.maximumLiquidMixMl,
      workingCapacityMl: profile.capacity.workingCapacityMl,
      manufacturerMaxMixGrams: profile.capacity.manufacturerMaxMixGrams ?? null,
      vesselCount: profile.capacity.vesselCount ?? null,
      maxFillDefinedByManufacturer: profile.capacity.maxFillDefinedByManufacturer,
    },
    defaultBatch: savedDefaultBatchFromDerivation(derivation),
    setAt: input.setAt,
    catalogVersion: input.catalogVersion,
  };
}

/* ------------------------------------------------------------------ */
/* Corrupt-safe parsing                                                */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function parseCapacitySnapshot(value: unknown): SavedMachineCapacitySnapshot | null {
  if (!isRecord(value)) return null;
  const { vesselCapacityMl, maximumLiquidMixMl, workingCapacityMl, vesselCount } = value;
  // Records saved before the owner correction lack the grams field — absent
  // reads as null (additive evolution), but a present wrong type is corrupt.
  const maxMixGrams = 'manufacturerMaxMixGrams' in value ? value.manufacturerMaxMixGrams : null;
  if (
    !isNullableNumber(vesselCapacityMl) ||
    !isNullableNumber(maximumLiquidMixMl) ||
    !isNullableNumber(workingCapacityMl) ||
    !isNullableNumber(maxMixGrams) ||
    !isNullableNumber(vesselCount) ||
    typeof value.maxFillDefinedByManufacturer !== 'boolean'
  ) {
    return null;
  }
  return {
    vesselCapacityMl,
    maximumLiquidMixMl,
    workingCapacityMl,
    manufacturerMaxMixGrams: maxMixGrams,
    vesselCount,
    maxFillDefinedByManufacturer: value.maxFillDefinedByManufacturer,
  };
}

const BATCH_SOURCES: ReadonlySet<string> = new Set([
  'manufacturer_max_mix_grams',
  'maximum_liquid_mix_ml',
  'working_capacity_ml',
  'respin_vessel_ml',
]);

function parseDefaultBatch(value: unknown): SavedDefaultBatch | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'none') return { kind: 'none' };
  if (value.kind === 'grams') {
    const { grams, source, safetyFactorApplied, ruleVersion, estimated } = value;
    if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) return null;
    if (typeof source !== 'string' || !BATCH_SOURCES.has(source)) return null;
    const factorOk =
      safetyFactorApplied === null ||
      (typeof safetyFactorApplied === 'number' &&
        Number.isFinite(safetyFactorApplied) &&
        safetyFactorApplied > 0 &&
        safetyFactorApplied <= 1);
    if (!factorOk) return null;
    // Rule 1 (direct manufacturer grams) is the ONLY factor-less source.
    if ((source === 'manufacturer_max_mix_grams') !== (safetyFactorApplied === null)) return null;
    if (typeof ruleVersion !== 'string' || ruleVersion.trim().length === 0) return null;
    if (typeof estimated !== 'boolean') return null;
    return {
      kind: 'grams',
      grams,
      source: source as RecommendedBatchSource,
      safetyFactorApplied,
      ruleVersion,
      estimated,
    };
  }
  return null;
}

function parseSelection(value: unknown): MachinePreferenceSelection | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'catalog') {
    const id = value.machineProfileId;
    if (typeof id !== 'string' || id.trim().length === 0) return null;
    return { kind: 'catalog', machineProfileId: id };
  }
  if (value.kind === 'custom') {
    const profile = value.customProfile;
    // A custom profile is validated structurally by the catalog invariants —
    // a profile that fails them is treated as corrupt, never patched up.
    if (!isRecord(profile)) return null;
    const candidate = profile as unknown as HomeMachineProfile;
    if (typeof candidate.id !== 'string' || typeof candidate.market !== 'string') return null;
    if (typeof candidate.technology !== 'string') return null;
    if (!isHomeSupportedTechnology(candidate.technology as MachineTechnology)) return null;
    if (candidate.specificationSource !== 'user_declared') return null;
    if (!isRecord(candidate.capacity)) return null;
    if (validateHomeMachineProfile(candidate).length > 0) return null;
    return { kind: 'custom', customProfile: candidate };
  }
  return null;
}

/**
 * Parse an untrusted value (storage / backend row) into a preference record.
 * Strict: unknown versions, missing fields, wrong types, ml→g-shaped nonsense
 * and mode/technology mismatches all yield `null` — never a repaired guess.
 */
export function parseMachinePreferenceRecord(raw: unknown): MachinePreferenceRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== MACHINE_PREFERENCE_SCHEMA_VERSION) return null;

  const selection = parseSelection(raw.selection);
  if (selection === null) return null;

  const { market, resolvedTechnology, resolvedVisibleMode, setAt, catalogVersion } = raw;
  if (typeof market !== 'string' || market.trim().length === 0) return null;
  if (typeof resolvedTechnology !== 'string') return null;
  if (!isHomeSupportedTechnology(resolvedTechnology as MachineTechnology)) return null;
  const technology = resolvedTechnology as MachineTechnology;
  const expectedMode = visibleModeForTechnology(technology);
  if (expectedMode === null || resolvedVisibleMode !== expectedMode) return null;

  const capacity = parseCapacitySnapshot(raw.capacity);
  if (capacity === null) return null;
  const defaultBatch = parseDefaultBatch(raw.defaultBatch);
  if (defaultBatch === null) return null;

  if (typeof setAt !== 'string' || Number.isNaN(Date.parse(setAt))) return null;
  if (typeof catalogVersion !== 'string' || catalogVersion.trim().length === 0) return null;

  return {
    schemaVersion: MACHINE_PREFERENCE_SCHEMA_VERSION,
    selection,
    market,
    resolvedTechnology: technology,
    resolvedVisibleMode: expectedMode,
    capacity,
    defaultBatch,
    setAt,
    catalogVersion,
  };
}
