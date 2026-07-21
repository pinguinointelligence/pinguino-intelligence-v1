/**
 * THE ONE canonical recipe-save handler (S2/workbar). Every save entry point — the top workbar's
 * inline name+save AND the SaveRecipeDialog — calls THIS hook, so there is a single persistence
 * path (pro-core RecipesRepository: atomic create-with-v1 / DB-derived next-version / rename /
 * archive) and a single dirty/version source (recipeStore). Never a second save handler.
 *
 * HONEST failure: any backend error is surfaced (kept in `error`) and NEVER a false "saved" — the
 * caller keeps the draft + name + note and can retry; the visible version is not incremented.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

const TRACE = { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION, mapperDatasetVersion: null };

export type SaveBlockedReason = 'signin' | 'unavailable' | 'plan' | null;

export interface CanonicalRecipeSave {
  /** Why a save cannot proceed right now (null = OK to save). */
  blocked: SaveBlockedReason;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  /** Create a NEW recipe aggregate + immutable v1 with this name (+ optional first-version note). */
  createNew: (title: string, note?: string) => Promise<boolean>;
  /** Append a new immutable version to the currently-linked recipe (+ optional change note). */
  saveVersion: (note?: string) => Promise<boolean>;
  /** Rename the recipe AGGREGATE (recipe-level metadata) — never creates a content version. */
  rename: (title: string) => Promise<boolean>;
  /** Archive the currently-linked recipe. */
  archive: () => Promise<boolean>;
}

export function useCanonicalRecipeSave(): CanonicalRecipeSave {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const queryClient = useQueryClient();
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, unavailable, isLocalDev } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const authed = useAuthStore((s) => s.status) === 'authed';
  const ownerId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  const savedRecipeId = useRecipeStore((s) => s.savedRecipeId);
  const savedRecipeName = useRecipeStore((s) => s.savedRecipeName);
  const markSaved = useRecipeStore((s) => s.markSaved);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked: SaveBlockedReason = !authed
    ? 'signin'
    : unavailable || repository === null
      ? 'unavailable'
      : !caps.canSaveRecipe
        ? 'plan'
        : null;

  const invalidate = async (recipeId: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pro-core-recipes', ownerId] }),
      queryClient.invalidateQueries({ queryKey: ['saved-recipes'] }),
      recipeId
        ? queryClient.invalidateQueries({ queryKey: ['pro-core-recipe-versions', recipeId] })
        : Promise.resolve(),
    ]);
  };

  const run = async (fn: () => Promise<string | null>): Promise<boolean> => {
    if (blocked !== null || !repository) return false;
    setBusy(true);
    setError(null);
    try {
      const linkedId = await fn();
      await invalidate(linkedId);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nie udało się zapisać.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    blocked,
    busy,
    error,
    clearError: () => setError(null),
    createNew: (title, note) =>
      run(async () => {
        const { recipe, version } = await repository!.createRecipe({
          ownerUserId: ownerId,
          title: title.trim(),
          notes: note?.trim() || null,
          recipeInput: buildRecipeInput(useRecipeStore.getState()),
          trace: TRACE,
          source: 'manual',
          by: ownerId,
          capabilities: caps,
        });
        markSaved(recipe.recipeId, recipe.title, version.versionNumber, version.createdAt);
        return recipe.recipeId;
      }),
    saveVersion: (note) =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        const version = await repository!.saveNewVersion(
          savedRecipeId,
          buildRecipeInput(useRecipeStore.getState()),
          TRACE,
          ownerId,
          { note: note?.trim() || undefined },
        );
        markSaved(savedRecipeId, savedRecipeName ?? '', version.versionNumber, version.createdAt);
        return savedRecipeId;
      }),
    rename: (title) =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        const recipe = await repository!.renameRecipe(savedRecipeId, title.trim());
        // Rename is recipe-level metadata ONLY — update the name; never touch dirty/version
        // (unsaved content changes must survive a rename, and a rename is not a content version).
        useRecipeStore.setState({ savedRecipeName: recipe.title });
        return savedRecipeId;
      }),
    archive: () =>
      run(async () => {
        if (!savedRecipeId) throw new Error('Brak powiązanej receptury.');
        await repository!.archiveRecipe(savedRecipeId, true);
        return savedRecipeId;
      }),
  };
}
