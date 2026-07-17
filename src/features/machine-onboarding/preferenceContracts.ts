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

/**
 * Current record shape. v2 (owner hotfix 2026-07-17) adds the user's OWN
 * default batch, the „Używam innego pojemnika” override and `updatedAt`.
 * The parser accepts v2 AND losslessly upgrades v1 (adding explicit nulls —
 * never an invented value), so a saved machine is never silently dropped.
 */
export const MACHINE_PREFERENCE_SCHEMA_VERSION = 2 as const;

/** Every record shape the parser can read (older ones are upgraded on read). */
const READABLE_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

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

/**
 * The user's own container (owner hotfix 2026-07-17, §8): only after the
 * explicit „Używam innego pojemnika” action. The manufacturer figure of a
 * known model is a MODEL parameter and is never edited in its place — this
 * override lives beside it and marks the profile as a user configuration.
 */
export interface SavedCustomContainer {
  /** The user's declared container capacity in ml (their own vessel). */
  readonly capacityMl: number;
  /** The recommendation FOR THAT container (0.95 rule proposal, editable). */
  readonly recommendedBatchGrams: number;
}

/** The persisted machine preference (§8.6 + §23.1 UserMachinePreference). */
export interface MachinePreferenceRecord {
  readonly schemaVersion: typeof MACHINE_PREFERENCE_SCHEMA_VERSION;
  readonly selection: MachinePreferenceSelection;
  /** Market token of the saved machine record (§8.6 saves the region). */
  readonly market: string;
  readonly resolvedTechnology: MachineTechnology;
  readonly resolvedVisibleMode: HomeVisibleModeId;
  readonly capacity: SavedMachineCapacitySnapshot;
  /**
   * The DERIVED „Zalecany wsad PINGÜINO” with provenance — PINGÜINO's own
   * recommendation for the machine's manufacturer container. Never the user's
   * setting (see `userDefaultBatchGrams`).
   */
  readonly defaultBatch: SavedDefaultBatch;
  /**
   * The USER's own default batch in grams, or null = follow the
   * recommendation. Owner hotfix: a saved value is authoritative for every new
   * recipe and is NEVER silently reset back to the recommendation.
   */
  readonly userDefaultBatchGrams: number | null;
  /** The user's own container (§8 „Używam innego pojemnika”), or null. */
  readonly customContainer: SavedCustomContainer | null;
  /** ISO datetime the preference was set. */
  readonly setAt: string;
  /** ISO datetime of the last settings change (owner hotfix §9). */
  readonly updatedAt: string;
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
    // A fresh record follows the recommendation until the user sets their own.
    userDefaultBatchGrams: null,
    customContainer: null,
    setAt: input.setAt,
    updatedAt: input.setAt,
    catalogVersion: input.catalogVersion,
  };
}

/* ------------------------------------------------------------------ */
/* Batch resolution + settings updates (owner hotfix 2026-07-17)       */
/* ------------------------------------------------------------------ */

/**
 * PINGÜINO's recommendation for the container actually in use: the user's own
 * container recommendation when they declared one, otherwise the derived
 * manufacturer-container recommendation. Null = no rule fired (honest).
 */
export function recommendedBatchGramsOf(record: MachinePreferenceRecord): number | null {
  if (record.customContainer !== null) return record.customContainer.recommendedBatchGrams;
  return record.defaultBatch.kind === 'grams' ? record.defaultBatch.grams : null;
}

/**
 * The batch a NEW recipe starts from (owner hotfix §5 source order):
 *  1. `userDefaultBatchGrams` — the user's saved own default;
 *  2. `recommendedBatchGramsOf` — PINGÜINO's recommendation;
 *  3. null → the caller keeps the legacy serving-mode fallback (old flow only).
 */
export function effectiveDefaultBatchGrams(record: MachinePreferenceRecord): number | null {
  return record.userDefaultBatchGrams ?? recommendedBatchGramsOf(record);
}

