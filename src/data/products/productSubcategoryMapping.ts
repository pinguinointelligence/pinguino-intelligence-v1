/**
 * Pure deterministic `product_subcategory` -> engine `IngredientCategory` mapping
 * (product enrichment slice). It lets enrichment fill the NULL `product_category` on
 * catalog products (e.g. Mercadona) from the richer free-text `product_subcategory`,
 * so the Mapper's category-aware levels can engage.
 *
 *   - PURE: no DB access, no database client, no services, no engine runtime, no IO. A
 *     static lookup keyed by a normalized subcategory string. Deterministic.
 *   - HONEST: an unknown, blank, or genuinely ambiguous subcategory returns
 *     `category: null` (confidence `manual`) — it is NEVER guessed into a bucket.
 *   - ENGINE-VALID: every emitted category is an engine-native `IngredientCategory`
 *     that `mapDatasetCategory` resolves EXACTLY (so it can actually pool against the
 *     reference base). This is pinned by productSubcategoryMapping.test.ts.
 *
 * It performs NO write: callers decide whether/where to persist `category` (a gated
 * one-time backfill of `public.products.product_category`, or import-time enrichment).
 */
import type { IngredientCategory } from '@/engine';

export type SubcategoryConfidence = 'high' | 'medium' | 'low' | 'manual';

export interface ProductSubcategoryMatch {
  /** Engine category, or null when unknown / ambiguous (never guessed). */
  category: IngredientCategory | null;
  confidence: SubcategoryConfidence;
  reason: string;
}

/** trim -> lowercase -> collapse any run of non-alphanumerics to a single space -> trim.
 * Subcategories are ASCII English labels (e.g. "Dark Chocolate 85%+", "Cream 35%"). */
