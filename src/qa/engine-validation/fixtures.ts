/**
 * AGENT B — ENGINE VALIDATION fixtures (NIGHTLY P0, read-only science).
 *
 * Exact, immutable validation fixtures + a structured recorder of what
 * PINGÜINO's `calculateRecipe` ACTUALLY returns for them. The tests built on
 * this module are DRIFT DETECTORS: they pin the current engine output so any
 * future formula/config/data change is caught — they are NOT judgments of
 * scientific correctness, and nothing here changes any engine value.
 *
 * Ingredient identity (documented, no invention):
 *  - All rows come from the repo's canonical demo catalog
 *    (src/data/demoIngredients.ts) — the same literature compositions used by
 *    DEFAULT_CORRECTION_CANDIDATES (src/engine/corrections/candidates.ts).
 *  - SURROGATE MAPPING: the fixtures' "Strawberry" uses the raspberry demo row
 *    re-identified as `PI-ING-001553` / "STRAWBERRIES · Fresh Fruit"
 *    (category 'fruit') — the exact convention already used by
 *    src/features/formulation/liveRuntime.test.ts and
 *    src/features/formulation/constrainedReformulation.test.ts. There is no
 *    strawberry composition row anywhere in the repo; the raspberry literature
 *    profile is the repo's stand-in. Documented here, never presented as
 *    strawberry truth.
 *  - Every demo row is CLONED before use (the shared catalog objects are never
 *    frozen or touched) and the clones are deep-frozen so the fixtures are
 *    immutable by construction.
 *
 * MyGelato numbers (fixture B2 grams) are a COMPARISON SOURCE ONLY — they are
 * never promoted as truth and never written into any engine value.
 */
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import { calculateRecipe } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { recipeMatchScore } from '@/features/recipe-score';

/* ── immutability helpers ────────────────────────────────────────────────── */

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

/** Clone a shared demo-catalog row so the catalog itself is never frozen. */
const cloneIngredient = (ingredient: EngineIngredient): EngineIngredient => ({
  ...ingredient,
  composition: { ...ingredient.composition },
  flags: ingredient.flags ? { ...ingredient.flags } : undefined,
});

const demoIngredient = (id: string): EngineIngredient => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`demo catalog ingredient missing: ${id}`);
  return cloneIngredient(found);
};

/**
 * The documented strawberry SURROGATE: the raspberry demo row re-identified
 * exactly as the live-Mapper strawberry is modeled in the repo's own tests.
 */
export const strawberrySurrogate = (): EngineIngredient => ({
  ...demoIngredient('raspberry'),
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
});

const line = (id: string, ingredient: EngineIngredient, grams: number): RecipeItem => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

const input = (
  category: RecipeInput['category'],
  items: RecipeItem[],
): RecipeInput => ({
  items,
  mode: 'classic',
  category,
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
});

/* ── the three exact fixtures ────────────────────────────────────────────── */

/**
 * B1 — PINGÜINO-generated Fruit Gelato (visible Gelato, classic, −11 °C,
 * 1000 g). These grams are the repo's own `fruit_gelato_ref_v1` template
 * proportions (src/features/formulation/templateRegistry.ts — reference-derived,
 * staging-only, tara template-controlled at 5 g).
 */
export const B1_PINGUINO_FRUIT_GELATO: RecipeInput = deepFreeze(
  input('fruit_gelato', [
    line('b1-strawberry', strawberrySurrogate(), 350),
    line('b1-milk', demoIngredient('milk_3_5'), 380),
    line('b1-cream', demoIngredient('cream_30'), 80),
    line('b1-smp', demoIngredient('smp'), 40),
    line('b1-sucrose', demoIngredient('sucrose'), 110),
    line('b1-dextrose', demoIngredient('dextrose'), 35),
    line('b1-tara', demoIngredient('tara_gum'), 5),
  ]),
);

/**
 * B2 — MyGelato auto-balanced COMPARISON recipe (≈1000.01 g), run through
 * PINGÜINO's engine with the SAME canonical demo compositions as B1 so only
 * the gram distribution differs. Comparison source only — never truth.
 */
export const B2_MYGELATO_AUTOBALANCED_FRUIT_GELATO: RecipeInput = deepFreeze(
  input('fruit_gelato', [
    line('b2-strawberry', strawberrySurrogate(), 265.7),
    line('b2-milk', demoIngredient('milk_3_5'), 396.7),
    line('b2-cream', demoIngredient('cream_30'), 119.5),
    line('b2-smp', demoIngredient('smp'), 64),
    line('b2-sucrose', demoIngredient('sucrose'), 117.8),
    line('b2-dextrose', demoIngredient('dextrose'), 34.9),
    line('b2-tara', demoIngredient('tara_gum'), 1.41),
  ]),
);

