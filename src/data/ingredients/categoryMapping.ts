/**
 * Explicit mapping from the PI Base v0.94 dataset's category vocabulary (18
 * categories) to the engine's smaller `IngredientCategory` union.
 *
 * The dataset is richer than the engine taxonomy, so every dataset category is
 * mapped on purpose. Mappings are either `exact` (clean 1:1) or documented
 * approximations/fallbacks (`exact: false` + a reason). Nothing is silent: an
 * unrecognized category resolves to `other` and is flagged for review.
 *
 * Category only drives classification/flags — composition drives all engine
 * numbers — so a documented approximation never corrupts recipe math.
 */
import type { IngredientCategory } from '@/engine';

export interface CategoryMatch {
  category: IngredientCategory;
  /** false = documented approximation or fallback that a human should review. */
  exact: boolean;
  reason: string;
}

const exact = (category: IngredientCategory, reason: string): CategoryMatch => ({
  category,
  exact: true,
  reason,
});
const approx = (category: IngredientCategory, reason: string): CategoryMatch => ({
  category,
  exact: false,
  reason,
});

/** The 18 categories present in the confirmed v0.94 dataset. */
export const DATASET_CATEGORIES_V0_94 = [
  'dairy', 'fruit', 'stabilizer', 'alcohol', 'fat', 'chocolate', 'nut', 'base_mix',
  'flavor_paste', 'vegetable', 'sweetener', 'coconut', 'bakery', 'specialty',
  'coffee_tea', 'protein', 'emulsifier', 'fiber',
] as const;

export const CATEGORY_MAPPING: Record<string, CategoryMatch> = {
  // ── exact (clean 1:1) ──────────────────────────────────────────────────────
  dairy: exact('dairy', 'direct engine category'),
  fruit: exact('fruit', 'direct engine category'),
  stabilizer: exact('stabilizer', 'direct engine category'),
  alcohol: exact('alcohol', 'direct engine category'),
  fat: exact('fat', 'direct engine category'),
  chocolate: exact('chocolate_cocoa', 'engine name for chocolate/cocoa'),
  nut: exact('nut_paste', 'engine name for nut pastes'),
  sweetener: exact('sugar', 'sweeteners live in the engine sugar bucket'),
  flavor_paste: exact('flavor', 'flavor pastes are flavor agents'),

  // ── engine-native passthroughs (robustness if canonical labels appear) ─────
  water: exact('water', 'engine-native category'),
  egg: exact('egg', 'engine-native category'),
  sugar: exact('sugar', 'engine-native category'),
  flavor: exact('flavor', 'engine-native category'),
  other: exact('other', 'engine-native category'),
  chocolate_cocoa: exact('chocolate_cocoa', 'engine-native category'),
  nut_paste: exact('nut_paste', 'engine-native category'),

  // ── documented approximations → a non-"other" engine bucket ────────────────
  coffee_tea: approx('flavor', 'coffee/tea act as flavoring agents; nearest engine bucket'),
  emulsifier: approx('stabilizer', 'emulsifiers functionally support structure/stabilization'),
  fiber: approx('stabilizer', 'dietary fibers (e.g. inulin) act as bulking/stabilizing agents'),

  // ── documented fallbacks → "other" (heterogeneous; no clean engine bucket) ─
  coconut: approx('other', 'heterogeneous coconut products; avoid silently triggering fat/fruit behavior'),
  vegetable: approx('other', 'heterogeneous; avoid silently triggering fruit/sorbet-hero behavior'),
  protein: approx('other', 'plant/dairy protein isolates have no single engine category'),
  base_mix: approx('other', 'composite base mixes are not a single ingredient class'),
  bakery: approx('other', 'biscuit/cake inclusions vary; no engine category'),
  specialty: approx('other', 'heterogeneous catch-all'),
};

/**
 * Resolve a dataset category to an engine category. Normalizes case/whitespace.
 * An unknown category is never silent — it falls back to `other` with a reason.
 */
export function mapDatasetCategory(raw: string): CategoryMatch {
  const key = raw.trim().toLowerCase();
  const match = CATEGORY_MAPPING[key];
  if (match) return match;
  return { category: 'other', exact: false, reason: `unknown dataset category "${raw}" — needs review` };
}
