/**
 * Serving / production profiles — stored PREFERENCES, NOT engines (Step 6A).
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

export type ServingProfileId =
  | 'fresh'
  | 'display-minus-11'
  | 'display-minus-12'
  | 'display-minus-13'
  | 'storage-minus-18';

export interface ServingProfile {
  id: ServingProfileId;
  /** The engine that WOULD handle this profile (see engines.ts). */
  engineId: string;
  /** Temperature shown to the user (°C); null = to be determined (Fresh). */
  displayTempC: number | null;
}

export const SERVING_PROFILES: readonly ServingProfile[] = [
  { id: 'fresh', engineId: 'engine-fresh', displayTempC: null },
  { id: 'display-minus-11', engineId: 'engine-minus-11', displayTempC: -11 },
  { id: 'display-minus-12', engineId: 'engine-minus-12', displayTempC: -12 },
  { id: 'display-minus-13', engineId: 'engine-minus-13', displayTempC: -13 },
  { id: 'storage-minus-18', engineId: 'engine-storage-18', displayTempC: -18 },
];

/** The connected default — its engine is the active −11°C Engine. */
export const DEFAULT_SERVING_PROFILE_ID: ServingProfileId = 'display-minus-11';

export const SERVING_PROFILE_ORDER: readonly ServingProfileId[] = [
  'fresh',
  'display-minus-11',
  'display-minus-12',
  'display-minus-13',
  'storage-minus-18',
];

export const findServingProfile = (id: ServingProfileId): ServingProfile =>
  SERVING_PROFILES.find((profile) => profile.id === id)!;

/** A profile is connected only when its engine is active today (single source of
 * truth = engine status). Non-connected profiles are previews — they still
 * compute on the active −11°C Engine (see intakeToRecipe), never a faked future one. */
export const isServingProfileConnected = (profile: ServingProfile): boolean =>
  findEngine(profile.engineId)?.status === 'active';
