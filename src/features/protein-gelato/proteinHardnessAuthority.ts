/**
 * CANONICAL PROTEIN HARDNESS AUTHORITY — owner decision 2026-09-03 (option A).
 *
 * Protein hardness is targeted through **ice fraction**, never through NPAC. The
 * NPAC route stays blocked and that scientific statement is unchanged: at an
 * otherwise constant formulation, instrumental hardness rises 13.60 N → 47.66 N
 * as protein goes 4 % → 10 % (Applied Food Research 2(1) 100029, 2022), so the
 * Gelato NPAC→hardness calibration does not transfer to a high-protein mix.
 * Restoring hardness through the ice-fraction path does not overturn that.
 *
 * This module OWNS nothing scientific. Every number it returns comes from the
 * already-published Protein regulator entry (`iceFraction.band`, status
 * `owner_approved_standard_physics_protein_v1`), and its availability comes from
 * the shared engine gate `hasDirectIceAuthorityAtTemperature`. It exists so the
 * mapping stops being owned by the legacy PI-Monitor surface.
 *
 * GRANULARITY IS THE AUTHORITY'S, NOT THE UI'S. Sorbet publishes five distinct
 * NPAC centres per temperature (`SORBET_HARDNESS_TARGET_CENTERS`) and therefore
 * earns five positions. Protein publishes an ice BAND with **no clean centre and
 * no per-level centres** — no `iceFraction` entry on any profile carries one —
 * so it supports exactly the three positions the existing `texturePreference`
 * semantics express: `lower_safe_side / clean_center / upper_safe_side`.
 * Rendering five positions where −2 ≡ −1 would be fake precision. A genuine
 * five-level Protein control is a future calibration task, not a code change.
 */
import {
  hasDirectIceAuthorityAtTemperature,
  type ProductCategory,
  type RecipeDirectionTarget,
  type TargetRange,
} from '@/engine';
import { getTemperatureRegulatorSettingsOrNull } from '@/spine';

/** The three positions the proven Protein authority actually supports. */
export type ProteinHardnessStep = 'softer' | 'balanced' | 'firmer';

export const PROTEIN_HARDNESS_ORDER: readonly ProteinHardnessStep[] = [
  'softer',
  'balanced',
  'firmer',
];

/**
 * The exact Direction value each position WRITES. Never ±2 — the authority has
 * no fourth or fifth target to write.
 */
export const PROTEIN_HARDNESS_TARGET_VALUE: Readonly<Record<ProteinHardnessStep, -1 | 0 | 1>> =
  Object.freeze({ softer: -1, balanced: 0, firmer: 1 });

/**
 * DISPLAY ONLY — project a stored Direction value onto the three positions.
 * Many-to-one, so a draft that already carries ±2 (set elsewhere, or inherited)
 * renders honestly instead of being silently rewritten. Reading must never write.
 */
export function projectProteinHardnessForDisplay(
  stored: RecipeDirectionTarget,
): ProteinHardnessStep {
  if (stored < 0) return 'softer';
  if (stored > 0) return 'firmer';
  return 'balanced';
}

/** Would selecting this position actually change the stored value? */
export function proteinHardnessSelectionChangesStored(
  stored: RecipeDirectionTarget,
  step: ProteinHardnessStep,
): boolean {
  return projectProteinHardnessForDisplay(stored) !== step;
}

/**
 * Availability, from the SHARED engine gate — the same authority the customer
 * Monitor surface used. Never a local re-derivation.
 */
export function proteinHardnessApplies(
  category: ProductCategory,
  servingTemperatureC: number,
): boolean {
  return (
    category === 'protein_gelato' &&
    hasDirectIceAuthorityAtTemperature(category, servingTemperatureC)
  );
}

/**
 * The ice-fraction target band for a position, derived ONLY by dividing the
 * published Protein band at its own midpoint:
 *
 *   softer   → lower safe side  (less frozen water reads softer)
 *   balanced → the published band, unnarrowed (the clean centre)
 *   firmer   → upper safe side
 *
 * The polarity is the documented one — "low ice fraction = softer, high =
 * harder" (`piMonitorAxes`) — and is the INVERSE of NPAC, where a higher value
 * is softer. No limit is restated here and no centre is invented: the midpoint
 * is arithmetic on the published band, nothing more.
 *
 * Returns `null` when Protein has no approved ice band at this temperature, so
 * the caller refuses honestly instead of guessing.
 */
export function proteinHardnessIceBand(
  servingTemperatureC: number,
  step: ProteinHardnessStep,
): TargetRange | null {
  const settings = getTemperatureRegulatorSettingsOrNull('protein_gelato', servingTemperatureC);
  const band = settings?.iceFraction?.band ?? null;
  if (!band) return null;
  const [min, max] = band;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  const midpoint = (min + max) / 2;
  if (step === 'softer') return { min, max: midpoint };
  if (step === 'firmer') return { min: midpoint, max };
  return { min, max };
}

/** Convenience: the band for a stored Direction value, via the display projection. */
export function proteinHardnessBandForTarget(
  servingTemperatureC: number,
  stored: RecipeDirectionTarget,
): TargetRange | null {
  return proteinHardnessIceBand(servingTemperatureC, projectProteinHardnessForDisplay(stored));
}
