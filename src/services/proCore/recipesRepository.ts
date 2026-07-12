/**
 * PINGÜINO PRO CORE — RecipesRepository port (Track A: saved recipes + immutable versions).
 *
 * The async interface every real pro-core recipe surface depends on, so UI code never binds to a
 * concrete adapter. `inMemoryRecipesRepository` adapts the deterministic in-memory reference
 * implementation to this port for DEV/test acceptance; a backend adapter (Supabase against
 * migration 0027) implements the same port for staging. Authorization is the internal user id.
 */
import type { RecipeInput } from '@/engine';
import type { VersionTrace } from '@/features/pro-core/recipeVersioning';
import type {
  RecipeCapabilities,
  RecipeVersion,
  RecipeVersionComparison,
  RecipeVersionSource,
  SavedRecipe,
} from '@/features/pro-core/recipeContracts';
import type { InMemoryRecipes } from './inMemoryRecipes';

export interface CreateRecipeArgs {
  ownerUserId: string;
  title: string;
  notes?: string | null;
  recipeInput: RecipeInput;
  trace: VersionTrace;
  source?: RecipeVersionSource;
  by: string;
  capabilities: RecipeCapabilities;
}

export interface SaveVersionOpts {
  source?: RecipeVersionSource;
  note?: string;
}

export interface RecipesRepository {
  createRecipe(args: CreateRecipeArgs): Promise<{ recipe: SavedRecipe; version: RecipeVersion }>;
  saveNewVersion(recipeId: string, recipeInput: RecipeInput, trace: VersionTrace, by: string, opts?: SaveVersionOpts): Promise<RecipeVersion>;
  renameRecipe(recipeId: string, title: string): Promise<SavedRecipe>;
  archiveRecipe(recipeId: string, archived: boolean): Promise<SavedRecipe>;
  restore(recipeId: string, targetVersionNumber: number, by: string, caps: RecipeCapabilities): Promise<RecipeVersion>;
  compare(recipeId: string, versionA: number, versionB: number): Promise<RecipeVersionComparison>;
  listRecipes(ownerUserId: string, opts?: { includeArchived?: boolean }): Promise<SavedRecipe[]>;
  getRecipe(recipeId: string): Promise<SavedRecipe | null>;
  getVersions(recipeId: string): Promise<readonly RecipeVersion[]>;
  getVersion(recipeId: string, versionNumber: number): Promise<RecipeVersion | null>;
}

/** Adapt the in-memory reference implementation to the async RecipesRepository port. */
export function inMemoryRecipesRepository(svc: InMemoryRecipes): RecipesRepository {
  return {
    createRecipe: async (args) => svc.createRecipe(args),
    saveNewVersion: async (recipeId, recipeInput, trace, by, opts) => svc.saveNewVersion(recipeId, recipeInput, trace, by, opts),
    renameRecipe: async (recipeId, title) => svc.renameRecipe(recipeId, title),
    archiveRecipe: async (recipeId, archived) => svc.archiveRecipe(recipeId, archived),
    restore: async (recipeId, targetVersionNumber, by, caps) => svc.restore(recipeId, targetVersionNumber, by, caps),
    compare: async (recipeId, versionA, versionB) => svc.compare(recipeId, versionA, versionB),
    listRecipes: async (ownerUserId, opts) => svc.listRecipes(ownerUserId, opts),
    getRecipe: async (recipeId) => svc.getRecipe(recipeId),
    getVersions: async (recipeId) => svc.getVersions(recipeId),
    getVersion: async (recipeId, versionNumber) => svc.getVersion(recipeId, versionNumber),
  };
}
