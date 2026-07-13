/**
 * Device preset contract (Agent B) — pure.
 *
 * A device is either a home APPLIANCE (e.g. a Ninja CREAMi that freezes a fixed
 * container and runs a fixed program) or a PROFESSIONAL machine (batch freezer /
 * mantecatore where the operator decides the batch size). The two are genuinely
 * different device paths, so the model makes the kind explicit.
 *
 * Two capacity facts are tracked, and they are NOT interchangeable:
 *  - `containerCapacityMl` — the official VOLUME the vendor states, in ml. It is
 *    informational only and is NEVER converted to grams here (that needs a
 *    density / an owner-approved recipe mass, which this pure layer does not
 *    have). Volume is never silently treated as mass.
 *  - `targetRecipeMassG` — an owner-approved RECIPE MASS in grams for that
 *    container. Only a `verified` mass is allowed to auto-set the batch and skip
 *    the batch question. It stays NULL until an owner explicitly approves one.
 *
 * A device with a container volume but no verified mass therefore triggers a
 * single confirmation ("ask once, never guess"), never a silent ml-as-grams
 * assumption. A professional machine with neither leaves the batch user-defined.
 *
 * Concrete presets live in `__fixtures__/deviceFixtures.ts`.
 */

export type DeviceKind = 'appliance' | 'professional';

/** Provenance of a device's owner-approved recipe mass. */
export type TargetRecipeMassStatus = 'verified' | 'provisional' | 'missing';

export interface DevicePreset {
  id: string;
  label: string;
  /** Home appliance (fixed container + program) vs professional batch machine. */
  kind: DeviceKind;
  /**
   * Official container VOLUME in millilitres. Informational ONLY — it is never
   * converted to grams here (no density available). Null = unstated.
   */
  containerCapacityMl: number | null;
  /**
   * Owner-approved RECIPE MASS in grams for this container. Only a `verified`
   * value auto-sets the batch. Null until an owner approves one.
   */
  targetRecipeMassG: number | null;
  /** Provenance of `targetRecipeMassG`. Only `verified` may auto-set the batch. */
  targetRecipeMassStatus: TargetRecipeMassStatus;
}

export type DeviceCapacityKind =
  | 'verified_mass' // owner-approved recipe mass → auto-sets the batch
  | 'volume_needs_mass' // ml container only → confirm the recipe mass once
  | 'unspecified'; // batch is user-defined

/** True only when the preset carries an owner-approved (verified) recipe mass. */
export function hasVerifiedRecipeMass(preset: DevicePreset): boolean {
  return (
    preset.targetRecipeMassStatus === 'verified' &&
    typeof preset.targetRecipeMassG === 'number' &&
    preset.targetRecipeMassG > 0
  );
}

/** Classify a device preset's capacity — deterministic, never converts ml → g. */
export function classifyDeviceCapacity(preset: DevicePreset): DeviceCapacityKind {
  if (hasVerifiedRecipeMass(preset)) {
    return 'verified_mass';
  }
  if (typeof preset.containerCapacityMl === 'number' && preset.containerCapacityMl > 0) {
    return 'volume_needs_mass';
  }
  return 'unspecified';
}
