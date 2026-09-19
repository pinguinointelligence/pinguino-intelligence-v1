import { get as getSavedRecipe } from '@/services/recipes';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { hydrateProductionSessionFromRun } from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { productionVersionFingerprint } from '@/features/production-workspace/productionReadinessState';
import { productionSourceForRecipe } from '@/features/production-workspace/useProductionWorkspace';
import {
  openSavedRecipeVersion,
  type SavedRecipeOpenSource,
} from '@/features/recipes/openSavedRecipeVersion';
import { useRecipeStore } from '@/stores/recipeStore';

export type ResumeProductionRunFailure =
  | 'recipe-missing'
  | 'version-mismatch'
  | 'run-missing'
  | 'plan-differs'
  | 'failed';

export type ResumeProductionRunResult =
  | { ok: true; to: '/pro/production' }
  | { ok: false; reason: ResumeProductionRunFailure };

export interface ResumableProductionRun {
  runId: string;
  recipeId: string;
  recipeVersionId: string;
  recipeVersionNumber: number;
}

/**
 * Produkcja → Partie → „Wróć do partii”: reopen EXACTLY this run.
 *
 * No second store and no new workflow — only the existing mechanisms:
 *  1. the saved recipe version of this run opens through the one opening path
 *     (`openSavedRecipeVersion`, the same as Moje receptury);
 *  2. the run is selected for that recipe address with `restoreDurableSession`
 *     — the local durable copy when this device has it, otherwise the server run
 *     hydrated against the opened version (`hydrateProductionSessionFromRun`).
 *     `indexSession` records it as the selected run of that address, so when two
 *     runs of the same version are in progress the one tapped is the one opened;
 *  3. `/pro/production` then activates that address and reconciles with the
 *     server itself (`useProductionWorkspace`).
 *
 * Any refusal is reported. It never falls back to another run or version.
 */
export async function resumeProductionRun({
  run,
  ownerUserId,
  repository,
  loadSavedRecipe = getSavedRecipe,
}: {
  run: ResumableProductionRun;
  ownerUserId: string;
  repository: Pick<ProductionRepository, 'getRun'>;
  loadSavedRecipe?: (recipeId: string) => Promise<SavedRecipeOpenSource | null>;
}): Promise<ResumeProductionRunResult> {
  let row: SavedRecipeOpenSource | null;
  try {
    row = await loadSavedRecipe(run.recipeId);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (!row) return { ok: false, reason: 'recipe-missing' };

  const opened = await openSavedRecipeVersion(row, run.recipeVersionNumber, { persona: 'pro' });
  if (!opened.ok) return { ok: false, reason: 'version-mismatch' };
  const recipe = useRecipeStore.getState();
  if (
    recipe.savedRecipeId !== run.recipeId ||
    recipe.currentVersionId !== run.recipeVersionId ||
    recipe.currentVersionNumber !== run.recipeVersionNumber
  ) {
    return { ok: false, reason: 'version-mismatch' };
  }

  const production = useProductionSessionStore.getState();
  const local = production.sessionsById[run.runId] ?? null;
  try {
    if (
      local &&
      local.status === 'in_progress' &&
      local.ownerUserId === ownerUserId &&
      local.source.recipeId === run.recipeId &&
      local.source.recipeVersionId === run.recipeVersionId
    ) {
      production.restoreDurableSession(local);
      return { ok: true, to: '/pro/production' };
    }
    const remote = await repository.getRun(run.runId, ownerUserId);
    if (!remote || remote.status !== 'in_progress') return { ok: false, reason: 'run-missing' };
    let hydrated;
    try {
      const input = buildRecipeInput(recipe, 'planning');
      const composition = recipeCompositionFromState(recipe);
      hydrated = hydrateProductionSessionFromRun(
        remote,
        /* The recipe was just opened AT the run's own saved version above, so the library
           identity is what resolves here; the fingerprint is the same one that identity is
           being read against. */
        productionSourceForRecipe(recipe, true, productionVersionFingerprint(input, composition)),
        input,
        composition,
      );
    } catch {
      return { ok: false, reason: 'plan-differs' };
    }
    useProductionSessionStore.getState().restoreDurableSession(hydrated);
    return { ok: true, to: '/pro/production' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
