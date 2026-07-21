/**
 * PINGÜINO PRO CORE — the Wersje tab: read-only immutable version history + restore (S2 repair).
 *
 * There is NO independent save here anymore. The ONE canonical save is the top-right dialog
 * (SaveRecipeDialog → createRecipe / saveNewVersion). This surface only READS the durable history
 * and RESTORES a past version — which appends a NEW latest version (history is never rewritten) and
 * re-links the editor draft to it. Gated by ProCorePersona; honest unavailable / local-dev states.
 * A DEV-only persona switch lets acceptance exercise home/pro without a live subscription.
 */
import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { useRecipeStore } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';
import { recipeCapabilitiesFor, type ProCorePersona } from './proCoreCapabilities';
import { useProCoreAccessStore } from './proCoreAccessStore';
import { useProCorePersona } from './useProCorePersona';
import { resolveRecipesRepository } from './proCoreRecipeRepo';
import { useProCoreRecipes, useProCoreVersions, useRestoreProCoreVersion } from './useProCoreRecipes';

const c = copy.proCore;

export function RecipeVersionsSection() {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);
  const loadRecipeInput = useRecipeStore((s) => s.loadRecipeInput);
  const linkedId = useRecipeStore((s) => s.savedRecipeId);

  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, isLocalDev, unavailable } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const ownerUserId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  // Default the selection to the recipe currently open in the editor.
  const [selectedId, setSelectedId] = useState<string | null>(linkedId);
  const [msg, setMsg] = useState<string | null>(null);

  const canUse = Boolean(ownerUserId) && caps.canViewRecipeVersions && !unavailable;
  const recipesQ = useProCoreRecipes(repository, ownerUserId, canUse);
  const versionsQ = useProCoreVersions(repository, selectedId);
  const restoreM = useRestoreProCoreVersion(repository, ownerUserId);

  const recipes = recipesQ.data ?? [];
  const selected = recipes.find((r) => r.recipeId === selectedId) ?? null;
  const versions = versionsQ.data ?? [];

  const restore = (versionNumber: number) => {
    setMsg(null);
    if (!selected) return;
    void (async () => {
      try {
        const created = await restoreM.mutateAsync({
          recipeId: selected.recipeId,
          targetVersionNumber: versionNumber,
          by: ownerUserId,
          caps,
        });
        // The editor draft becomes the new latest version; earlier versions are preserved.
        loadRecipeInput(created.recipeInput, {
          savedId: selected.recipeId,
          savedName: selected.title,
          versionNumber: created.versionNumber,
        });
      } catch (error) {
        setMsg((error as Error).message);
      }
    })();
  };

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
                      <li key={v.versionNumber} className="flex items-center justify-between gap-2 text-sm text-stone-600" data-testid="pro-core-version-row">
                        <span>
                          v{v.versionNumber} · {v.source}{v.restoredFromVersion ? ` (${c.fromVersion} v${v.restoredFromVersion})` : ''} · {v.totalBatchG} g · {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        {caps.canRestoreRecipeVersion ? (
                          <button
                            type="button"
                            className={buttonClasses('ghost', 'sm')}
                            disabled={restoreM.isPending}
                            onClick={() => restore(v.versionNumber)}
                            data-testid="pro-core-restore"
                          >
                            {c.restoreLabel}
                          </button>
                        ) : null}
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
