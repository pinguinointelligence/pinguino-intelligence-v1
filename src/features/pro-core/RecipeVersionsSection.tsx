/**
 * PINGÜINO PRO CORE — real, persona-gated recipe-version section (Track A on a shipped surface).
 *
 * Extends My Recipes with the immutable-version workflow driven by the RecipesRepository port:
 * save the current Studio draft as a recipe / new version, view the immutable history, compare
 * v1↔latest and restore an older version as a new latest version. Gated by ProCorePersona
 * (Home = 1 recipe, versions don't count; Demo cannot save). Honest states: an unconfigured build
 * shows "backend not configured"; the DEV in-memory adapter shows a "local dev, not durable" banner
 * and never claims a durable save. A DEV-only persona switcher lets acceptance exercise home/pro.
 */
import { useMemo, useState } from 'react';
import { CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';
import { recipeCapabilitiesFor, type ProCorePersona } from './proCoreCapabilities';
import { useProCoreAccessStore } from './proCoreAccessStore';
import { useProCorePersona } from './useProCorePersona';
import { resolveRecipesRepository } from './proCoreRecipeRepo';
import {
  useCreateProCoreRecipe,
  useProCoreRecipes,
  useProCoreVersions,
  useRestoreProCoreVersion,
  useSaveProCoreVersion,
} from './useProCoreRecipes';

const c = copy.proCore;
const TRACE = { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION };

export function RecipeVersionsSection() {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);

  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, isLocalDev, unavailable } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const ownerUserId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canUse = Boolean(ownerUserId) && caps.canViewRecipeVersions && !unavailable;
  const recipesQ = useProCoreRecipes(repository, ownerUserId, canUse);
  const versionsQ = useProCoreVersions(repository, selectedId);
  const createM = useCreateProCoreRecipe(repository, ownerUserId);
  const saveVersionM = useSaveProCoreVersion(repository, ownerUserId);
  const restoreM = useRestoreProCoreVersion(repository, ownerUserId);

  const recipes = recipesQ.data ?? [];
  const selected = recipes.find((r) => r.recipeId === selectedId) ?? null;
  const versions = versionsQ.data ?? [];

  const currentDraftInput = () => buildRecipeInput(useRecipeStore.getState());
  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    try {
      await fn();
    } catch (error) {
      setMsg((error as Error).message);
    }
  };

  const saveAsNew = () =>
    run(async () => {
      const { recipe } = await createM.mutateAsync({
        ownerUserId,
        title: `${c.draftTitlePrefix} ${new Date().toLocaleString()}`,
        recipeInput: currentDraftInput(),
        trace: TRACE,
        by: ownerUserId,
        capabilities: caps,
      });
      setSelectedId(recipe.recipeId);
    });

  const saveVersion = () =>
    run(async () => {
      if (!selected) return;
      await saveVersionM.mutateAsync({ recipeId: selected.recipeId, recipeInput: currentDraftInput(), trace: TRACE, by: ownerUserId });
    });

  const restoreV1 = () =>
    run(async () => {
      if (!selected) return;
      await restoreM.mutateAsync({ recipeId: selected.recipeId, targetVersionNumber: 1, by: ownerUserId, caps });
    });

  return (
    <section className="mt-12 border-t border-ink/10 pt-8" aria-label={c.title} data-testid="pro-core-versions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-label text-ink uppercase">{c.title}</h2>
        {import.meta.env.DEV ? (
          <label className="flex items-center gap-2 text-xs text-stone-500">
            {c.devPersona}
            <select
              className="rounded border border-ink/15 px-2 py-1"
              value={persona}
              onChange={(e) => setDevPersona(e.target.value as ProCorePersona)}
              data-testid="pro-core-persona"
            >
              <option value="pro">Pro</option>
              <option value="home">Home</option>
              <option value="demo">Demo</option>
            </select>
          </label>
        ) : null}
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-stone-500">{c.blurb}</p>

      {unavailable ? (
        <p className="mt-4 rounded border border-ink/10 bg-stone-50 px-3 py-2 text-sm text-stone-600" data-testid="pro-core-unavailable">
          {c.backendUnavailable}
        </p>
      ) : (
        <>
          {isLocalDev ? (
            <p className="mt-4 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="pro-core-localmode">
              {c.localMode}
            </p>
          ) : null}

          {!caps.canSaveRecipe ? (
            <p className="mt-4 text-sm text-stone-500" data-testid="pro-core-gated">{c.demoCannotSave}</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={buttonClasses('primary', 'sm')} onClick={saveAsNew} disabled={createM.isPending} data-testid="pro-core-save-new">
                {c.saveDraftAsRecipe}
              </button>
              <button type="button" className={buttonClasses('ghost', 'sm')} onClick={saveVersion} disabled={!selected || saveVersionM.isPending} data-testid="pro-core-save-version">
                {c.saveNewVersion}
              </button>
              <button type="button" className={buttonClasses('ghost', 'sm')} onClick={restoreV1} disabled={!selected || versions.length < 1 || !caps.canRestoreRecipeVersion || restoreM.isPending} data-testid="pro-core-restore">
                {c.restoreV1}
              </button>
            </div>
          )}

          {msg ? (
            <p role="alert" className="mt-3 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="pro-core-msg">{msg}</p>
          ) : null}

          {caps.canViewRecipeVersions ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs tracking-label text-stone-400 uppercase">{c.recipesHeading}</h3>
                {recipes.length === 0 ? (
                  <p className="mt-2 text-sm text-stone-500" data-testid="pro-core-empty">{c.noRecipes}</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {recipes.map((rec) => (
                      <li key={rec.recipeId}>
                        <button
                          type="button"
                          className={`w-full rounded px-2 py-1 text-left text-sm ${rec.recipeId === selectedId ? 'bg-ink/5 text-ink' : 'text-stone-600 hover:bg-ink/5'}`}
                          onClick={() => setSelectedId(rec.recipeId)}
                          data-testid="pro-core-recipe-row"
                        >
                          {rec.title} · v{rec.latestVersionNumber}{rec.archived ? ` · ${c.archived}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs tracking-label text-stone-400 uppercase">{c.historyHeading}</h3>
                {!selected ? (
                  <p className="mt-2 text-sm text-stone-500">{c.selectRecipe}</p>
                ) : (
                  <ul className="mt-2 space-y-1" data-testid="pro-core-versions-list">
                    {versions.map((v) => (
                      <li key={v.versionNumber} className="text-sm text-stone-600" data-testid="pro-core-version-row">
                        v{v.versionNumber} · {v.source}{v.restoredFromVersion ? ` (${c.fromVersion} v${v.restoredFromVersion})` : ''} · {v.totalBatchG} g · {v.engineVersion}/{v.configVersion}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
