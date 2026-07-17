/**
 * §19/§20.1 Save — REUSES the pro-core save→version path: the same
 * `RecipesRepository` port (createRecipe / saveNewVersion) behind
 * `resolveRecipesRepository`, the same capability projection
 * (`recipeCapabilitiesFor(persona)`), the same immutable-version semantics.
 * NO parallel history store: the session Undo history lives in the studio
 * store; durable revisions live here, in pro-core versions (v1, v2, …).
 *
 * Honest availability: signed-out, plan-blocked and unconfigured-backend
 * states each render a plain Polish note instead of a dead button; the DEV
 * in-memory repository is visibly marked non-durable.
 */
import { useState } from 'react';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import type { RecipeVersionSource } from '@/features/pro-core/recipeContracts';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { constraintStudioCopy as copy } from '../constraintStudioCopy';
import { useConstraintStudioStore } from '../constraintStudioStore';
import { resolveSaveGateView } from '../saveGate';

export function SaveVersionControl() {
  const persona = useProCorePersona();
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const savedRecipeName = useRecipeStore((state) => state.savedRecipeName);
  const proCoreRecipeId = useConstraintStudioStore((state) => state.proCoreRecipeId);
  const lastSavedVersion = useConstraintStudioStore((state) => state.lastSavedVersion);
  const markProCoreRecipe = useConstraintStudioStore((state) => state.markProCoreRecipe);
  const history = useConstraintStudioStore((state) => state.history);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoState = resolveRecipesRepository();
  const capabilities = recipeCapabilitiesFor(persona);
  const gate = resolveSaveGateView({
    authed: authStatus === 'authed',
    canSaveRecipe: capabilities.canSaveRecipe,
    repositoryAvailable: !repoState.unavailable && repoState.repository !== null,
    isLocalDev: repoState.isLocalDev,
  });

  const save = async () => {
    if (gate.kind !== 'ready' || repoState.repository === null) return;
    setBusy(true);
    setError(null);
    try {
      const recipeInput = buildRecipeInput(useRecipeStore.getState());
      const result = calculateRecipe(recipeInput);
      const trace = {
        engineVersion: result.engine_version,
        configVersion: result.config_version,
        mapperDatasetVersion: null,
      };
      const by = user?.id ?? 'local-dev';
      const lastChange = history[history.length - 1];
      const source: RecipeVersionSource =
        lastChange?.kind === 'optimize' || lastChange?.kind === 'suggested_fix'
          ? 'optimizer_correction'
          : 'manual';

      if (proCoreRecipeId === null) {
        const created = await repoState.repository.createRecipe({
          ownerUserId: by,
          title: savedRecipeName ?? copy.save.defaultTitle,
          recipeInput,
          trace,
          source,
          by,
          capabilities,
        });
        markProCoreRecipe(created.recipe.recipeId, created.version.versionNumber);
      } else {
        const version = await repoState.repository.saveNewVersion(
          proCoreRecipeId,
          recipeInput,
          trace,
          by,
          { source, note: lastChange?.titlePl },
        );
        markProCoreRecipe(proCoreRecipeId, version.versionNumber);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.save.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={copy.save.title} className="border-t border-ivory/10 pt-4">
      <p className="text-xs font-medium tracking-label text-ivory/50 uppercase">{copy.save.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ivory/40">{copy.save.note}</p>

      {gate.kind !== 'ready' ? (
        <p className="mt-2 text-xs leading-relaxed text-ivory/60">{gate.messagePl}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {gate.localDevNotePl ? (
            <p className="text-xs leading-relaxed text-status-risky">{gate.localDevNotePl}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-md border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40 disabled:cursor-not-allowed disabled:text-ivory/45"
          >
            {busy ? copy.save.saving : copy.save.saveButton}
          </button>
          {lastSavedVersion !== null ? (
            <p className="text-xs leading-relaxed text-ivory/60">
              {copy.save.savedVersion(lastSavedVersion)}
            </p>
          ) : null}
          {error ? <p className="text-xs leading-relaxed text-status-error">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
