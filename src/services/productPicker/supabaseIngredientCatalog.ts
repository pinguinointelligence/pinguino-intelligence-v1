/**
 * PINGÜINO Product Picker — Mapper Basement INGREDIENT adapter (real schema).
 *
 * Adapts the canonical ingredients service (`mapper_basement`, read-only, RLS) into
 * an `IngredientCatalogPort`. DEPENDENCY-INJECTED: the `listIngredients` reader is
 * passed in (e.g. the real `listActiveIngredients` / `listEngineApprovedIngredients`),
 * so this module binds to no live backend at import time and is fully unit-testable
 * with a mocked client. It NEVER writes the locked reference base.
 *
 * Wired ONLY against a verified, approved environment — never prod / MOOTOORS.
 */
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  ingredientRowToCatalogueEntry,
  type IngredientCatalogPort,
  type IngredientCatalogueEntry,
} from '@/features/product-picker';

export interface SupabaseIngredientDeps {
  /** Reads the canonical `mapper_basement` rows (e.g. `listActiveIngredients`). */
  listIngredients: () => Promise<IngredientRow[]>;
}

/** Build an `IngredientCatalogPort` over the canonical ingredients service. */
export function createSupabaseIngredientCatalog(deps: SupabaseIngredientDeps): IngredientCatalogPort {
  return {
    fetch: async (): Promise<IngredientCatalogueEntry[]> => {
      const rows = await deps.listIngredients();
      return rows.map(ingredientRowToCatalogueEntry);
    },
  };
}
