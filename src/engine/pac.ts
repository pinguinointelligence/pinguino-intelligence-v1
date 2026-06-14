/**
 * PAC / NPAC — freezing-point depression power (spec §8).
 *
 * Working definitions (spec §8 calibration box — calibration-pending):
 * PAC = anti-freezing power of the sugar spectrum; NPAC = net total freezing
 * depression including alcohol and salt. Calculated separately from POD with
 * their own coefficient tables from src/engine/config/coefficients.ts —
 * no inline coefficients.
 *
 * Per-ingredient precedence (documented, no double counting):
 *   1. Stored value first (spec §8): non-null `pac_value`/`npac_value` wins.
 *      Convention: per-100 g points, sucrose = 100 (mirrors `pod_value`).
 *      A stored `npac_value` is NET — it already covers alcohol/salt for that
 *      ingredient, so nothing is added on top. Data entry must store net values.
 *   2. Syrup DE path: non-null `de_value` → the anchor-interpolated coefficient
 *      applied to the ingredient's SOLIDS grams. This replaces the typed
 *      sugar-breakdown part for that ingredient (validated by the
 *      `dry-glucose-syrup-39de` external reference fixture at calibration).
 *   3. Fallback: typed sugar breakdown (sucrose/dextrose/glucose/fructose/
 *      lactose). Unnamed polyols/special ingredients contribute 0 here —
 *      their path is a stored value (consistent with POD).
 *
 * Alcohol (spec §5/§8): computed from `alcohol_percent` only — never counted
 * as water or solids — and must strongly increase freezing depression
 * (coefficient 7.4 > every sugar). Salt uses the configured coefficient
 * (11.7, flagged CALIBRATION-SENSITIVE in config).
 *
 * Normalization (spec §8): `per_water_mass` is the EXTERNALLY-CONFIRMED canonical
 * basis (CONFIG_VERSION 0.5.0) — two verified external reference fixtures reproduce
 * the reference NPAC per water mass. `per_total_mass` remains available as the
 * explicit alternative. This module computes whichever basis is selected; it adds
 * no policy — callers under per_water must supply `water_g`.
 *
 * All functions are pure, deterministic and never mutate their inputs.
 * No ice fraction here — that is a separate later stage (spec §9).
 */
import { computeComponentGrams } from './composition';
import {
  NPAC_COEFFICIENTS,
  NPAC_NORMALIZATION,
  PAC_COEFFICIENTS,
  SYRUP_DE_ANCHORS,
} from './config/coefficients';
import type {
  EffectiveRecipeItem,
  NpacCoefficients,
  NpacNormalization,
  SugarCoefficients,
  SyrupDeAnchor,
} from './types';

/**
 * Deterministic piecewise-linear interpolation over the configured syrup DE
 * anchors (spec §8 — no behavior beyond the documented anchor table):
 * exact anchor hits return the anchor values; outside the anchor range the
 * nearest end anchor is used (clamped).
 */
export function interpolateSyrupDeAnchors(
  de: number,
  anchors: readonly SyrupDeAnchor[] = SYRUP_DE_ANCHORS,
): { pod: number; pac: number } {
  if (anchors.length === 0) return { pod: 0, pac: 0 };
  const first = anchors[0]!;
  if (de <= first.de) return { pod: first.pod, pac: first.pac };
  const last = anchors[anchors.length - 1]!;
  if (de >= last.de) return { pod: last.pod, pac: last.pac };
  for (let i = 1; i < anchors.length; i++) {
    const hi = anchors[i]!;
    if (de <= hi.de) {
      const lo = anchors[i - 1]!;
      const t = (de - lo.de) / (hi.de - lo.de);
      return {
        pod: lo.pod + t * (hi.pod - lo.pod),
        pac: lo.pac + t * (hi.pac - lo.pac),
      };
    }
  }
  return { pod: last.pod, pac: last.pac };
}

/** Typed sugar-spectrum point-grams (shared fallback for PAC and NPAC). */
function sugarSpectrumPointGrams(
  item: EffectiveRecipeItem,
  coefficients: SugarCoefficients,
): number {
  const c = item.ingredient.composition;
  const g = item.effective_grams;
  return (
    computeComponentGrams(g, c.sucrose_percent) * coefficients.sucrose +
    computeComponentGrams(g, c.dextrose_percent) * coefficients.dextrose +
    computeComponentGrams(g, c.glucose_percent) * coefficients.glucose +
    computeComponentGrams(g, c.fructose_percent) * coefficients.fructose +
    computeComponentGrams(g, c.lactose_percent) * coefficients.lactose
  );
}

