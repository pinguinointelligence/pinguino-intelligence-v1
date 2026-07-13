/**
 * Repository-safe DEVICE PRESET fixtures (Agent B).
 *
 * These are TEST fixtures, NOT asserted vendor specifications. The grams
 * capacities below are illustrative fixture values used to exercise the
 * verified / unverified / unspecified branches of the batch logic — they do not
 * claim a real, calibrated device capacity. In particular the "unverified"
 * preset intentionally carries only a nominal ml volume to prove that ml is
 * NEVER silently converted to grams.
 */
import type { DevicePreset } from '../devicePresets';

/** Home churn device WITH a verified grams capacity (auto-sets the batch). */
export const NINJA_VERIFIED_FIXTURE: DevicePreset = {
  id: 'ninja-verified-fixture',
  label: 'Ninja (verified capacity — fixture)',
  verifiedCapacityGrams: 700,
  nominalCapacityMl: null,
};

/** Home churn device with a NOMINAL VOLUME only — must confirm once, never guess. */
export const NINJA_UNVERIFIED_FIXTURE: DevicePreset = {
  id: 'ninja-unverified-fixture',
  label: 'Ninja (nominal volume only — fixture)',
  verifiedCapacityGrams: null,
  nominalCapacityMl: 473,
};

/** Professional machine where the batch is user-defined (no auto capacity). */
export const PROFESSIONAL_MACHINE_FIXTURE: DevicePreset = {
  id: 'professional-fixture',
  label: 'Professional machine (fixture)',
  verifiedCapacityGrams: null,
  nominalCapacityMl: null,
};

export const DEVICE_FIXTURES: readonly DevicePreset[] = [
  NINJA_VERIFIED_FIXTURE,
  NINJA_UNVERIFIED_FIXTURE,
  PROFESSIONAL_MACHINE_FIXTURE,
];
