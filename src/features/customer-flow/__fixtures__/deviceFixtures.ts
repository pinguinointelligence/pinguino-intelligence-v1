/**
 * Device catalogue (Agent B) — explicit real device models.
 *
 * These are the concrete devices offered to the customer. Container VOLUMES are
 * the vendors' official European-market figures in millilitres. The three Ninja
 * CREAMi models now carry an OWNER-APPROVED, verified recipe MASS in grams
 * (`targetRecipeMassStatus: 'verified'`): an owner has explicitly approved the
 * fill mass for each container, so those masses auto-set the batch and skip the
 * batch question. The gram value is the approved recipe-fill preset — it is NOT
 * derived from the ml volume (473 ml → 480 g and 709 ml → 700 g are approved
 * numbers, never an ml→g conversion). The professional machine has no fixed
 * container, so it keeps no mass and the operator defines the batch.
 *
 * Do NOT invent gram targets here — only owner-approved values belong.
 */
import type { DevicePreset } from '../devicePresets';

/**
 * Ninja CREAMi (standard / original) — 473 ml container. Owner-approved recipe
 * fill mass: 480 g (verified). The 480 g is the approved preset, not the ml.
 */
export const NINJA_CREAMI: DevicePreset = {
  id: 'ninja-creami',
  label: 'Ninja CREAMi',
  kind: 'appliance',
  containerCapacityMl: 473,
  targetRecipeMassG: 480,
  targetRecipeMassStatus: 'verified',
};

/**
 * Ninja CREAMi Scoop & Swirl — 473 ml container. Owner-approved recipe fill
 * mass: 480 g (verified). Same approved preset as the standard CREAMi.
 */
export const NINJA_CREAMI_SCOOP_SWIRL: DevicePreset = {
  id: 'ninja-creami-scoop-swirl',
  label: 'Ninja CREAMi Scoop & Swirl',
  kind: 'appliance',
  containerCapacityMl: 473,
  targetRecipeMassG: 480,
  targetRecipeMassStatus: 'verified',
};

/**
 * Ninja CREAMi Deluxe — 709 ml container. Owner-approved recipe fill mass:
 * 700 g (verified). The 700 g is the approved preset, not the ml.
 */
export const NINJA_CREAMI_DELUXE: DevicePreset = {
  id: 'ninja-creami-deluxe',
  label: 'Ninja CREAMi Deluxe',
  kind: 'appliance',
  containerCapacityMl: 709,
  targetRecipeMassG: 700,
  targetRecipeMassStatus: 'verified',
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
