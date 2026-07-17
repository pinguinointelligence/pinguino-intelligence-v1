/**
 * PINGÜINO User Monitor — §14 modules + summary cards view model (UIUX Slice D).
 *
 * Pure reshaping of an already-computed `RecipeResult` into:
 *  - the six §14.1 SUMMARY CARDS (Struktura, Miękkość, Słodycz, Kremowość,
 *    Pełnia, Stabilność), each a worst-of Złoty Zakres reading over the engine's
 *    OWN classified indicators (`bandPosition` — never re-derived math);
 *  - the §14.2 MODULES, each a list of rows over EXISTING result fields
 *    (indicators, sugar breakdown, component totals, points) with the §14.4
 *    friendly presentation names (original technical term kept as the
 *    tooltip/Expert term).
 *
 * HONESTY: metrics the engine does not compute (plasticity, freezing point,
 * 50%-frozen temperature, MSNF, stabilization water) are NOT fabricated — the
 * modules simply do not list them (client-only build; noted in the slice
 * report). Values are display-rounded ONLY at render time. Pro may see real
 * composition values and band readings (§22); scoring weights and band tables
 * are never exposed beyond what the engine already returns per indicator.
 * Pure: no React, no IO, no mutation.
 */
import type { Indicator, RecipeResult, TargetMetric } from '@/engine';
import {
  GOLDEN_RANGE_SEVERITY,
  GOLDEN_RANGE_STATE_TEXT,
  bandPosition,
  type GoldenRangeReading,
} from '@/features/recipe-score';
import { USER_MONITOR_MODULE_ORDER, type UserMonitorModuleId } from './userMonitorLayout';

/* ------------------------------------------------------------------------ *
 * §14.4 friendly presentation names (technical term stays as Expert term)   *
 * ------------------------------------------------------------------------ */

export interface MetricPresentation {
  /** Friendly Polish presentation name (§14.4). */
  label: string;
  /** The original technical shorthand — tooltip / Expert vocabulary. */
  expertTerm: string;
  unit: string;
}

export const FRIENDLY_METRIC_PRESENTATION: Readonly<Record<TargetMetric, MetricPresentation>> =
  Object.freeze({
    pod: Object.freeze({ label: 'Odczuwalna słodycz', expertTerm: 'POD', unit: '' }),
    npac: Object.freeze({ label: 'Stabilność zamrażania', expertTerm: 'NPAC', unit: '' }),
    ice_fraction: Object.freeze({ label: 'Poziom zamrożenia', expertTerm: 'Ice fraction', unit: '%' }),
    total_solids: Object.freeze({ label: 'Ciała stałe / pełnia', expertTerm: 'Total solids', unit: '%' }),
    water: Object.freeze({ label: 'Woda', expertTerm: 'Water', unit: '%' }),
    fat: Object.freeze({ label: 'Tłuszcz', expertTerm: 'Fat', unit: '%' }),
    aerating_protein: Object.freeze({ label: 'Białko napowietrzające', expertTerm: 'Aerating protein', unit: '%' }),
    protein_in_solids: Object.freeze({ label: 'Białko w suchej masie', expertTerm: 'Protein in solids', unit: '%' }),
    lactose: Object.freeze({ label: 'Laktoza', expertTerm: 'Lactose', unit: '%' }),
    lactose_sandiness_risk: Object.freeze({
      label: 'Ryzyko krystalizacji laktozy',
      expertTerm: 'Lactose risk',
      unit: '',
    }),
    alcohol: Object.freeze({ label: 'Alkohol', expertTerm: 'Alcohol', unit: '%' }),
  });

/* ------------------------------------------------------------------------ *
 * Rows                                                                     *
 * ------------------------------------------------------------------------ */