/** Syrup DE part: anchor coefficient applied to the ingredient's solids grams. */
function syrupDePointGrams(
  item: EffectiveRecipeItem,
  deValue: number,
  anchors: readonly SyrupDeAnchor[],
): number {
  return (
    computeComponentGrams(item.effective_grams, item.ingredient.composition.solids_percent) *
    interpolateSyrupDeAnchors(deValue, anchors).pac
  );
}

/**
 * One ingredient's PAC term in point-grams: stored `pac_value` → DE path →
 * typed sugar breakdown (see module precedence rules).
 */
export function ingredientPacContribution(
  item: EffectiveRecipeItem,
  coefficients: SugarCoefficients = PAC_COEFFICIENTS,
  anchors: readonly SyrupDeAnchor[] = SYRUP_DE_ANCHORS,
): number {
  const { ingredient, effective_grams } = item;
  if (ingredient.pac_value !== null) {
    return (effective_grams * ingredient.pac_value) / 100;
  }
  if (ingredient.de_value !== null) {
    return syrupDePointGrams(item, ingredient.de_value, anchors);
  }
  return sugarSpectrumPointGrams(item, coefficients);
}

/**
 * One ingredient's NPAC term in point-grams. Stored `npac_value` is net and
 * wins outright (no alcohol/salt added on top). Otherwise: the sugar-or-DE
 * part plus the net-depression terms — `alcohol_g × alcohol` (from
 * `alcohol_percent` only, spec §5) and `salt_g × salt` (calibration-sensitive).
 */
export function ingredientNpacContribution(
  item: EffectiveRecipeItem,
  coefficients: NpacCoefficients = NPAC_COEFFICIENTS,
  anchors: readonly SyrupDeAnchor[] = SYRUP_DE_ANCHORS,
): number {
  const { ingredient, effective_grams } = item;
  if (ingredient.npac_value !== null) {
    return (effective_grams * ingredient.npac_value) / 100;
  }
  const c = ingredient.composition;
  const sugarOrDe =
    ingredient.de_value !== null
      ? syrupDePointGrams(item, ingredient.de_value, anchors)
      : sugarSpectrumPointGrams(item, coefficients);
  return (
    sugarOrDe +
    computeComponentGrams(effective_grams, c.alcohol_percent) * coefficients.alcohol +
    computeComponentGrams(effective_grams, c.salt_percent) * coefficients.salt
  );
}

/**
 * Recipe PAC: `Σ ingredientPacContribution / total_batch_g × 100`.
 * Always normalized per total batch mass. Zero/empty batch → 0, never NaN.
 */
export function computeRecipePac(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
  coefficients: SugarCoefficients = PAC_COEFFICIENTS,
  anchors: readonly SyrupDeAnchor[] = SYRUP_DE_ANCHORS,
): number {
  if (totalBatchG <= 0) return 0;
  let pointGrams = 0;
  for (const item of items) {
    pointGrams += ingredientPacContribution(item, coefficients, anchors);
  }
  return (pointGrams / totalBatchG) * 100;
}

export interface NpacOptions {
  coefficients?: NpacCoefficients;
  anchors?: readonly SyrupDeAnchor[];
  /** Defaults to the config canonical basis (`per_water_mass`, CONFIG 0.5.0). */
  normalization?: NpacNormalization;
  /** Required for the `per_water_mass` basis (the canonical default). */
  water_g?: number;
}

/**
 * Recipe NPAC: `Σ ingredientNpacContribution / denominator × 100`.
 *
 * Denominator follows the normalization basis: the canonical default
 * `per_water_mass` (CONFIG 0.5.0) divides by `options.water_g`; the
 * `per_total_mass` alternative divides by `totalBatchG` and never reads `water_g`.
 * The basis was decided by two active external reference fixtures (spec §8).
 * Zero/empty/missing denominator → 0, never NaN or Infinity (so a per_water call
 * with no water_g safely yields 0 — callers must supply water_g).
 */
export function computeRecipeNpac(
  items: readonly EffectiveRecipeItem[],
  totalBatchG: number,
  options: NpacOptions = {},
): number {
  const {
    coefficients = NPAC_COEFFICIENTS,
    anchors = SYRUP_DE_ANCHORS,
    normalization = NPAC_NORMALIZATION,
    water_g,
  } = options;
  const denominator = normalization === 'per_water_mass' ? (water_g ?? 0) : totalBatchG;
  if (denominator <= 0) return 0;
  let pointGrams = 0;
  for (const item of items) {
    pointGrams += ingredientNpacContribution(item, coefficients, anchors);
  }
  return (pointGrams / denominator) * 100;
}
