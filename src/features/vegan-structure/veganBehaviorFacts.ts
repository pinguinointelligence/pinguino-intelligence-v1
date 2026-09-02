/**
 * VEGAN ENGINE v2 — canonical facts adapter.
 *
 * The derived model is computed from EXISTING canonical product information
 * only. This module is the single seam that turns a runtime `EngineIngredient`
 * or a raw Mapper row into the narrow fact bundle the classifier consumes, so
 * the SAME rules produce the SAME classes in the runtime, in the coverage audit
 * and in tests.
 *
 * No Mapper column is added, no row is retagged, nothing is written back.
 */
import type { EngineIngredient, IngredientCategory } from '@/engine';

/**
 * The complete input of `deriveVeganBehavior`. Everything the classifier is
 * allowed to see — there is no other channel (no network, no LLM, no DB read).
 */
export interface VeganBehaviorFacts {
  /** Stable canonical identity of the product this bundle describes. */
  identityKey: string;
  /** Canonical identity text: names, category, subcategory and engine notes. */
  identityText: string;
  /** Mapped engine category when known (`stabilizer` etc.). */
  engineCategory: IngredientCategory | null;
  /** Per 100 g. `null` means the canonical facts do not state the value. */
  fatPercent: number | null;
  proteinPercent: number | null;
  fiberPercent: number | null;
  /** Only ever a stated β-glucan quantity. Never derived from an oat identity. */
  betaGlucanPercent: number | null;
  /** Mapper stabiliser activity, when present. Diagnostic evidence only. */
  stabilizerActivity: number | null;
}

/**
 * Presence threshold for a component to count as a material structural phase,
 * in percent per 100 g. This is the coverage threshold used by the science
 * audit (§5.2 "fat-bearing" / "protein-bearing"), NOT a physical constant and
 * NOT a formulation band.
 */
export const MATERIAL_COMPONENT_PERCENT = 0.5;

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Runtime adapter — what an Engine ingredient can honestly say about itself. */
export function veganBehaviorFactsFromEngineIngredient(
  ingredient: EngineIngredient,
): VeganBehaviorFacts {
  return {
    identityKey: ingredient.canonical_ingredient_id ?? ingredient.id,
    identityText: `${ingredient.name} ${ingredient.category}`,
    engineCategory: ingredient.category,
    fatPercent: finite(ingredient.composition.fat_percent),
    proteinPercent: finite(ingredient.composition.protein_percent),
    fiberPercent: finite(ingredient.composition.fiber_percent),
    // The Engine ingredient contract carries no β-glucan field and none is
    // invented: Mapper β-glucan coverage is 0 % (audit §5.2).
    betaGlucanPercent: null,
    stabilizerActivity: null,
  };
}

/** Columns of one Mapper row the classifier may read. Read-only, never mutated. */
export interface VeganBehaviorMapperFacts {
  ingredient_id?: string | null;
  ingredient_name_internal?: string | null;
  ingredient_name_display?: string | null;
  ingredient_category?: string | null;
  ingredient_subcategory?: string | null;
  engine_notes?: string | null;
  usage_notes?: string | null;
  fat_percent?: number | null;
  protein_percent?: number | null;
  fiber_percent?: number | null;
  stabilizer_activity?: number | null;
}

/**
 * Mapper adapter — used by the coverage audit and by tests. It sees the richer
 * identity text (subcategory + notes) that never reaches the Engine ingredient,
 * so audit coverage is an UPPER bound on runtime coverage, never a lower one.
 */
export function veganBehaviorFactsFromMapperRow(row: VeganBehaviorMapperFacts): VeganBehaviorFacts {
  return {
    identityKey: row.ingredient_id ?? '',
    identityText: [
      row.ingredient_name_internal,
      row.ingredient_name_display,
      row.ingredient_subcategory,
      row.ingredient_category,
      row.engine_notes,
      row.usage_notes,
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' '),
    engineCategory: null,
    fatPercent: finite(row.fat_percent),
    proteinPercent: finite(row.protein_percent),
    fiberPercent: finite(row.fiber_percent),
    betaGlucanPercent: null,
    stabilizerActivity: finite(row.stabilizer_activity),
  };
}