export function normalizeSubcategory(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const D = 'dairy product -> dairy';
const C = 'chocolate / cocoa -> chocolate_cocoa';
const N = 'nut / nut paste -> nut_paste';
const F = 'fruit -> fruit';
const S = 'sweetener / sugar -> sugar';

/** Known subcategory (normalized) -> match. Manual/null entries are listed explicitly
 * so they read as DELIBERATELY unmapped (distinct from an unrecognized label). */
const RULES: Record<string, ProductSubcategoryMatch> = {
  // ── dairy (high) ───────────────────────────────────────────────────────────
  'milk': { category: 'dairy', confidence: 'high', reason: D },
  'lactose free milk': { category: 'dairy', confidence: 'high', reason: D },
  'high protein milk': { category: 'dairy', confidence: 'high', reason: D },
  'milk powder': { category: 'dairy', confidence: 'high', reason: D },
  'cream 18': { category: 'dairy', confidence: 'high', reason: D },
  'cream 35': { category: 'dairy', confidence: 'high', reason: D },
  'light cream': { category: 'dairy', confidence: 'high', reason: D },
  'greek yogurt': { category: 'dairy', confidence: 'high', reason: D },
  'greek yogurt light': { category: 'dairy', confidence: 'high', reason: D },
  'natural yogurt': { category: 'dairy', confidence: 'high', reason: D },
  'greek yogurt stracciatella': { category: 'dairy', confidence: 'high', reason: D },
  'lactose free yogurt': { category: 'dairy', confidence: 'high', reason: D },
  'kefir': { category: 'dairy', confidence: 'high', reason: D },
  'kefir drinkable': { category: 'dairy', confidence: 'high', reason: D },
  'mascarpone': { category: 'dairy', confidence: 'high', reason: D },

  // ── chocolate / cocoa (high) ────────────────────────────────────────────────
  'dark chocolate 85': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'dark chocolate 70 75': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'milk chocolate': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'white chocolate': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'sugar free chocolate': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'cocoa powder pure': { category: 'chocolate_cocoa', confidence: 'high', reason: C },
  'cocoa powder sweetened': { category: 'chocolate_cocoa', confidence: 'high', reason: C },

  // ── nuts / nut pastes (high) ────────────────────────────────────────────────
  'almond ground': { category: 'nut_paste', confidence: 'high', reason: N },
  'almonds peeled': { category: 'nut_paste', confidence: 'high', reason: N },
  'almonds whole': { category: 'nut_paste', confidence: 'high', reason: N },
  'pistachios': { category: 'nut_paste', confidence: 'high', reason: N },
  'pistachio cream': { category: 'nut_paste', confidence: 'high', reason: N },
  'peanut butter 100 crunchy': { category: 'nut_paste', confidence: 'high', reason: N },
  'peanut butter 100 smooth': { category: 'nut_paste', confidence: 'high', reason: N },

  // ── fruit (high) ────────────────────────────────────────────────────────────
  'blueberries frozen': { category: 'fruit', confidence: 'high', reason: F },
  'strawberries frozen': { category: 'fruit', confidence: 'high', reason: F },
  'strawberry banana frozen': { category: 'fruit', confidence: 'high', reason: F },
  'forest fruits mix': { category: 'fruit', confidence: 'high', reason: F },
  'tropical mix frozen': { category: 'fruit', confidence: 'high', reason: F },

  // ── sweeteners / sugar (high) ───────────────────────────────────────────────
  'sweetener erythritol': { category: 'sugar', confidence: 'high', reason: S },
  'sweetener saccharin': { category: 'sugar', confidence: 'high', reason: S },
  'sweetener stevia': { category: 'sugar', confidence: 'high', reason: S },
  'sweetener stevia granular': { category: 'sugar', confidence: 'high', reason: S },
  'vanilla sugar': { category: 'sugar', confidence: 'high', reason: S },

  // ── medium confidence (deterministic; resolved by owner category decisions) ──
  // flavor: aroma + coffee act as flavoring agents
  'vanilla aroma': { category: 'flavor', confidence: 'medium', reason: 'aroma / flavoring -> flavor' },
  'coffee beans natural': { category: 'flavor', confidence: 'medium', reason: 'coffee is a flavoring agent -> flavor' },
  'coffee beans strong': { category: 'flavor', confidence: 'medium', reason: 'coffee is a flavoring agent -> flavor' },
  'ground coffee natural': { category: 'flavor', confidence: 'medium', reason: 'coffee is a flavoring agent -> flavor' },
  'ground coffee espresso': { category: 'flavor', confidence: 'medium', reason: 'coffee is a flavoring agent -> flavor' },
  'ground coffee mix': { category: 'flavor', confidence: 'medium', reason: 'coffee is a flavoring agent -> flavor' },
  // fruit: fruit jam base
  'sugar free jam': { category: 'fruit', confidence: 'medium', reason: 'fruit jam -> fruit (also pectin/sweetener)' },
  // dairy: protein-fortified dairy products
  'protein pudding': { category: 'dairy', confidence: 'medium', reason: 'protein-fortified dairy dessert -> dairy' },
  'protein yogurt w fruit': { category: 'dairy', confidence: 'medium', reason: 'protein-fortified dairy yogurt -> dairy' },
  'protein drink': { category: 'dairy', confidence: 'medium', reason: 'protein-fortified milk drink -> dairy' },
  'protein drink choco': { category: 'dairy', confidence: 'medium', reason: 'protein-fortified milk drink -> dairy' },
  'protein drink mixed fruit': { category: 'dairy', confidence: 'medium', reason: 'protein-fortified milk drink -> dairy' },
  // nut_paste: hazelnut / peanut spreads & nut-derived protein powder
  'hazelnut cream w milk': { category: 'nut_paste', confidence: 'medium', reason: 'hazelnut milk spread -> nut_paste' },
  'peanut protein powder': { category: 'nut_paste', confidence: 'medium', reason: 'peanut-derived -> nut_paste' },
  // chocolate_cocoa: cocoa-forward hazelnut spread (Nutella-style)
  'hazelnut cocoa cream': { category: 'chocolate_cocoa', confidence: 'medium', reason: 'cocoa-forward hazelnut spread -> chocolate_cocoa' },
};

/**
 * Map a product's free-text `product_subcategory` to an engine category. Deterministic.
 * Blank/missing, genuinely ambiguous, or unrecognized inputs return `category: null`
 * (confidence `manual`) — never a guess.
 */
export function mapProductSubcategory(subcategory: string | null | undefined): ProductSubcategoryMatch {
  const key = normalizeSubcategory(subcategory);
  if (key === '') {
    return { category: null, confidence: 'manual', reason: 'blank or missing subcategory — manual review' };
  }
  const rule = RULES[key];
  if (rule) return { ...rule };
  return {
    category: null,
    confidence: 'manual',
    reason: `unrecognized subcategory "${(subcategory ?? '').trim()}" — manual review`,
  };
}
