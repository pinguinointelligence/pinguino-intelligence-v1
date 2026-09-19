/**
 * „Kontynuuj partię" — open a batch from the RUN, not from the editor.
 *
 * Produkcja v3, Etap 2. Continuing a batch and opening its recipe are two different
 * things, and only the second one is allowed to touch the workbench:
 *
 *   „Kontynuuj partię"        → this module. The run and its immutable recipe VERSION
 *                               are read straight from the repositories. The recipe the
 *                               user has open, their unsaved draft, their machine, their
 *                               profile and their batch target are never written.
 *   „Otwórz recepturę partii" → `resumeProductionRun`, unchanged: it DOES replace the
 *                               editor context, so it keeps the unsaved-changes gate.
 *
 * Nothing here is a second production system. The batch is the canonical session in
 * `productionSessionStore`, hydrated by the same `hydrateProductionSessionFromRun` the
 * workbench uses, indexed under the run's OWN address so the workspace reconciles exactly
 * this run with the server. No gram is recalculated: the planned input is the version's
 * frozen snapshot, which is what the run was planned from in the first place.
 */
import { get as getSavedRecipe } from '@/services/recipes';
import { productionMachineGuide } from '@/features/education';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { readRecipeProfileMetadata } from '@/features/pro-workbench/recipeProfilePersistence';
import {
  readRecipeCompositionMetadata,
  type RecipeCompositionMetadata,
} from '@/features/recipe-composition/recipeCompositionPersistence';
import { hydrateProductionSessionFromRun } from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { DurableRunContext } from '@/features/production-workspace/useProductionWorkspace';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import type { ResumableProductionRun } from './resumeProductionRun';

/**
 * A version saved before the product layer existed carries no composition. The batch's
 * order is then simply the version's own line order — no invention, no re-ordering.
 */
const compositionForLines = (lineIds: readonly string[]): RecipeCompositionMetadata => ({
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: [...lineIds],
  toppings: [],
  migrationAmbiguities: [],
});

export type OpenDurableRunFailure =
  | 'recipe-missing'
  | 'version-mismatch'
  | 'run-missing'
  | 'plan-differs'
  | 'failed';

export type OpenDurableRunResult =
  | { ok: true; context: DurableRunContext }
  | { ok: false; reason: OpenDurableRunFailure };

export async function openDurableRun({
  run,
  ownerUserId,
  repository,
  loadSavedRecipe = getSavedRecipe,
}: {
  run: ResumableProductionRun;
  ownerUserId: string;
  repository: Pick<ProductionRepository, 'getRun'>;
  loadSavedRecipe?: (recipeId: string) => Promise<{ name: string } | null>;
}): Promise<OpenDurableRunResult> {
  try {
    const recipesRepository = resolveRecipesRepository().repository;
    if (!recipesRepository) return { ok: false, reason: 'failed' };

    const row = await loadSavedRecipe(run.recipeId);
    if (!row) return { ok: false, reason: 'recipe-missing' };

    // The EXACT version this run was planned from. A different one would show different
    // grams than the batch is being weighed against, so it is refused, never substituted.
    const version = await recipesRepository.getVersion(run.recipeId, run.recipeVersionNumber);
    if (!version || version.versionId !== run.recipeVersionId) {
      return { ok: false, reason: 'version-mismatch' };
    }

    const plannedInput = version.recipeInput;
    // The version's own composition, normalised the one way the store normalises it.
    const plannedComposition =
      readRecipeCompositionMetadata(
        version.productComposition,
        plannedInput.items.map((item) => item.id),
        plannedInput.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
      ) ?? compositionForLines(plannedInput.items.map((item) => item.id));
    const source = {
      recipeId: run.recipeId,
      recipeVersionId: run.recipeVersionId,
      recipeVersionNumber: run.recipeVersionNumber,
      recipeName: row.name,
    };

    const profile = readRecipeProfileMetadata(plannedInput);
    const store = useProductionSessionStore.getState();
    const local = store.sessionsById[run.runId] ?? null;
    const reusableLocal =
      local &&
      local.status === 'in_progress' &&
      local.ownerUserId === ownerUserId &&
      local.source.recipeId === run.recipeId &&
      local.source.recipeVersionId === run.recipeVersionId
        ? local
        : null;

    if (!reusableLocal) {
      const remote = await repository.getRun(run.runId, ownerUserId);
      if (!remote || remote.status !== 'in_progress') return { ok: false, reason: 'run-missing' };
      let hydrated;
      try {
        hydrated = hydrateProductionSessionFromRun(remote, source, plannedInput, plannedComposition);
      } catch {
        return { ok: false, reason: 'plan-differs' };
      }
      // Indexed under the run's own address, so the workspace activates THIS run — even
      // when two runs of one version are open, and even after a refresh.
      store.restoreDurableSession(hydrated);
    } else {
      store.restoreDurableSession(reusableLocal);
    }

    return {
      ok: true,
      context: {
        runId: run.runId,
        source,
        plannedInput,
        plannedComposition,
        // The machine this version was saved with — never whatever the editor holds now.
        machineGuide: productionMachineGuide({
          machineKind: profile?.machineKind ?? null,
          machineId: profile?.machineId ?? null,
          machineTechnology: profile?.machineTechnology ?? null,
        }),
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
