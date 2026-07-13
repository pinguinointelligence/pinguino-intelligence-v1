/**
 * Device preset contract (Agent B) — pure.
 *
 * A device preset MAY carry a VERIFIED batch capacity in grams (from a validated
 * device contract). Only a verified grams capacity is allowed to auto-set the
 * batch and skip the batch question.
 *
 * A nominal VOLUME (ml) is NOT a batch: converting ml → grams needs a density /
 * validated device contract, which this pure layer does not have. A preset with
 * only a nominal ml capacity therefore triggers a single confirmation ("ask once,
 * never guess"), never a silent 480-ml-as-480-g assumption.
 *
 * Concrete presets live in `__fixtures__/deviceFixtures.ts` — repository-safe
 * TEST fixtures, not asserted vendor specs.
 */

export interface DevicePreset {
  id: string;
  label: string;
  /**
   * Validated batch capacity in grams from a device contract. Null = not
   * verified — the batch cannot be auto-set from this preset.
   */
  verifiedCapacityGrams: number | null;
  /**
   * Nominal volume the vendor states, in millilitres. Informational ONLY — it is
   * never converted to grams here (no density available). Null = unstated.
   */
  nominalCapacityMl: number | null;
}

export type DeviceCapacityKind =
  | 'verified_grams' // auto-sets batch
  | 'unverified_volume' // ml only → confirm once
  | 'unspecified'; // batch is user-defined

/** Classify a device preset's capacity — deterministic, no conversion. */
export function classifyDeviceCapacity(preset: DevicePreset): DeviceCapacityKind {
  if (typeof preset.verifiedCapacityGrams === 'number' && preset.verifiedCapacityGrams > 0) {
    return 'verified_grams';
  }
  if (typeof preset.nominalCapacityMl === 'number' && preset.nominalCapacityMl > 0) {
    return 'unverified_volume';
  }
  return 'unspecified';
}
