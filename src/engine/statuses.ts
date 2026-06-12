/**
 * Status classification — target-band evaluation into PI indicator statuses
 * (spec §9 bands, §12.7 vocabulary). This layer only CONVERTS existing numeric
 * engine values into statuses: no scoring, no corrections, no suggestions.
 *
 * Rules:
 * - Band selection is category-first and temperature-aware. An unseeded
 *   category falls back to the milk_gelato bands — explicitly a
 *   CALIBRATION-PENDING fallback, flagged on every indicator. Non-anchored
 *   temperatures use the nearest band by |Δtemp| (tie → colder; same documented
 *   strategy as iceFraction.ts), also flagged. No fake target bands are ever
 *   invented for uncalibrated categories or temperatures.
 * - Warn thresholds (`warn_above`/`warn_below`) are honored before the band
 *   check; out-of-band values map through the per-metric directional table;
 *   in-band values split ideal/good by distance from the band center using the
 *   calibration-pending IDEAL_ZONE_FRACTION from config.
 * - Missing values or missing bands classify as 'needs_correction' (the safe
 *   "cannot assess" status — the vocabulary has no 'unknown'); nothing throws
 *   in normal recipe use.
 * - 'premium' and 'too_expensive' exist in the vocabulary but are produced by
 *   the later cost/scoring stage, not here.
 *
 * All functions are pure, deterministic and never mutate their inputs.
 */
import { IDEAL_ZONE_FRACTION, TARGET_BANDS } from './config/targets';
import type {
  IndicatorStatus,
  ProductCategory,
  TargetBand,
  TargetMetric,
  TargetRange,
} from './types';

export interface TargetBandSelection {
  band: TargetBand;
  /** True when milk_gelato bands were used for an unseeded category (calibration-pending). */
  category_fallback: boolean;
  /** True when no exact temperature band existed and the nearest one was used. */
  temperature_fallback: boolean;
}

export interface ClassifyOptions {
  /** Centered band fraction classified 'ideal' (default: config IDEAL_ZONE_FRACTION). */
  ideal_zone_fraction?: number;
}

export interface StatusOptions extends ClassifyOptions {
  bands?: readonly TargetBand[];
}

/** A classified PI indicator — preserves metric, value, band and provenance. */
export interface ClassifiedIndicator {
  key: TargetMetric;
  value: number | null;
  status: IndicatorStatus;
  band: TargetRange | null;
  band_status: 'seeded' | 'estimated' | null;
  category_fallback: boolean;
  temperature_fallback: boolean;
}

/** The 11 metric values to classify (callers compute them via the prior stages). */
export type StatusInputs = Record<TargetMetric, number | null>;

const CATEGORY_FALLBACK: ProductCategory = 'milk_gelato';

/** Directional out-of-band statuses per metric (spec §12.7 vocabulary).
 * Risk-type metrics are one-sided: below their band is 'good' (lower risk is
 * never bad). Unspecified directions default to 'needs_correction'. */
const DIRECTIONAL_STATUS: Record<
  TargetMetric,
  { below: IndicatorStatus; above: IndicatorStatus }
> = {
  pod: { below: 'too_weak', above: 'too_sweet' },
  npac: { below: 'too_hard', above: 'too_soft' },
  ice_fraction: { below: 'too_soft', above: 'too_hard' },
  water: { below: 'needs_correction', above: 'risky' },
  total_solids: { below: 'risky', above: 'needs_correction' },
  lactose: { below: 'needs_correction', above: 'risky' },
  lactose_sandiness_risk: { below: 'good', above: 'risky' },
  alcohol: { below: 'good', above: 'risky' },
  fat: { below: 'needs_correction', above: 'needs_correction' },
  aerating_protein: { below: 'needs_correction', above: 'needs_correction' },
  protein_in_solids: { below: 'needs_correction', above: 'needs_correction' },
};

/** Stable PI indicator order (the spec §9 metric table order). */
const METRIC_ORDER: readonly TargetMetric[] = [
  'pod',
  'npac',
  'ice_fraction',
  'lactose',
  'lactose_sandiness_risk',
  'fat',
  'aerating_protein',
  'protein_in_solids',
  'total_solids',
  'water',
  'alcohol',
];

