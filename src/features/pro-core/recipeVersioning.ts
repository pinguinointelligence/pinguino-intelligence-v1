/**
 * Saved-recipe + immutable-version domain (PURE, deterministic, no IO/SDK).
 *
 * Editing a recipe creates a NEW version; earlier versions are never mutated. Restoring an
 * old version creates a NEW latest version derived from that snapshot (history never moves
 * backwards, nothing is deleted). Authorization is capability-driven and keyed on the internal
 * user id — never a plan price id, never email.
 */
import type { RecipeInput } from '@/engine';
import type {
  IngredientLineDiff,
  RecipeCapabilities,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionSource,
  SavedRecipe,
} from './recipeContracts';

/** Deep, deterministic clone so a stored snapshot can never be mutated by a later caller. */
function freezeInput(input: RecipeInput): RecipeInput {
  return JSON.parse(JSON.stringify(input)) as RecipeInput;
}

export interface VersionTrace {
  engineVersion: string;
  configVersion: string;
  mapperDatasetVersion?: string | null;
}

export interface CreateVersionInput {
  recipeId: string;
  ownerUserId: string;
  versionNumber: number;
  recipeInput: RecipeInput;
  trace: VersionTrace;
  source: RecipeVersionSource;
  createdBy: string;
  createdAt: string;
  note?: string | null;
  restoredFromVersion?: number | null;
  productProfile?: string | null;
  temperatureC?: number | null;
}

/** Build one immutable version snapshot (a frozen copy of the input + reproducibility trace). */
export function buildRecipeVersion(input: CreateVersionInput, versionId: string): RecipeVersion {
  const snapshot = freezeInput(input.recipeInput);
  return {
    versionId,
    recipeId: input.recipeId,
    ownerUserId: input.ownerUserId,
    versionNumber: input.versionNumber,
    recipeInput: snapshot,
    totalBatchG: snapshot.target_batch_grams,
    productProfile: input.productProfile ?? null,
    temperatureC: input.temperatureC ?? snapshot.target_temperature_c ?? null,
    engineVersion: input.trace.engineVersion,
    configVersion: input.trace.configVersion,
    mapperDatasetVersion: input.trace.mapperDatasetVersion ?? null,
    source: input.source,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    restoredFromVersion: input.restoredFromVersion ?? null,
    note: input.note ?? null,
  };
}

/** The next version number for a recipe (max existing + 1, or 1 when there is none). */
export function nextVersionNumber(versions: readonly RecipeVersion[]): number {
  return versions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
}

/**
 * Restore an earlier version: produce a NEW version (next number) derived from the target's
 * frozen input, tagged `restored`. Never deletes or reorders history. Throws if the target
 * version does not exist for the recipe.
 */
export function restoreVersion(
  versions: readonly RecipeVersion[],
  targetVersionNumber: number,
  by: string,
  createdAt: string,
  versionId: string,
): RecipeVersion {
  const target = versions.find((v) => v.versionNumber === targetVersionNumber);
  if (!target) throw new Error(`version ${targetVersionNumber} not found for this recipe`);
  return buildRecipeVersion(
    {
      recipeId: target.recipeId,
      ownerUserId: target.ownerUserId,
      versionNumber: nextVersionNumber(versions),
      recipeInput: target.recipeInput,
      trace: { engineVersion: target.engineVersion, configVersion: target.configVersion, mapperDatasetVersion: target.mapperDatasetVersion },
      source: 'restored',
      createdBy: by,
      createdAt,
      restoredFromVersion: targetVersionNumber,
      productProfile: target.productProfile,
      temperatureC: target.temperatureC,
    },
    versionId,
  );
}

/* ── comparison ────────────────────────────────────────────────────────────── */

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Compare two immutable versions field-by-field (ingredient lines by stable id). Pure. */
export function compareVersions(a: RecipeVersion, b: RecipeVersion): RecipeVersionComparison {
  const byId = new Map<string, { name: string; grams: number }>();
  for (const it of a.recipeInput.items) byId.set(it.id, { name: it.ingredient.name, grams: it.planned_grams });
  const seen = new Set<string>();
  const lines: IngredientLineDiff[] = [];

  for (const it of b.recipeInput.items) {
    seen.add(it.id);
    const inA = byId.get(it.id);
    const gramsB = it.planned_grams;
    if (!inA) lines.push({ key: it.id, name: it.ingredient.name, gramsA: null, gramsB, change: 'added' });
    else {
      const changed = round3(inA.grams) !== round3(gramsB);
      lines.push({ key: it.id, name: it.ingredient.name, gramsA: inA.grams, gramsB, change: changed ? 'changed' : 'unchanged' });
    }
  }
  for (const it of a.recipeInput.items) {
    if (!seen.has(it.id)) lines.push({ key: it.id, name: it.ingredient.name, gramsA: it.planned_grams, gramsB: null, change: 'removed' });
  }

  return {
    recipeId: a.recipeId,
    versionA: a.versionNumber,
    versionB: b.versionNumber,
    lines,
    totalBatchGA: a.totalBatchG,
    totalBatchGB: b.totalBatchG,
    identical: JSON.stringify(a.recipeInput) === JSON.stringify(b.recipeInput),
  };
}

/* ── capabilities + limits (capability-driven; owner decides the numbers) ────── */

export interface RecipeCapabilityInput {
  canSaveRecipe: boolean;
  canViewRecipeVersions: boolean;
  canViewExactGrams: boolean;
  /**
   * The saved-recipe cap. OWNER DECISION: the canonical code contract does not yet pin
   * Home=1 (it lives only in the account-access draft pack), so this is passed IN by the
   * capability layer — never hardcoded from a price id here. null = unlimited.
   */
  maxSavedRecipes: number | null;
}

export function resolveRecipeCapabilities(input: RecipeCapabilityInput): RecipeCapabilities {
  return {
    canSaveRecipe: input.canSaveRecipe,
    canViewRecipeVersions: input.canViewRecipeVersions,
    canRestoreRecipeVersion: input.canSaveRecipe && input.canViewRecipeVersions,
    maxSavedRecipes: input.maxSavedRecipes,
    canViewExactGrams: input.canViewExactGrams,
  };
}

export interface CreateGate {
  allowed: boolean;
  reason: string;
}

/**
 * May this owner create a NEW recipe aggregate? Versions of an existing recipe never count
 * toward the limit (only distinct recipe aggregates do).
 */
export function canCreateNewRecipe(currentRecipeCount: number, caps: RecipeCapabilities): CreateGate {
  if (!caps.canSaveRecipe) return { allowed: false, reason: 'This plan cannot save recipes.' };
  if (caps.maxSavedRecipes !== null && currentRecipeCount >= caps.maxSavedRecipes) {
    return { allowed: false, reason: `Saved-recipe limit reached (${caps.maxSavedRecipes}). Update or version your existing recipe instead.` };
  }
  return { allowed: true, reason: 'ok' };
}

/** Update the aggregate's latest-version pointer after a new version is saved (never backwards). */
export function withLatestVersion(recipe: SavedRecipe, version: RecipeVersion, at: string): SavedRecipe {
  return {
    ...recipe,
    latestVersionNumber: Math.max(recipe.latestVersionNumber, version.versionNumber),
    productProfile: version.productProfile ?? recipe.productProfile,
    temperatureC: version.temperatureC ?? recipe.temperatureC,
    updatedAt: at,
  };
}