/** True when the user's saved default diverges from the recommendation. */
export function usesCustomDefaultBatch(record: MachinePreferenceRecord): boolean {
  return (
    record.userDefaultBatchGrams !== null &&
    record.userDefaultBatchGrams !== recommendedBatchGramsOf(record)
  );
}

/**
 * Set (or clear with null) the user's own default batch. Clearing restores the
 * recommendation — the ONLY way back, never automatic. Non-finite/non-positive
 * values are rejected honestly (record returned unchanged is not an option:
 * callers validate first; this guards the contract).
 */
export function withUserDefaultBatch(
  record: MachinePreferenceRecord,
  grams: number | null,
  updatedAt: string,
): MachinePreferenceRecord | null {
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0)) return null;
  return { ...record, userDefaultBatchGrams: grams, updatedAt };
}

/**
 * Set (or clear with null) the user's own container. Clearing returns the
 * profile to the manufacturer figure of its model. The user's own default
 * batch is left untouched — their explicit setting outlives a container swap.
 */
export function withCustomContainer(
  record: MachinePreferenceRecord,
  container: SavedCustomContainer | null,
  updatedAt: string,
): MachinePreferenceRecord | null {
  if (container !== null) {
    const { capacityMl, recommendedBatchGrams } = container;
    if (!Number.isFinite(capacityMl) || capacityMl <= 0) return null;
    if (!Number.isFinite(recommendedBatchGrams) || recommendedBatchGrams <= 0) return null;
  }
  return { ...record, customContainer: container, updatedAt };
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

/** A positive gram/ml figure, or null. Anything else is corrupt (never coerced). */
function parseOptionalPositive(value: unknown): number | null | 'corrupt' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'corrupt';
  return value;
}

/** The user's own container: BOTH figures present and positive, or absent. */
function parseCustomContainer(value: unknown): SavedCustomContainer | null | 'corrupt' {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return 'corrupt';
  const capacityMl = parseOptionalPositive(value.capacityMl);
  const recommended = parseOptionalPositive(value.recommendedBatchGrams);
  if (capacityMl === 'corrupt' || recommended === 'corrupt') return 'corrupt';
  // A half-declared container is corrupt — never completed with a guess.
  if (capacityMl === null || recommended === null) return 'corrupt';
  return { capacityMl, recommendedBatchGrams: recommended };
}

/**
 * Parse an untrusted value (storage / backend row) into a preference record.
 * Strict: unknown versions, missing fields, wrong types, ml→g-shaped nonsense
 * and mode/technology mismatches all yield `null` — never a repaired guess.
 *
 * v1 records (pre-hotfix) are UPGRADED, not dropped: the fields the owner
 * hotfix added are simply absent, which reads as "no own default, no own
 * container" — explicit nulls, never invented values. The user keeps their
 * machine and their next visit shows the recommendation as the starting point.
 */
export function parseMachinePreferenceRecord(raw: unknown): MachinePreferenceRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.schemaVersion !== 'number' || !READABLE_SCHEMA_VERSIONS.has(raw.schemaVersion)) {
    return null;
  }

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

  // v2 additions — absent on v1 records (upgrade), corrupt if present-but-wrong.
  const userDefaultBatchGrams = parseOptionalPositive(raw.userDefaultBatchGrams);
  if (userDefaultBatchGrams === 'corrupt') return null;
  const customContainer = parseCustomContainer(raw.customContainer);
  if (customContainer === 'corrupt') return null;
  const rawUpdatedAt = raw.updatedAt;
  if (rawUpdatedAt !== undefined && rawUpdatedAt !== null) {
    if (typeof rawUpdatedAt !== 'string' || Number.isNaN(Date.parse(rawUpdatedAt))) return null;
  }
  const updatedAt = typeof rawUpdatedAt === 'string' ? rawUpdatedAt : setAt;

  return {
    schemaVersion: MACHINE_PREFERENCE_SCHEMA_VERSION,
    selection,
    market,
    resolvedTechnology: technology,
    resolvedVisibleMode: expectedMode,
    capacity,
    defaultBatch,
    userDefaultBatchGrams,
    customContainer,
    setAt,
    updatedAt,
    catalogVersion,
  };
}