/**
 * Category-first, temperature-aware band selection with the documented
 * calibration-pending milk_gelato fallback. Returns null when nothing is
 * configured — fake bands are never invented.
 */
export function selectTargetBand(
  category: ProductCategory,
  temperatureC: number,
  bands: readonly TargetBand[] = TARGET_BANDS,
): TargetBandSelection | null {
  if (Number.isNaN(temperatureC)) return null;

  let rows = bands.filter((band) => band.category === category);
  const category_fallback = rows.length === 0;
  if (category_fallback) {
    rows = bands.filter((band) => band.category === CATEGORY_FALLBACK);
  }
  if (rows.length === 0) return null;

  // nearest by |Δtemperature|; ties resolve to the colder band (deterministic)
  let selected = rows[0]!;
  let bestDistance = Math.abs(selected.temperature_c - temperatureC);
  for (const candidate of rows) {
    const distance = Math.abs(candidate.temperature_c - temperatureC);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidate.temperature_c < selected.temperature_c)
    ) {
      selected = candidate;
      bestDistance = distance;
    }
  }

  return {
    band: selected,
    category_fallback,
    temperature_fallback: selected.temperature_c !== temperatureC,
  };
}

/**
 * Core evaluator: one numeric value against one target range.
 * Order: missing checks → warn thresholds → out-of-band direction →
 * in-band ideal/good split by distance from the band center.
 */
export function classifyValue(
  value: number | null,
  range: TargetRange | null | undefined,
  metric: TargetMetric,
  options: ClassifyOptions = {},
): IndicatorStatus {
  const { ideal_zone_fraction = IDEAL_ZONE_FRACTION } = options;

  if (value === null || Number.isNaN(value)) return 'needs_correction';
  if (!range) return 'needs_correction';

  const direction = DIRECTIONAL_STATUS[metric];
  if (range.warn_above !== undefined && value > range.warn_above) return direction.above;
  if (range.warn_below !== undefined && value < range.warn_below) return direction.below;
  if (value < range.min) return direction.below;
  if (value > range.max) return direction.above;

  const halfWidth = (range.max - range.min) / 2;
  if (halfWidth <= 0) return 'good'; // degenerate single-point band
  const center = (range.min + range.max) / 2;
  const distance = Math.abs(value - center) / halfWidth;
  return distance <= ideal_zone_fraction ? 'ideal' : 'good';
}

/** One classified indicator — preserves key, value, range, band provenance. */
export function classifyIndicator(
  metric: TargetMetric,
  value: number | null,
  selection: TargetBandSelection | null,
  options: ClassifyOptions = {},
): ClassifiedIndicator {
  const range = selection?.band.metrics[metric] ?? null;
  return {
    key: metric,
    value,
    status: classifyValue(value, range, metric, options),
    band: range,
    band_status: selection?.band.status ?? null,
    category_fallback: selection?.category_fallback ?? false,
    temperature_fallback: selection?.temperature_fallback ?? false,
  };
}

/** All 11 PI metrics classified in stable order with a single band selection. */
export function classifyRecipeIndicators(
  inputs: StatusInputs,
  category: ProductCategory,
  temperatureC: number,
  options: StatusOptions = {},
): ClassifiedIndicator[] {
  const { bands = TARGET_BANDS, ...classifyOptions } = options;
  const selection = selectTargetBand(category, temperatureC, bands);
  return METRIC_ORDER.map((metric) =>
    classifyIndicator(metric, inputs[metric], selection, classifyOptions),
  );
}

/**
 * Lactose sandiness risk — the spec §9 working definition made computable from
 * existing composition values: lactose concentration relative to the water
 * phase (`lactose_g / water_g × 100`).
 * CALIBRATION-PENDING: the exact scoring formula is finalized against the
 * MyGelato calibration fixtures (spec §9/§16); until then this is the
 * documented working definition, not verified truth.
 * Null-safe: invalid or non-positive water returns null, never NaN/Infinity.
 */
export function computeLactoseSandinessRisk(lactoseG: number, waterG: number): number | null {
  if (!Number.isFinite(lactoseG) || !Number.isFinite(waterG)) return null;
  if (lactoseG < 0 || waterG <= 0) return null;
  return (lactoseG / waterG) * 100;
}
