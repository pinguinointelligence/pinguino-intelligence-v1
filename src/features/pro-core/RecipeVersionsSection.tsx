/**
 * PINGÜINO PRO CORE — the Wersje tab: version history for the CURRENTLY OPENED recipe only (S2 UX).
 *
 * There is NO global recipe list here anymore (that duplicated „Moje receptury" as
 * „name · v1" rows). Versions are per-recipe: this shows the immutable history of the recipe
 * linked in the editor (recipeStore.savedRecipeId), each labelled `DD.MM.YYYY · vN`, with restore
 * (which appends a NEW latest version — history is never rewritten — and re-links the draft). If no
 * recipe is open, it shows a hint to open one. The immutable-version backend is untouched.
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
import { useProCoreVersions, useRestoreProCoreVersion } from './useProCoreRecipes';

const c = copy.proCore;

/** Customer-facing version label: `DD.MM.YYYY` from the ISO date part (timezone-independent). */
export function formatVersionDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso.slice(0, 10);
}

export function RecipeVersionsSection() {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const setDevPersona = useProCoreAccessStore((s) => s.setDevPersona);
  const loadRecipeInput = useRecipeStore((s) => s.loadRecipeInput);
  const recipeId = useRecipeStore((s) => s.savedRecipeId);
  const recipeName = useRecipeStore((s) => s.savedRecipeName);

  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, isLocalDev, unavailable } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const ownerUserId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  const [msg, setMsg] = useState<string | null>(null);

  const versionsQ = useProCoreVersions(repository, recipeId);
  const restoreM = useRestoreProCoreVersion(repository, ownerUserId);
  const versions = versionsQ.data ?? [];

  const restore = (versionNumber: number) => {
    setMsg(null);
    if (!recipeId) return;
    void (async () => {
      try {
        const created = await restoreM.mutateAsync({
          recipeId,
          targetVersionNumber: versionNumber,
          by: ownerUserId,
          caps,
        });
        // The editor draft becomes the new latest version; earlier versions are preserved.
        loadRecipeInput(created.recipeInput, {
          savedId: recipeId,
          savedName: recipeName,
          versionNumber: created.versionNumber,
          versionDate: created.createdAt,
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
      ) : !caps.canViewRecipeVersions ? null : (
        <>
          {isLocalDev ? (
            <p className="mt-4 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="pro-core-localmode">
              {c.localMode}
            </p>
          ) : null}

          {!recipeId ? (
            <p className="mt-4 text-sm text-stone-500" data-testid="pro-core-open-hint">
              {c.openToSeeVersions}
            </p>
          ) : (
            <div className="mt-4">
              <p className="text-xs tracking-label text-stone-400 uppercase">
                {c.currentRecipe} <span className="text-sm normal-case text-ink">{recipeName ?? '—'}</span>
              </p>

              {msg ? (
                <p role="alert" className="mt-3 rounded border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="pro-core-msg">{msg}</p>
              ) : null}

              <ul className="mt-3 space-y-1" data-testid="pro-core-versions-list">
                {versions.map((v) => (
                  <li key={v.versionNumber} className="flex items-center justify-between gap-2 text-sm text-stone-600" data-testid="pro-core-version-row">
                    <span>
                      {formatVersionDate(v.createdAt)} · v{v.versionNumber}
                      {v.restoredFromVersion ? ` (${c.fromVersion} v${v.restoredFromVersion})` : ''}
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
            </div>
          )}
        </>
      )}
    </section>
  );
}
