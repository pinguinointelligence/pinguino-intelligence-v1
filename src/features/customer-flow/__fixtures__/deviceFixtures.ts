/**
 * Device catalogue (Agent B) — explicit real device models.
 *
 * These are the concrete devices offered to the customer. Container VOLUMES are
 * the vendors' official European-market figures in millilitres. NO owner-approved
 * recipe MASS exists yet for any of them, so `targetRecipeMassG` is null and
 * `targetRecipeMassStatus` is 'missing' on every model — a volume is never turned
 * into a gram target on its own. An owner must approve a verified mass before the
 * batch can be auto-set; until then the customer is asked once for the recipe mass
 * (appliances with a container) or defines the batch directly (professional).
 *
 * Do NOT invent gram targets here.
 */
import type { DevicePreset } from '../devicePresets';

/** Ninja CREAMi (standard / original) — 473 ml container, no verified mass yet. */
export const NINJA_CREAMI: DevicePreset = {
  id: 'ninja-creami',
  label: 'Ninja CREAMi',
  kind: 'appliance',
  containerCapacityMl: 473,
  targetRecipeMassG: null,
  targetRecipeMassStatus: 'missing',
};

/** Ninja CREAMi Scoop & Swirl — 473 ml container, no verified mass yet. */
export const NINJA_CREAMI_SCOOP_SWIRL: DevicePreset = {
  id: 'ninja-creami-scoop-swirl',
  label: 'Ninja CREAMi Scoop & Swirl',
  kind: 'appliance',
  containerCapacityMl: 473,
  targetRecipeMassG: null,
  targetRecipeMassStatus: 'missing',
};

/** Ninja CREAMi Deluxe — 709 ml container, no verified mass yet. */
export const NINJA_CREAMI_DELUXE: DevicePreset = {
  id: 'ninja-creami-deluxe',
  label: 'Ninja CREAMi Deluxe',
  kind: 'appliance',
  containerCapacityMl: 709,
  targetRecipeMassG: null,
  targetRecipeMassStatus: 'missing',
};

/** Professional machine — operator defines the batch (no fixed container). */
export const PROFESSIONAL_MACHINE: DevicePreset = {
  id: 'professional-machine',
  kind: 'professional',
  label: 'Professional machine',
  containerCapacityMl: null,
  targetRecipeMassG: null,
  targetRecipeMassStatus: 'missing',
};

export const DEVICE_FIXTURES: readonly DevicePreset[] = [
  NINJA_CREAMI,
  NINJA_CREAMI_SCOOP_SWIRL,
  NINJA_CREAMI_DELUXE,
  PROFESSIONAL_MACHINE,
];

/** Alias kept as the catalogue's canonical export name. */
export const DEVICE_CATALOGUE = DEVICE_FIXTURES;
