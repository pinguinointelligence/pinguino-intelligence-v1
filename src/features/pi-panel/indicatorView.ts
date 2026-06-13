/**
 * Pure view model for the PI panel: turns the engine's classified indicators,
 * fallback flags and warnings into display rows. No recipe math — it only
 * reshapes `RecipeResult` fields the engine already computed.
 */
import type { IndicatorStatus } from '@/components/shared/status';
import { copy } from '@/copy/en';
import type { RecipeResult, TargetMetric } from '@/engine';

const pi = copy.studio.pi;

/** The 11 target metrics, in PI-panel display order. */
const METRIC_ORDER: readonly TargetMetric[] = [
  'pod',
  'npac',
  'ice_fraction',
  'total_solids',
  'water',
  'fat',
  'aerating_protein',
  'protein_in_solids',
  'lactose',
  'lactose_sandiness_risk',
  'alcohol',
];

const PERCENT_METRICS: ReadonlySet<TargetMetric> = new Set([
  'ice_fraction',
  'total_solids',
  'water',
  'fat',
  'aerating_protein',
  'protein_in_solids',
  'lactose',
  'alcohol',
]);

/** PI scan groups (presentation only — no math, no engine call). */
export type IndicatorGroup = 'freezing' | 'balance' | 'risk';

const METRIC_GROUP: Record<TargetMetric, IndicatorGroup> = {
  pod: 'freezing',
  npac: 'freezing',
  ice_fraction: 'freezing',
  total_solids: 'balance',
  water: 'balance',
  fat: 'balance',
  aerating_protein: 'balance',
  protein_in_solids: 'balance',
  lactose: 'risk',
  lactose_sandiness_risk: 'risk',
  alcohol: 'risk',
};

/** Friendly label / display unit for a target metric — shared with the
 * correction view so both panels speak the same vocabulary. */
export const metricLabel = (key: TargetMetric): string => pi.indicators[key];
export const metricUnit = (key: TargetMetric): string => (PERCENT_METRICS.has(key) ? '%' : '');

export interface IndicatorRowView {
  key: TargetMetric;
  label: string;
  value: number | null;
  unit: string;
  displayMin: number;
  displayMax: number;
  targetMin: number | null;
  targetMax: number | null;
  status: IndicatorStatus;
  group: IndicatorGroup;
}

export interface WarningView {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

const isTargetMetric = (key: string): key is TargetMetric =>
  (METRIC_ORDER as readonly string[]).includes(key);

/** Bar display bounds: pad around the band, clamp at 0 (all PI metrics are
 * non-negative), and always include the current value. */
function displayBounds(
  band: { min: number; max: number } | null,
  value: number | null,
): { displayMin: number; displayMax: number; targetMin: number | null; targetMax: number | null } {
  if (!band) {
    const v = value ?? 0;
    return { displayMin: 0, displayMax: Math.max(1, v * 1.5), targetMin: null, targetMax: null };
  }
  const pad = Math.max((band.max - band.min) * 0.6, 1);
  let displayMin = Math.max(0, band.min - pad);
  let displayMax = band.max + pad;
  if (value !== null) {
    displayMin = Math.min(displayMin, value);
    displayMax = Math.max(displayMax, value);
  }
  return { displayMin, displayMax, targetMin: band.min, targetMax: band.max };
}

export function buildIndicatorRows(result: RecipeResult): IndicatorRowView[] {
  const byKey = new Map(result.indicators.map((indicator) => [indicator.key, indicator]));
  const rows: IndicatorRowView[] = [];
  for (const key of METRIC_ORDER) {
    const indicator = byKey.get(key);
    if (!indicator || !isTargetMetric(indicator.key)) continue;
    const band = indicator.band ?? null;
    const bounds = displayBounds(band, indicator.value);
    rows.push({
      key,
      label: pi.indicators[key],
      value: indicator.value,
      unit: PERCENT_METRICS.has(key) ? '%' : '',
      status: indicator.status, // engine statuses are a subset of the chip vocabulary
      group: METRIC_GROUP[key],
      ...bounds,
    });
  }
  return rows;
}

/** Calibration honesty (skill): surface fallback provenance, never hide it. */
export function buildFallbackNotes(result: RecipeResult): string[] {
  const notes: string[] = [];
  if (result.indicators.some((indicator) => indicator.category_fallback)) {
    notes.push(pi.fallbackCategory);
  }
  if (result.indicators.some((indicator) => indicator.temperature_fallback)) {
    notes.push(pi.fallbackTemperature);
  }
  return notes;
}

export function buildWarnings(result: RecipeResult): WarningView[] {
  return result.warnings.map((warning) => ({
    code: warning.code,
    message: copy.studio.warnings[warning.code],
    severity: warning.severity,
  }));
}
