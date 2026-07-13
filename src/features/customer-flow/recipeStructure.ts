/**
 * Customer recipe STRUCTURE contract (Agent B) — pure and deterministic.
 *
 * Builds the customer-visible recipe SKELETON: the base ingredient lines for the
 * chosen product type PLUS one explicit line for EVERY active flavor chip. No
 * flavor is ever dropped — a recipe asked as "chocolate with whisky and
 * raspberry" yields a chocolate base line-set and three flavor lines, not one.
 *
 * HONESTY RULES:
 *  - a flavor line is RESOLVED only when a SAFE, deterministic dose already
 *    exists in the repo's flavor-mapping contracts. There is NO such safe
 *    flavor→dose map in this layer yet (see `SAFE_FLAVOR_DOSES`, intentionally
 *    empty), so flavor lines resolve to an explicit UNRESOLVED requirement —
 *    never a fabricated gram amount;
 *  - an unresolved line carries a `resolution` of `needs_dose` (the flavor is a
 *    recognized concept but has no safe dose yet) or `needs_ingredient` (the
 *    flavor is not a recognized concept, so a concrete ingredient must be chosen
 *    first). Either way `grams` stays null — no number is invented;
 *  - base-line grams are ILLUSTRATIVE preview values (the engine computes the
 *    real ones downstream); they are gated by the persona gram-visibility in the
 *    view layer, so a Demo persona sees none of them.
 *
 * No engine math, no IO, no grams for flavors — every function is pure.
 */
import type { CustomerFlowState } from './customerFlow';
import { activeFlavorChips, isRecognizedFlavorTag, resolveProductType } from './customerFlow';
import type { CustomerProductType } from './types';

/** How resolved a recipe line is. Only `resolved` may carry grams. */
export type LineResolution = 'resolved' | 'needs_ingredient' | 'needs_dose';

export type RecipeLineRole = 'base' | 'flavor';

export interface CustomerRecipeStructureLine {
  /** Stable line id (base ingredient id, or `flavor:<tag>` for a flavor line). */
  id: string;
  role: RecipeLineRole;
  /** The flavor tag this line realizes — only present for flavor lines. */
  flavorTag?: string;
  /** Illustrative grams for base lines; NULL for every unresolved flavor line. */
  grams: number | null;
  resolution: LineResolution;
}

export interface CustomerRecipeStructure {
  productType: CustomerProductType;
  lines: CustomerRecipeStructureLine[];
  /** Count of flavor lines that are not resolved to a safe dose. */
  unresolvedFlavorCount: number;
  /** True only when every flavor line resolved to a safe dose. */
  fullyResolved: boolean;
}

export interface RecipeStructureInput {
  productType: CustomerProductType;
  flavorTags: readonly string[];
}

/**
 * SAFE flavor→dose map. INTENTIONALLY EMPTY: no owner-approved, deterministic
 * safe dose exists for these flavors yet, so nothing is resolved here. When a
 * verified flavor-dose contract is added, entries placed here will make the
 * matching flavor lines `resolved` and carry their approved grams automatically.
 */
const SAFE_FLAVOR_DOSES: Readonly<Record<string, number>> = {};

/** Base ingredient line-sets per product type. Grams are illustrative preview. */
const BASE_LINES: Readonly<Record<'gelato' | 'sorbet' | 'vegan', readonly CustomerRecipeStructureLine[]>> = {
  gelato: [
    { id: 'milk', role: 'base', grams: 620, resolution: 'resolved' },
    { id: 'cream', role: 'base', grams: 110, resolution: 'resolved' },
    { id: 'sugar', role: 'base', grams: 150, resolution: 'resolved' },
    { id: 'dextrose', role: 'base', grams: 35, resolution: 'resolved' },
    { id: 'stabilizer', role: 'base', grams: 5, resolution: 'resolved' },
  ],
  sorbet: [
    { id: 'water', role: 'base', grams: 560, resolution: 'resolved' },
    { id: 'sugar', role: 'base', grams: 170, resolution: 'resolved' },
    { id: 'dextrose', role: 'base', grams: 45, resolution: 'resolved' },
    { id: 'stabilizer', role: 'base', grams: 6, resolution: 'resolved' },
  ],
  vegan: [
    { id: 'plant-milk', role: 'base', grams: 640, resolution: 'resolved' },
    { id: 'coconut-oil', role: 'base', grams: 60, resolution: 'resolved' },
    { id: 'sugar', role: 'base', grams: 150, resolution: 'resolved' },
    { id: 'dextrose', role: 'base', grams: 35, resolution: 'resolved' },
    { id: 'stabilizer', role: 'base', grams: 5, resolution: 'resolved' },
  ],
};

/** Pick the base line-set for a customer product type (protein has no base). */
function baseLinesFor(productType: CustomerProductType): readonly CustomerRecipeStructureLine[] {
  if (productType === 'sorbet') return BASE_LINES.sorbet;
  if (productType === 'vegan') return BASE_LINES.vegan;
  // 'gelato' (incl. internal chocolate routing) and the protein fallback share
  // the milk base skeleton; protein never reaches the result phase in practice.
  return BASE_LINES.gelato;
}

/** Build one explicit flavor line — resolved only with a real safe dose. */
function flavorLine(tag: string): CustomerRecipeStructureLine {
  const safeDose = SAFE_FLAVOR_DOSES[tag];
  if (typeof safeDose === 'number' && safeDose > 0) {
    return { id: `flavor:${tag}`, role: 'flavor', flavorTag: tag, grams: safeDose, resolution: 'resolved' };
  }
  return {
    id: `flavor:${tag}`,
    role: 'flavor',
    flavorTag: tag,
    grams: null,
    resolution: isRecognizedFlavorTag(tag) ? 'needs_dose' : 'needs_ingredient',
  };
}

/**
 * Build the recipe structure from a product type + the FULL flavor-tag list.
 * Every flavor tag becomes its own line; none is silently merged or dropped.
 */
export function buildRecipeStructure(input: RecipeStructureInput): CustomerRecipeStructure {
  const base = baseLinesFor(input.productType).map((l) => ({ ...l }));
  const flavors = input.flavorTags.map(flavorLine);
  const lines = [...base, ...flavors];
  const unresolvedFlavorCount = flavors.filter((l) => l.resolution !== 'resolved').length;
  return {
    productType: input.productType,
    lines,
    unresolvedFlavorCount,
    fullyResolved: unresolvedFlavorCount === 0,
  };
}

/**
 * Build the recipe structure straight from flow state: the resolved visible
 * product type + every active flavor chip. Protein (unsupported) falls back to
 * the gelato skeleton but never reaches the result phase.
 */
export function buildCustomerRecipeStructure(state: CustomerFlowState): CustomerRecipeStructure {
  const type = resolveProductType(state);
  const productType: CustomerProductType = type.userFacingType ?? 'gelato';
  return buildRecipeStructure({ productType, flavorTags: activeFlavorChips(state) });
}
