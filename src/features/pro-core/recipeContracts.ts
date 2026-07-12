/**
 * PINGÜINO PRO CORE — saved-recipe + immutable-version contracts (types only, no IO/SDK).
 *
 * REUSES the existing recipe source of truth: a version snapshot stores the engine
 * `RecipeInput` (the same source of truth as `saved_recipes.recipe_input`, migration 0001)
 * plus the engine/config trace needed to reproduce the result. It never stores authorization
 * by email; the owner is the internal user id. Versions are IMMUTABLE — editing creates a new
 * version; restoring an old version creates a NEW latest version (history never moves back).
 */
import type { RecipeInput } from '@/engine';

/** Where a version came from (its provenance in the edit history). */
export type RecipeVersionSource =
  | 'manual'
  | 'starter_draft'
  | 'optimizer_correction'
  | 'restored'
  | 'imported';

/** An IMMUTABLE snapshot of a recipe at one point in time. Never mutated after creation. */
export interface RecipeVersion {
  versionId: string;
  recipeId: string;
  ownerUserId: string;
  /** 1-based, strictly increasing per recipe. */
  versionNumber: number;
  /** The engine source of truth — results are recomputed from this, never stored stale. */
  recipeInput: RecipeInput;
  /** Total batch weight (g) captured for quick display + guards (recomputable from input). */
  totalBatchG: number;
  productProfile: string | null;
  temperatureC: number | null;
  /** Reproducibility trace (from the engine result at capture time). */
  engineVersion: string;
  configVersion: string;
  mapperDatasetVersion: string | null;
  source: RecipeVersionSource;
  createdBy: string;
  createdAt: string;
  /** When `source === 'restored'`, the version this snapshot was derived from. */
  restoredFromVersion: number | null;
  note: string | null;
}

/** The mutable saved-recipe aggregate. Its versions carry the immutable history. */
export interface SavedRecipe {
  recipeId: string;
  ownerUserId: string;
  /** Reserved for the second-stage Workspace sharing model; null for personal recipes. */
  workspaceId: string | null;
  title: string;
  notes: string | null;
  productProfile: string | null;
  temperatureC: number | null;
  /** The current latest version number (points into the immutable version history). */
  latestVersionNumber: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/* ── version comparison ────────────────────────────────────────────────────── */

export interface IngredientLineDiff {
  key: string;
  name: string;
  /** grams in version A (null = absent in A). */
  gramsA: number | null;
  /** grams in version B (null = absent in B). */
  gramsB: number | null;
  change: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface RecipeVersionComparison {
  recipeId: string;
  versionA: number;
  versionB: number;
  lines: readonly IngredientLineDiff[];
  totalBatchGA: number;
  totalBatchGB: number;
  /** True when the two snapshots are structurally identical (byte-for-byte input equality). */
  identical: boolean;
}

/* ── capabilities (read from the existing entitlement layer — never a price id) ── */

export interface RecipeCapabilities {
  canSaveRecipe: boolean;
  canViewRecipeVersions: boolean;
  canRestoreRecipeVersion: boolean;
  /** null = unlimited. Home's canonical limit is 1 recipe aggregate (versions don't count). */
  maxSavedRecipes: number | null;
  /** Exact grams — Demo never gets a save-capable exact payload. */
  canViewExactGrams: boolean;
}