export interface UserMonitorRow {
  /** Stable row key (metric key or a synthetic data key). */
  key: string;
  /** Pinnable metric id when the row is a classified indicator, else null. */
  metric: TargetMetric | null;
  label: string;
  /** Original technical term (tooltip / Expert), or null for plain data rows. */
  expertTerm: string | null;
  value: number | null;
  unit: string;
  /** Złoty Zakres reading for banded indicator rows; null for plain data rows. */
  reading: GoldenRangeReading | null;
}

function indicatorMap(result: RecipeResult): ReadonlyMap<string, Indicator> {
  return new Map(result.indicators.map((i) => [i.key, i]));
}

/** A classified-indicator row (friendly name + honest 5-state reading). */
function metricRowFrom(
  indicators: ReadonlyMap<string, Indicator>,
  metric: TargetMetric,
): UserMonitorRow {
  const indicator = indicators.get(metric);
  const presentation = FRIENDLY_METRIC_PRESENTATION[metric];
  return {
    key: metric,
    metric,
    label: presentation.label,
    expertTerm: presentation.expertTerm,
    value: indicator?.value ?? null,
    unit: presentation.unit,
    reading: bandPosition(indicator?.value, indicator?.band ?? null),
  };
}

/** A plain data row over an already-computed result field (no band). */
function dataRow(key: string, label: string, value: number | null, unit: string): UserMonitorRow {
  return { key, metric: null, label, expertTerm: null, value, unit, reading: null };
}

/* ------------------------------------------------------------------------ *
 * §14.2 modules                                                            *
 * ------------------------------------------------------------------------ */

export const USER_MONITOR_MODULE_TITLES: Readonly<Record<UserMonitorModuleId, string>> =
  Object.freeze({
    temperatura: 'Zachowanie w temperaturze',
    cukry: 'Cukry i słodycz',
    woda: 'Woda i faza mrożona',
    tluszcze: 'Tłuszcze i kremowość',
    bialka: 'Białka i struktura',
    ciala_stale: 'Ciała stałe i pełnia',
    stabilizacja: 'Stabilizacja',
    specjalne: 'Składniki specjalne',
    expert: 'Tryb Expert',
  });

export interface UserMonitorModuleView {
  id: UserMonitorModuleId;
  title: string;
  rows: UserMonitorRow[];
}

/** Build every §14.2 module (visibility filtering is the layout's job). */
export function buildUserMonitorModules(
  result: RecipeResult,
  servingTemperatureC: number,
): UserMonitorModuleView[] {
  const { sugar, totals } = result;
  const indicators = indicatorMap(result);
  const metricRow = (metric: TargetMetric) => metricRowFrom(indicators, metric);

  const rowsByModule: Record<UserMonitorModuleId, UserMonitorRow[]> = {
    temperatura: [
      dataRow('serving_temperature', 'Temperatura serwowania', servingTemperatureC, '°C'),
      metricRow('ice_fraction'),
    ],
    cukry: [
      metricRow('pod'),
      dataRow('pac_points', 'Siła przeciwzamrożeniowa (PAC)', result.pac_points, ''),
      dataRow('sugar_sucrose', 'Sacharoza', sugar.sucrose_g, 'g'),
      dataRow('sugar_dextrose', 'Dekstroza', sugar.dextrose_g, 'g'),
      dataRow('sugar_glucose', 'Glukoza', sugar.glucose_g, 'g'),
      dataRow('sugar_fructose', 'Fruktoza', sugar.fructose_g, 'g'),
      dataRow('sugar_lactose', 'Laktoza', sugar.lactose_g, 'g'),
    ],
    woda: [metricRow('water'), metricRow('ice_fraction')],
    tluszcze: [metricRow('fat'), dataRow('fat_total', 'Tłuszcz ogółem', totals.fat_g, 'g')],
    bialka: [
      metricRow('aerating_protein'),
      metricRow('protein_in_solids'),
      dataRow('protein_total', 'Białko ogółem', totals.protein_g, 'g'),
    ],
    ciala_stale: [
      metricRow('total_solids'),
      dataRow('fiber_total', 'Błonnik', totals.fiber_g, 'g'),
    ],
    stabilizacja: [
      metricRow('npac'),
      metricRow('lactose_sandiness_risk'),
      metricRow('lactose'),
    ],
    specjalne: [
      metricRow('alcohol'),
      dataRow('salt_total', 'Sól', totals.salt_g, 'g'),
    ],
    // §14.2/9 — the ORIGINAL technical shorthands, only when needed.
    expert: [
      dataRow('expert_pod', 'POD', result.pod_points, ''),
      dataRow('expert_pac', 'PAC', result.pac_points, ''),
      dataRow('expert_npac', 'NPAC', result.npac_points, ''),
      dataRow('expert_ice', 'Ice fraction', result.ice_fraction_percent, '%'),
    ],
  };

  return USER_MONITOR_MODULE_ORDER.map((id) => ({
    id,
    title: USER_MONITOR_MODULE_TITLES[id],
    rows: rowsByModule[id],
  }));
}

