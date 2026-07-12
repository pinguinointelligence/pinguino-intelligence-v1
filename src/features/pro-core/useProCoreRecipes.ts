/**
 * TanStack Query hooks over the pro-core RecipesRepository port (Track A: immutable versions).
 * Vendor-free: the UI talks to these hooks; the hooks call a repository resolved by the selector.
 * Queries stay disabled until a repository is available, so an unconfigured build never fetches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecipeInput } from '@/engine';
import type { VersionTrace } from '@/features/pro-core/recipeVersioning';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import type { CreateRecipeArgs, RecipesRepository } from '@/services/proCore/recipesRepository';

const LIST_KEY = (ownerUserId: string) => ['pro-core-recipes', ownerUserId] as const;
const VERSIONS_KEY = (recipeId: string) => ['pro-core-recipe-versions', recipeId] as const;

export function useProCoreRecipes(repo: RecipesRepository | null, ownerUserId: string, enabled: boolean) {
  return useQuery({
    queryKey: LIST_KEY(ownerUserId),
    queryFn: () => repo!.listRecipes(ownerUserId, { includeArchived: true }),
    enabled: enabled && Boolean(repo),
  });
}

export function useProCoreVersions(repo: RecipesRepository | null, recipeId: string | null) {
  return useQuery({
    queryKey: VERSIONS_KEY(recipeId ?? ''),
    queryFn: () => repo!.getVersions(recipeId!),
    enabled: Boolean(repo) && Boolean(recipeId),
  });
}

export function useCreateProCoreRecipe(repo: RecipesRepository | null, ownerUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateRecipeArgs) => repo!.createRecipe(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY(ownerUserId) }),
  });
}

export interface SaveVersionArgs {
  recipeId: string;
  recipeInput: RecipeInput;
  trace: VersionTrace;
  by: string;
}

export function useSaveProCoreVersion(repo: RecipesRepository | null, ownerUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SaveVersionArgs) => repo!.saveNewVersion(args.recipeId, args.recipeInput, args.trace, args.by),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY(ownerUserId) });
      queryClient.invalidateQueries({ queryKey: VERSIONS_KEY(args.recipeId) });
    },
  });
}

export interface RestoreVersionArgs {
  recipeId: string;
  targetVersionNumber: number;
  by: string;
  caps: RecipeCapabilities;
}

export function useRestoreProCoreVersion(repo: RecipesRepository | null, ownerUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: RestoreVersionArgs) => repo!.restore(args.recipeId, args.targetVersionNumber, args.by, args.caps),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY(ownerUserId) });
      queryClient.invalidateQueries({ queryKey: VERSIONS_KEY(args.recipeId) });
    },
  });
}
