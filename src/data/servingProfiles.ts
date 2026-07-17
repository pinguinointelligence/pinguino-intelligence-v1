/**
 * Temperature concepts + serving profiles — stored PREFERENCES, NOT engines.
 *
 * SPEC §11.2 (docs/uiux-master-v1/SPEC.md) separates three temperature CONCEPTS
 * and AUDIT #19 flagged `storage-minus-18` living inside the SERVING enum (a
 * storage temperature offered as a serving choice). Owner decision (Slice C,
 * 2026-07-17): the serving vocabulary is exactly Świeże + −11/−12/−13; −18°C is
 * STORAGE — a separate, informational label concept, never selectable as serving.
 *
 *  - 'serving'    („Temperatura serwowania") — the user's serving choice; maps to
 *    an engine cell (−11/−12/−13 have real target bands; only −11 is calibrated
 *    and active today — see engines.ts).
 *  - 'production' („Produkcja / ekstrakcja") — fresh / dynamic extraction: the
 *    EXISTING `fresh` profile, which computes on the −11°C cell per current
 *    product logic (SPEC §2.1). Nothing behavioral hangs off this tag.
 *  - 'storage'    („Przechowywanie") — freezer / retail −18°C. Label ONLY:
 *    no engineId, no engine routing, and no recipe-correction logic may ever
 *    hang off a storage profile.
 *
 * The user may pick any serving profile now, but only the one whose engine is
 * active (Display −11°C → −11°C Engine) is actually connected. Selecting any
 * other profile is a preview: the recipe is still computed on the active
 * −11°C Engine and a calm note is shown. No future-engine behavior is faked.
 *
 * TODO(future-engines): when a future engine becomes active, its serving profile
 * becomes connected automatically (connectedness is derived from engine status).
 */
import { findEngine } from './engines';

/** The three separated temperature concepts (SPEC §11.2). */
export type TemperatureConcept = 'serving' | 'production' | 'storage';

/** Canonical concept labels — the exact SPEC §11.2 wording (Polish, U+2212). */
export const TEMPERATURE_CONCEPT_LABELS: Record<TemperatureConcept, string> = {
  serving: 'Temperatura serwowania',
  production: 'Produkcja / ekstrakcja',
  storage: 'Przechowywanie',
};

/* ------------------------------------------------------------------------ *
 * SERVING vocabulary (user choice — feeds an engine cell)                   *
 * ------------------------------------------------------------------------ */

export type ServingProfileId =
  | 'fresh'
  | 'display-minus-11'
  | 'display-minus-12'
  | 'display-minus-13';

export interface ServingProfile {
  id: ServingProfileId;
  /** 'serving' for display temperatures; 'production' for fresh (dynamic extraction). */
  concept: Extract<TemperatureConcept, 'serving' | 'production'>;
  /** The engine that WOULD handle this profile (see engines.ts). */
  engineId: string;
  /** Temperature shown to the user (°C); null = to be determined (Fresh). */
  displayTempC: number | null;
}

export const SERVING_PROFILES: readonly ServingProfile[] = [
  { id: 'fresh', concept: 'production', engineId: 'engine-fresh', displayTempC: null },
  { id: 'display-minus-11', concept: 'serving', engineId: 'engine-minus-11', displayTempC: -11 },
  { id: 'display-minus-12', concept: 'serving', engineId: 'engine-minus-12', displayTempC: -12 },
  { id: 'display-minus-13', concept: 'serving', engineId: 'engine-minus-13', displayTempC: -13 },
];

/** The connected default — its engine is the active −11°C Engine. */
export const DEFAULT_SERVING_PROFILE_ID: ServingProfileId = 'display-minus-11';

export const SERVING_PROFILE_ORDER: readonly ServingProfileId[] = [
  'fresh',
  'display-minus-11',
  'display-minus-12',
  'display-minus-13',
];

export const findServingProfile = (id: ServingProfileId): ServingProfile =>
  SERVING_PROFILES.find((profile) => profile.id === id)!;

/** A profile is connected only when its engine is active today (single source of
 * truth = engine status). Non-connected profiles are previews — they still
 * compute on the active −11°C Engine (see intakeToRecipe), never a faked future one. */
export const isServingProfileConnected = (profile: ServingProfile): boolean =>
  findEngine(profile.engineId)?.status === 'active';

/* ------------------------------------------------------------------------ *
 * STORAGE vocabulary (informational label — NEVER a serving choice)         *
 * ------------------------------------------------------------------------ */

export type StorageProfileId = 'storage-minus-18';

/**
 * A storage temperature label (freezer / retail). Deliberately carries NO
 * engineId: storage is presentational routing/labeling only (SPEC §11.2) and
 * no engine input or recipe-correction logic may derive from it.
 */
export interface StorageProfile {
  id: StorageProfileId;
  concept: Extract<TemperatureConcept, 'storage'>;
  displayTempC: number;
}

export const STORAGE_PROFILES: readonly StorageProfile[] = [
  { id: 'storage-minus-18', concept: 'storage', displayTempC: -18 },
];

export const findStorageProfile = (id: StorageProfileId): StorageProfile =>
  STORAGE_PROFILES.find((profile) => profile.id === id)!;

/**
 * Legacy guard: rows saved before the vocabulary split (AUDIT #19) may still
 * carry the retired serving id 'storage-minus-18' in `recipes.serving_profile`.
 * Reads must keep displaying them honestly — as STORAGE, not serving.
 */
export const isLegacyStorageServingId = (value: string): value is StorageProfileId =>
  value === 'storage-minus-18';
