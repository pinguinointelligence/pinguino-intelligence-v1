/**
 * PINGÜINO Customer Flow — SERVING / MACHINE MODE matrix (owner-approved, pure).
 *
 * Exactly SIX customer-facing modes replace the old device + serving-temperature
 * steps. Three are direct temperatures, one is our fresh-production machine, and
 * two are Ninja machine profiles. Each mode is a customer-facing ALIAS to an
 * EXISTING temperature-aware Engine cell — this module creates NO new Engine,
 * TARGET_BANDS, profile or solver logic; it only maps a visible mode to the
 * supported internal temperature (and, for Ninja, an owner-approved recipe mass).
 *
 * Routing (owner-approved):
 *   −11°C        → −11    | −12°C → −12 | −13°C → −13
 *   Świeże       → −11 (our machine, fresh production — NOT a separate Engine)
 *   Ninja Gelato → −13, approved mass 700 g
 *   Ninja Swirl  → −11, approved mass 480 g
 *
 * The Ninja masses are APPROVED RECIPE PRESETS, never derived from ml. Pure: no
 * IO, no engine math, no grams computed from volume.
 */

/** The six visible modes (stable display order). */
export type ServingModeId =
  | 'temp_minus_11'
  | 'temp_minus_12'
  | 'temp_minus_13'
  | 'fresh'
  | 'ninja_gelato'
  | 'ninja_swirl';

export type ServingModeKind = 'direct' | 'fresh' | 'ninja';

/** Supported internal Engine temperature cells (no −18, no arbitrary custom). */
export type SupportedTemperatureC = -11 | -12 | -13;

export interface ServingMode {
  id: ServingModeId;
  kind: ServingModeKind;
  /** The EXISTING temperature-aware Engine cell this visible mode routes to. */
  temperatureC: SupportedTemperatureC;
  /** Owner-approved recipe mass (grams) for a Ninja machine mode; null otherwise. */
  approvedMassG: number | null;
}

/** The canonical six modes, in display order. */
export const SERVING_MODES: readonly ServingMode[] = [
  { id: 'temp_minus_11', kind: 'direct', temperatureC: -11, approvedMassG: null },
  { id: 'temp_minus_12', kind: 'direct', temperatureC: -12, approvedMassG: null },
  { id: 'temp_minus_13', kind: 'direct', temperatureC: -13, approvedMassG: null },
  { id: 'fresh', kind: 'fresh', temperatureC: -11, approvedMassG: null },
  { id: 'ninja_gelato', kind: 'ninja', temperatureC: -13, approvedMassG: 700 },
  { id: 'ninja_swirl', kind: 'ninja', temperatureC: -11, approvedMassG: 480 },
];

/** The six mode ids, in display order. */
export const SERVING_MODE_ORDER: readonly ServingModeId[] = SERVING_MODES.map((m) => m.id);

const BY_ID: ReadonlyMap<string, ServingMode> = new Map(SERVING_MODES.map((m) => [m.id, m] as const));

/** The mode for an id (or null when unknown / stale / unsupported). */
export function servingModeById(id: string | null | undefined): ServingMode | null {
  if (id == null) return null;
  return BY_ID.get(id) ?? null;
}

/** True when `id` is one of the six supported modes. */
export function isServingModeId(id: string | null | undefined): id is ServingModeId {
  return id != null && BY_ID.has(id);
}

/** True for the two Ninja machine modes (auto-set mass, skip the batch question). */
export function isNinjaMode(id: string | null | undefined): boolean {
  return servingModeById(id)?.kind === 'ninja';
}

/** The supported temperature cell a mode routes to, or null when unknown. */
export function temperatureForMode(id: string | null | undefined): SupportedTemperatureC | null {
  return servingModeById(id)?.temperatureC ?? null;
}

/** The owner-approved Ninja recipe mass for a mode, or null (non-Ninja/unknown). */
export function approvedMassForMode(id: string | null | undefined): number | null {
  return servingModeById(id)?.approvedMassG ?? null;
}
