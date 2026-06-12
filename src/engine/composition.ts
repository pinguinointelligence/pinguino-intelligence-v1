/**
 * Composition math — spec §6 (main recipe calculations), §4 (sugar logic),
 * §5 (alcohol logic), §15 (effective grams / Actual Batch rule).
 *
 * Raw mass arithmetic only: effective grams, total batch grams, per-component
 * gram totals, percentages, and the typed sugar breakdown. No POD, no PAC/NPAC,
 * no ice fraction, no statuses, no scoring, no corrections — those are later
 * pipeline stages.
 *
 * All functions are pure and deterministic: inputs are never mutated, full float
 * precision is kept internally (display rounding happens at presentation only),
 * and the same input always produces the same output.
 */
import type {
  ComponentTotals,
  EffectiveRecipeItem,
  RecipeItem,
  RecipePercentages,
  SugarBreakdown,
} from './types';

/** Aggregated output of the composition stage. */
export interface CompositionResult {
  items: EffectiveRecipeItem[];
  total_batch_g: number;
  totals: ComponentTotals;
  percentages: RecipePercentages;
  sugar: SugarBreakdown;
}

/**
 * Spec §6/§15: `effective_grams = actual_grams if present, otherwise planned_grams`.
 * `difference = actual − planned` when an actual exists, otherwise 0.
 * Returns new item objects; the input array and its objects are not mutated
 * (ingredient data is treated as immutable input and shared by reference).
 */
export function resolveEffectiveItems(items: readonly RecipeItem[]): EffectiveRecipeItem[] {
  return items.map((item) => {
    const is_actual = item.actual_grams !== null;
    const effective_grams = item.actual_grams ?? item.planned_grams;
    return {
      ...item,
      effective_grams,
      difference: is_actual ? effective_grams - item.planned_grams : 0,
      is_actual,
    };
  });
}

/** Spec §6: `total_batch_g = Σ effective ingredient grams`. */
export function computeTotalBatchGrams(items: readonly EffectiveRecipeItem[]): number {
  let total = 0;
  for (const item of items) total += item.effective_grams;
  return total;
}

/** Spec §6: `component_g = ingredient_grams × component_percent / 100`. */
export function computeComponentGrams(ingredientGrams: number, componentPercent: number): number {
  return (ingredientGrams * componentPercent) / 100;
}

/**
 * Spec §6: the 13 component gram totals.
 * Spec §5: alcohol is summed exclusively from `alcohol_percent` — it is never
 * added into water or solids. Water and solids come only from their own fields.
 */
export function computeComponentTotals(items: readonly EffectiveRecipeItem[]): ComponentTotals {
  const totals: ComponentTotals = {
    water_g: 0,
    solids_g: 0,
    fat_g: 0,
    protein_g: 0,
    lactose_g: 0,
    sucrose_g: 0,
    glucose_g: 0,
    dextrose_g: 0,
    fructose_g: 0,
    polyol_g: 0,
    fiber_g: 0,
    salt_g: 0,
    alcohol_g: 0,
  };

  for (const item of items) {
    const g = item.effective_grams;
    const c = item.ingredient.composition;
    totals.water_g += computeComponentGrams(g, c.water_percent);
    totals.solids_g += computeComponentGrams(g, c.solids_percent);
    totals.fat_g += computeComponentGrams(g, c.fat_percent);
    totals.protein_g += computeComponentGrams(g, c.protein_percent);
    totals.lactose_g += computeComponentGrams(g, c.lactose_percent);
    totals.sucrose_g += computeComponentGrams(g, c.sucrose_percent);
    totals.glucose_g += computeComponentGrams(g, c.glucose_percent);
    totals.dextrose_g += computeComponentGrams(g, c.dextrose_percent);
    totals.fructose_g += computeComponentGrams(g, c.fructose_percent);
    totals.polyol_g += computeComponentGrams(g, c.polyol_percent);
    totals.fiber_g += computeComponentGrams(g, c.fiber_percent);
    totals.salt_g += computeComponentGrams(g, c.salt_percent);
    totals.alcohol_g += computeComponentGrams(g, c.alcohol_percent);
  }

  return totals;
}

/**
 * Spec §6: `component_percent = component_g / total_batch_g × 100`.
 * Division-by-zero safe: an empty or zero-mass batch yields all-zero percentages.
 */
export function computePercentages(
  totals: ComponentTotals,
  totalBatchG: number,
): RecipePercentages {
  const pct = (componentG: number): number =>
    totalBatchG > 0 ? (componentG / totalBatchG) * 100 : 0;

  return {
    water_percent: pct(totals.water_g),
    solids_percent: pct(totals.solids_g),
    fat_percent: pct(totals.fat_g),
    protein_percent: pct(totals.protein_g),
    lactose_percent: pct(totals.lactose_g),
    sucrose_percent: pct(totals.sucrose_g),
    glucose_percent: pct(totals.glucose_g),
    dextrose_percent: pct(totals.dextrose_g),
    fructose_percent: pct(totals.fructose_g),
    polyol_percent: pct(totals.polyol_g),
    fiber_percent: pct(totals.fiber_g),
    salt_percent: pct(totals.salt_g),
    alcohol_percent: pct(totals.alcohol_g),
  };
}

/**
 * Spec §4: sugar types stay separate — never one generic number.
 * `other_sugar_g` is the per-ingredient remainder of `sugar_percent` not covered
 * by the typed split (sucrose + glucose + dextrose + fructose + lactose), clamped
 * at 0 per ingredient to absorb label/data noise. Polyols are tracked from
 * `polyol_percent` and are not part of `sugar_percent` (EU label convention).
 */
export function computeSugarBreakdown(items: readonly EffectiveRecipeItem[]): SugarBreakdown {
  const sugar: SugarBreakdown = {
    sucrose_g: 0,
    glucose_g: 0,
    dextrose_g: 0,
    fructose_g: 0,
    lactose_g: 0,
    polyol_g: 0,
    other_sugar_g: 0,
  };

  for (const item of items) {
    const g = item.effective_grams;
    const c = item.ingredient.composition;
    const sucrose = computeComponentGrams(g, c.sucrose_percent);
    const glucose = computeComponentGrams(g, c.glucose_percent);
    const dextrose = computeComponentGrams(g, c.dextrose_percent);
    const fructose = computeComponentGrams(g, c.fructose_percent);
    const lactose = computeComponentGrams(g, c.lactose_percent);
    const totalSugar = computeComponentGrams(g, c.sugar_percent);
    const typed = sucrose + glucose + dextrose + fructose + lactose;

    sugar.sucrose_g += sucrose;
    sugar.glucose_g += glucose;
    sugar.dextrose_g += dextrose;
    sugar.fructose_g += fructose;
    sugar.lactose_g += lactose;
    sugar.polyol_g += computeComponentGrams(g, c.polyol_percent);
    sugar.other_sugar_g += Math.max(0, totalSugar - typed);
  }

  return sugar;
}

/**
 * Composition stage entry point: effective items → batch mass → component
 * totals → percentages → sugar breakdown. Pure and deterministic; safe for
 * empty recipes (all-zero totals and percentages, no NaN).
 */
export function computeComposition(items: readonly RecipeItem[]): CompositionResult {
  const effectiveItems = resolveEffectiveItems(items);
  const total_batch_g = computeTotalBatchGrams(effectiveItems);
  const totals = computeComponentTotals(effectiveItems);
  return {
    items: effectiveItems,
    total_batch_g,
    totals,
    percentages: computePercentages(totals, total_batch_g),
    sugar: computeSugarBreakdown(effectiveItems),
  };
}
