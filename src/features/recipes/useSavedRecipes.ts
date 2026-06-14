/**
 * TanStack Query hooks over the recipes service (Phase 2A.2). Vendor-free:
 * the UI talks to these hooks; the hooks call `@/services/recipes`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create, listMine, remove, update } from '@/services/recipes';
import type { SaveRecipeInput } from './recipePayload';

const KEY = ['saved-recipes'] as const;

export function useSavedRecipes(enabled: boolean) {
  return useQuery({ queryKey: KEY, queryFn: listMine, enabled });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveRecipeInput) => create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveRecipeInput }) => update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