/* ------------------------------------------------------------------------ *
 * §14.1 summary cards                                                      *
 * ------------------------------------------------------------------------ */

export type SummaryCardId =
  | 'struktura'
  | 'miekkosc'
  | 'slodycz'
  | 'kremowosc'
  | 'pelnia'
  | 'stabilnosc';

export const SUMMARY_CARD_ORDER: readonly SummaryCardId[] = [
  'struktura',
  'miekkosc',
  'slodycz',
  'kremowosc',
  'pelnia',
  'stabilnosc',
];

export const SUMMARY_CARD_LABELS: Readonly<Record<SummaryCardId, string>> = Object.freeze({
  struktura: 'Struktura',
  miekkosc: 'Miękkość',
  slodycz: 'Słodycz',
  kremowosc: 'Kremowość',
  pelnia: 'Pełnia',
  stabilnosc: 'Stabilność',
});

/** Card → the engine metrics whose classified readings the card aggregates. */
export const SUMMARY_CARD_METRICS: Readonly<Record<SummaryCardId, readonly TargetMetric[]>> =
  Object.freeze({
    struktura: ['aerating_protein', 'protein_in_solids'],
    miekkosc: ['ice_fraction'],
    slodycz: ['pod'],
    kremowosc: ['fat'],
    pelnia: ['total_solids'],
    stabilnosc: ['npac', 'water', 'lactose_sandiness_risk'],
  });

export interface UserMonitorSummaryCard {
  id: SummaryCardId;
  label: string;
  /** Worst-of Złoty Zakres reading across the card's metrics (TEXT + state). */
  reading: GoldenRangeReading;
  /** The underlying §14.4-named rows (the card's expandable detail). */
  rows: UserMonitorRow[];
}

const neutralReading = (): GoldenRangeReading => ({
  state: 'neutral',
  textKey: GOLDEN_RANGE_STATE_TEXT.neutral.textKey,
  text: GOLDEN_RANGE_STATE_TEXT.neutral.text,
  side: null,
});

function worstOf(readings: readonly (GoldenRangeReading | null)[]): GoldenRangeReading {
  let worst: GoldenRangeReading | null = null;
  for (const r of readings) {
    if (r === null || r.state === 'neutral') continue;
    if (worst === null || GOLDEN_RANGE_SEVERITY[r.state] > GOLDEN_RANGE_SEVERITY[worst.state]) {
      worst = r;
    }
  }
  return worst ?? neutralReading();
}

/** Build the six §14.1 summary cards. */
export function buildUserMonitorSummaryCards(result: RecipeResult): UserMonitorSummaryCard[] {
  const indicators = indicatorMap(result);
  return SUMMARY_CARD_ORDER.map((id) => {
    const rows = SUMMARY_CARD_METRICS[id].map((metric) => metricRowFrom(indicators, metric));
    return {
      id,
      label: SUMMARY_CARD_LABELS[id],
      reading: worstOf(rows.map((r) => r.reading)),
      rows,
    };
  });
}