/**
 * B3 — the owner's dairy fixture (milk_gelato, 999.91 g) — the exact
 * "MyGelato copy" grams already exercised by
 * src/features/constraint-studio/autoBalance.test.ts (PHASE 10).
 */
export const B3_OWNER_DAIRY_MILK_GELATO: RecipeInput = deepFreeze(
  input('milk_gelato', [
    line('b3-milk', demoIngredient('milk_3_5'), 592.3),
    line('b3-cream', demoIngredient('cream_30'), 216.6),
    line('b3-smp', demoIngredient('smp'), 22),
    line('b3-sucrose', demoIngredient('sucrose'), 32.5),
    line('b3-dextrose', demoIngredient('dextrose'), 110),
    line('b3-salt', demoIngredient('salt'), 0.8),
    line('b3-inulin', demoIngredient('inulin'), 23.7),
    line('b3-tara', demoIngredient('tara_gum'), 2.01),
  ]),
);

/* ── structured recorder ─────────────────────────────────────────────────── */

/** 4-decimal rounding: stable, readable pins; full float stays in the engine. */
export const r4 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 1e4) / 1e4;

export interface RecordedBand {
  min: number;
  max: number;
  warn_above?: number;
  warn_below?: number;
}

export interface RecordedIndicator {
  key: string;
  value: number | null;
  status: string;
  band: RecordedBand | null;
  band_status: 'seeded' | 'estimated' | null;
  category_fallback: boolean;
  temperature_fallback: boolean;
}

export interface RecordedLine {
  line: string;
  ingredient_id: string;
  name: string;
  grams: number;
}

export interface EngineRecord {
  engine_version: string;
  config_version: string;
  ingredients: RecordedLine[];
  total_batch_g: number | null;
  totals: Record<string, number | null>;
  percentages: Record<string, number | null>;
  sugar: Record<string, number | null>;
  pod_points: number | null;
  pac_points: number | null;
  npac_points: number | null;
  ice_fraction_percent: number | null;
  indicators: RecordedIndicator[];
  scores: {
    technical: number | null;
    flavor: number | null;
    cost: number | null;
    overall: number | null;
  } | null;
  verdict: { score: number | null; label: string };
  cost_per_kg: number | null;
  cost_complete: boolean | null;
  warnings: string[];
}

/**
 * Run `calculateRecipe` and flatten the result into a stable, rounded record —
 * exactly what the engine returned, nothing recomputed, nothing judged.
 */
export function recordEngineOutput(recipe: RecipeInput): EngineRecord {
  const result = calculateRecipe(recipe);
  const verdict = recipeMatchScore(result.scores);

  return {
    engine_version: result.engine_version,
    config_version: result.config_version,
    ingredients: result.items.map((item) => ({
      line: item.id,
      ingredient_id: item.ingredient.id,
      name: item.ingredient.name,
      grams: item.effective_grams,
    })),
    total_batch_g: r4(result.total_batch_g),
    totals: Object.fromEntries(
      Object.entries(result.totals).map(([key, value]) => [key, r4(value)]),
    ),
    percentages: Object.fromEntries(
      Object.entries(result.percentages).map(([key, value]) => [key, r4(value)]),
    ),
    sugar: Object.fromEntries(
      Object.entries(result.sugar).map(([key, value]) => [key, r4(value)]),
    ),
    pod_points: r4(result.pod_points),
    pac_points: r4(result.pac_points),
    npac_points: r4(result.npac_points),
    ice_fraction_percent: r4(result.ice_fraction_percent),
    indicators: result.indicators.map((indicator) => ({
      key: indicator.key,
      value: r4(indicator.value),
      status: indicator.status,
      band: indicator.band
        ? {
            min: indicator.band.min,
            max: indicator.band.max,
            ...(indicator.band.warn_above !== undefined
              ? { warn_above: indicator.band.warn_above }
              : {}),
            ...(indicator.band.warn_below !== undefined
              ? { warn_below: indicator.band.warn_below }
              : {}),
          }
        : null,
      band_status: indicator.band_status ?? null,
      category_fallback: indicator.category_fallback ?? false,
      temperature_fallback: indicator.temperature_fallback ?? false,
    })),
    scores: result.scores
      ? {
          technical: r4(result.scores.technical),
          flavor: r4(result.scores.flavor),
          cost: r4(result.scores.cost),
          overall: r4(result.scores.overall),
        }
      : null,
    verdict: { score: verdict.score, label: verdict.label },
    cost_per_kg: r4(result.costs?.cost_per_kg ?? null),
    cost_complete: result.costs?.complete ?? null,
    warnings: result.warnings.map((warning) => warning.code),
  };
}
