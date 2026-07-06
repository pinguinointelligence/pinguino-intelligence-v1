/**
 * PINGUINO Spine — Base Engine → Temperature Regulator metric adapter (Slice 6).
 *
 * A tiny PURE seam that maps the shared Base Engine's `RecipeResult` onto the
 * `BaseEngineMetrics` the Temperature Regulator evaluation consumes. It does NOT
 * import the engine (spine files import only within src/spine): it accepts a
 * STRUCTURAL subset of the real `RecipeResult` (a genuine engine result satisfies
 * it), reads it read-only, and never recalculates anything.
 *
 * Field provenance (verified against src/engine):
 * - npac  ← npac_points, pod ← pod_points, iceFraction ← ice_fraction_percent
 * - water/solids/fat/lactose ← percentages.*_percent
 * - lactoseSanding ← the engine's `lactose_sandiness_risk` = (lactose_g/water_g)*100,
 *   whose seeded band {5,9} is identical to the regulator's lactoseSanding band —
 *   same metric, same scale.
 * - aeratingProtein ← percentages.protein_percent (the engine's aerating_protein input)
 * - proteinShareInSolids ← (protein_g / solids_g) * 100 (the engine's protein_in_solids)
 * - stabilizerGrams ← summed effective grams of stabilizer-category / is_stabilizer items
 *
 * A null core metric (empty/degenerate recipe) is mapped to NaN and reported in
 * `missingFields` + a warning — never a silent zero. The regulator then treats a
 * non-finite metric as not-evaluable, and the router blocks on missing core data.
 */
import type { BaseEngineMetrics } from './evaluateTemperatureRegulator';

/** The `RecipeResult` fields this adapter reads — a structural subset the real result satisfies. */
export interface BaseEngineResultLike {
  pod_points: number | null;
  npac_points: number | null;
  ice_fraction_percent: number | null;
  percentages: {
    water_percent: number;
    solids_percent: number;
    fat_percent: number;
    lactose_percent: number;
    protein_percent: number;
  };
  totals?: {
    protein_g?: number;
    solids_g?: number;
    lactose_g?: number;
    water_g?: number;
  };
  indicators?: ReadonlyArray<{ key: string; value: number | null }>;
  items?: ReadonlyArray<{
    effective_grams: number;
    ingredient: { category?: string; flags?: { is_stabilizer?: boolean } };
  }>;
}

export interface BaseEngineMetricsAdaptation {
  metrics: BaseEngineMetrics;
  /** Core metrics that were null/non-finite in the engine result (npac/pod/iceFraction/water/solids). */
  missingFields: string[];
  /** Structured, code-based diagnostics — no English decision logic lives here. */
  warnings: string[];
  /** True when every CORE metric is finite (the recipe can be temperature-evaluated). */
  complete: boolean;
}

/** The five metrics the Temperature Regulator must have to evaluate at all. */
type CoreMetricField = 'npac' | 'pod' | 'iceFraction' | 'water' | 'solids';

const indicatorValue = (
  indicators: BaseEngineResultLike['indicators'],
  key: string,
): number | undefined => {
  const found = indicators?.find((i) => i.key === key)?.value;
  return typeof found === 'number' && Number.isFinite(found) ? found : undefined;
};

/** protein_in_solids = protein_g / solids_g * 100, per the Base Engine status stage. */
const proteinShareFromTotals = (totals: BaseEngineResultLike['totals']): number | undefined => {
  const protein = totals?.protein_g;
  const solids = totals?.solids_g;
  if (typeof protein !== 'number' || typeof solids !== 'number' || !(solids > 0)) return undefined;
  const share = (protein / solids) * 100;
  return Number.isFinite(share) ? share : undefined;
};

/** lactose_sandiness_risk = lactose_g / water_g * 100, per the Base Engine status stage. */
const lactoseSandingFromTotals = (totals: BaseEngineResultLike['totals']): number | undefined => {
  const lactose = totals?.lactose_g;
  const water = totals?.water_g;
  if (typeof lactose !== 'number' || typeof water !== 'number' || !(water > 0)) return undefined;
  const risk = (lactose / water) * 100;
  return Number.isFinite(risk) ? risk : undefined;
};

const stabilizerGramsFromItems = (
  items: BaseEngineResultLike['items'],
): number | undefined => {
  if (!items) return undefined; // not derivable — the regulator treats this as "not reported"
  return items.reduce(
    (sum, item) =>
      item.ingredient.category === 'stabilizer' || item.ingredient.flags?.is_stabilizer
        ? sum + (Number.isFinite(item.effective_grams) ? item.effective_grams : 0)
        : sum,
    0,
  );
};

/**
 * Map a Base Engine result into `BaseEngineMetrics`. Pure — never mutates the
 * input, never recalculates, never imports the engine. Null core metrics become
 * NaN and are surfaced in `missingFields` + warnings; derived metrics are read
 * from the engine's classified `indicators` first, then computed from `totals`.
 */
export function adaptBaseEngineResult(result: BaseEngineResultLike): BaseEngineMetricsAdaptation {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  const core = (name: CoreMetricField, value: number | null): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    missingFields.push(name);
    warnings.push(`missing_base_engine_metric:${name}`);
    return Number.NaN;
  };

  const p = result.percentages;
  const lactoseSanding =
    indicatorValue(result.indicators, 'lactose_sandiness_risk') ??
    lactoseSandingFromTotals(result.totals);
  const proteinShareInSolids =
    indicatorValue(result.indicators, 'protein_in_solids') ??
    proteinShareFromTotals(result.totals);
  const stabilizerGrams = stabilizerGramsFromItems(result.items);

  const metrics: BaseEngineMetrics = {
    npac: core('npac', result.npac_points),
    pod: core('pod', result.pod_points),
    iceFraction: core('iceFraction', result.ice_fraction_percent),
    water: core('water', Number.isFinite(p.water_percent) ? p.water_percent : null),
    solids: core('solids', Number.isFinite(p.solids_percent) ? p.solids_percent : null),
    fat: Number.isFinite(p.fat_percent) ? p.fat_percent : undefined,
    lactose: Number.isFinite(p.lactose_percent) ? p.lactose_percent : undefined,
    lactoseSanding,
    aeratingProtein: Number.isFinite(p.protein_percent) ? p.protein_percent : undefined,
    proteinShareInSolids,
    stabilizerGrams,
  };

  if (lactoseSanding === undefined) warnings.push('lactose_sanding_unavailable');
  if (proteinShareInSolids === undefined) warnings.push('protein_share_unavailable');

  return { metrics, missingFields, warnings, complete: missingFields.length === 0 };
}
