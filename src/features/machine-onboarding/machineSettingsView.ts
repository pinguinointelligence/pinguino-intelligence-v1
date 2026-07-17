/**
 * „Moja maszyna” settings — PURE view model + edit rules (owner hotfix
 * 2026-07-17: „PILNA POPRAWKA UX — PROFIL MASZYNY I EDYCJA DOMYŚLNEGO WSADU”).
 *
 * Separates, by construction, what the MANUFACTURER states from what the USER
 * sets:
 *  - `container` — the model's figure (read-only on the main screen) or the
 *    user's own container once they explicitly declared one;
 *  - `recommendedGrams` — PINGÜINO's proposal for that container;
 *  - `userDefaultGrams` — the user's own setting (null = follow the proposal).
 *
 * Nothing here blocks: a value above the recommendation is a warning with
 * choices (see `batchGuidance`), never a rejected save.
 */
import { HOME_CONTAINER_SAFETY_FACTOR, roundToNearest10 } from '@/features/machine-catalog';
import { machineOnboardingCopy as copy } from './machineOnboardingCopy';
import { machineDisplayName, resolvePreferenceProfile } from './machineViews';
import {
  effectiveDefaultBatchGrams,
  recommendedBatchGramsOf,
  type MachinePreferenceRecord,
} from './preferenceContracts';
import type { HomeMachineProfile } from '@/features/machine-catalog';

/** The container the settings screen shows, and whose figure it may edit. */
export interface SettingsContainerView {
  readonly label: string;
  readonly capacityMl: number;
  /**
   * False for a known model's manufacturer figure — the main screen renders it
   * READ-ONLY (§8: a model parameter, not a personal setting). True once the
   * user declared their own container.
   */
  readonly editable: boolean;
}

export interface MachineSettingsView {
  readonly name: string;
  /** Manufacturer / own container figure, or null when none is known. */
  readonly container: SettingsContainerView | null;
  /** PINGÜINO's recommendation for the container in use, or null (honest). */
  readonly recommendedGrams: number | null;
  /** The value the „Mój domyślny wsad” field starts from, or null. */
  readonly userDefaultGrams: number | null;
  /** True when the user's own default diverges from the recommendation. */
  readonly usesOwnDefault: boolean;
  /** True when the record carries the user's own container (§8 badge). */
  readonly usesOwnContainer: boolean;
  /** True for a §8.4 user-declared machine profile. */
  readonly isCustomMachine: boolean;
  /** §8.4 conservative fallback stays visibly flagged. */
  readonly vesselOnlyFallback: boolean;
  /** ESTIMATED note for user-declared capacity, or null. */
  readonly estimatedNote: string | null;
  readonly setAt: string;
  readonly updatedAt: string;
}

/**
 * Build the settings view for a saved preference, or null when the record's
 * machine no longer resolves (stale catalog id) — the page then re-runs
 * onboarding instead of rendering invented data.
 */
export function buildMachineSettingsView(
  record: MachinePreferenceRecord,
  catalog?: readonly HomeMachineProfile[],
): MachineSettingsView | null {
  const profile =
    catalog !== undefined
      ? resolvePreferenceProfile(record, catalog)
      : resolvePreferenceProfile(record);
  if (profile === null) return null;

  const ownContainer = record.customContainer;
  const container: SettingsContainerView | null =
    ownContainer !== null
      ? {
          label: copy.settings.customCapacityLabel,
          capacityMl: ownContainer.capacityMl,
          editable: true,
        }
      : profile.capacity.vesselCapacityMl !== null
        ? {
            label: copy.settings.manufacturerCapacityLabel,
            capacityMl: profile.capacity.vesselCapacityMl,
            // A known model's figure is never edited in place (§8).
            editable: false,
          }
        : null;

  const recommendedGrams = recommendedBatchGramsOf(record);
  return {
    name: machineDisplayName(profile),
    container,
    recommendedGrams,
    userDefaultGrams: effectiveDefaultBatchGrams(record),
    usesOwnDefault:
      record.userDefaultBatchGrams !== null && record.userDefaultBatchGrams !== recommendedGrams,
    usesOwnContainer: ownContainer !== null,
    isCustomMachine: record.selection.kind === 'custom',
    vesselOnlyFallback: (profile.capacityFallback ?? null) === 'vessel_capacity_only',
    estimatedNote:
      ownContainer === null && record.defaultBatch.kind === 'grams' && record.defaultBatch.estimated
        ? copy.batch.estimatedNote
        : null,
    setAt: record.setAt,
    updatedAt: record.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Field parsing (honest, never coercing)                              */
/* ------------------------------------------------------------------ */

/**
 * Parse a gram field. Accepts a Polish decimal comma; rejects anything
 * non-positive or unparsable instead of silently substituting a value.
 * Empty input → null (the field may be cleared to follow the recommendation).
 */
export function parseGramsInput(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return 'invalid';
  return value;
}

/**
 * The PINGÜINO proposal for a user-declared container: the SAME versioned
 * 0.95 rule the catalog uses (the only sanctioned ml→g arithmetic), offered
 * as a prefill the user may overwrite.
 */
export function suggestRecommendedGramsForContainer(capacityMl: number): number | null {
  if (!Number.isFinite(capacityMl) || capacityMl <= 0) return null;
  return roundToNearest10(capacityMl * HOME_CONTAINER_SAFETY_FACTOR);
}
