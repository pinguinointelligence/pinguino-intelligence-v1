/**
 * Nutrition declaration builder (Labels & Exports, file-first / client-only).
 *
 * Reuses the engine's OUTPUT (`NutritionPer100g`) and never recomputes recipe
 * math — it only formats the already-computed per-100 g values into an EU
 * declaration order with regulatory precisions. Pure and dependency-free.
 */
import { copy } from '@/copy/en';
import type { NutritionPer100g } from '@/engine';

/** Product-label projection. Alcohol is nullable when a commercial Topping label
 * did not establish it; that omission must not erase otherwise declared facts. */
export type LabelNutritionPer100g = Omit<
  NutritionPer100g,
  'saturated_fat_g' | 'sugars_g' | 'fiber_g' | 'alcohol_g'
> & {
  saturated_fat_g: number | null;
  sugars_g: number | null;
  fiber_g: number | null;
  alcohol_g: number | null;
};

/**
 * kJ per kcal — a DISPLAY unit conversion for the energy row (1 kcal = 4.184 kJ).
 * This is presentation only, NOT recipe math: the engine computes kcal, and the
 * label additionally shows the equivalent kJ so the declaration is EU-complete.
 */
export const KJ_PER_KCAL = 4.184;

export type NutritionRowKey =
  | 'energy'
  | 'fat'
  | 'saturated'
  | 'carbohydrate'
  | 'sugars'
  | 'protein'
  | 'salt'
  | 'fibre'
  | 'alcohol';

export interface NutritionRow {
  /** Stable metric key (rendering / test lookup). */
  key: NutritionRowKey;
  /** Human label, sourced from copy.studio.metrics. */
  label: string;
  /**
   * Rounded numeric value in the row's own unit (grams; for energy this is the
   * kcal figure). Null ONLY when the value is genuinely not available — never a
   * fake 0.
   */
  value: number | null;
  /** Rendered value string (e.g. "7.0 g", "540 kJ / 129 kcal"); null = not available. */
  valueDisplay: string | null;
  /** True for the indented "of which" sub-rows (saturated, sugars). */
  indented: boolean;
}

export interface NutritionDeclaration {
  /** EU-ordered rows: Energy → Fat → saturated → Carbohydrate → sugars → Protein → Salt → Fibre → (Alcohol). */
  rows: NutritionRow[];
  /** False when saturated fat was not available (row declared "not available"). */
  saturatedDeclared: boolean;
  /** True when the recipe carries alcohol (>0) and the alcohol row is present. */
  alcoholDeclared: boolean;
}

/** Round to a fixed number of decimals (half-up), avoiding -0. */
function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

function gramRow(
  key: NutritionRowKey,
  label: string,
  grams: number,
  precision: number,
  indented: boolean,
): NutritionRow {
  const value = round(grams, precision);
  return { key, label, value, valueDisplay: `${value.toFixed(precision)} g`, indented };
}

/**
 * Build an EU nutrition declaration from the engine's per-100 g output.
 * Returns null for null input (e.g. a zero-mass batch) — never a fabricated
 * all-zero label.
 */
export function buildNutritionDeclaration(
  nutrition: LabelNutritionPer100g | null,
): NutritionDeclaration | null {
  if (nutrition === null) return null;

  const m = copy.studio.metrics;
  const rows: NutritionRow[] = [];

  // Energy — declared in BOTH kJ and kcal (kJ is a display conversion).
  const kcal = Math.round(nutrition.kcal);
  const kj = Math.round(nutrition.kcal * KJ_PER_KCAL);
  rows.push({
    key: 'energy',
    label: m.kcal,
    value: kcal,
    valueDisplay: `${kj} kJ / ${kcal} kcal`,
    indented: false,
  });

  rows.push(gramRow('fat', m.fat, nutrition.fat_g, 1, false));

  // "of which saturated": when saturated data is incomplete the engine reports
  // null — declare "not available", never a misleading 0.
  const saturatedDeclared = nutrition.saturated_fat_g !== null;
  rows.push(
    saturatedDeclared
      ? gramRow('saturated', m.saturated, nutrition.saturated_fat_g as number, 1, true)
      : { key: 'saturated', label: m.saturated, value: null, valueDisplay: null, indented: true },
  );

  rows.push(gramRow('carbohydrate', m.carbs, nutrition.carbohydrate_g, 1, false));
  rows.push(
    nutrition.sugars_g === null
      ? { key: 'sugars', label: m.sugars, value: null, valueDisplay: null, indented: true }
      : gramRow('sugars', m.sugars, nutrition.sugars_g, 1, true),
  );
  rows.push(gramRow('protein', m.protein, nutrition.protein_g, 1, false));
  rows.push(gramRow('salt', m.salt, nutrition.salt_g, 2, false));
  rows.push(
    nutrition.fiber_g === null
      ? { key: 'fibre', label: m.fiber, value: null, valueDisplay: null, indented: false }
      : gramRow('fibre', m.fiber, nutrition.fiber_g, 1, false),
  );

  // Alcohol row only when the mix actually carries alcohol.
  const alcoholDeclared = nutrition.alcohol_g !== null && nutrition.alcohol_g > 0;
  if (alcoholDeclared) {
    rows.push(gramRow('alcohol', m.alcohol, nutrition.alcohol_g as number, 1, false));
  }

  return { rows, saturatedDeclared, alcoholDeclared };
}
