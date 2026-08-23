/**
 * „Wersja v1 · 22.08.2026" — the workbench must never let a historical snapshot pass for the
 * current editable recipe (owner v1.4 §7).
 *
 * The library's WERSJA selector can open ANY immutable version. When the one on screen is not the
 * newest, this states so plainly and offers the single write action that exists for history:
 * „Przywróć tę wersję", which APPENDS a new latest version derived from this snapshot. v1/v2/v3 are
 * never touched, never renumbered, never overwritten — restoring v1 of a v3 recipe produces v4.
 *
 * Editing while an old version is open is allowed and safe: every save appends. The save dialog
 * says which version it will create (see `historicalSaveNote`), so „edit an old version" can only
 * ever mean „start a new version from it".
 */
import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { formatSavedRecipeDate } from '@/features/recipes/savedRecipeDate';
import { recipeCapabilitiesFor } from './proCoreCapabilities';
import { useProCorePersona } from './useProCorePersona';
import { resolveRecipesRepository } from './proCoreRecipeRepo';
import { useRestoreProCoreVersion } from './useProCoreRecipes';

const c = copy.recipes.historicalVersion;

export function HistoricalVersionNotice() {
  const persona = useProCorePersona();
  const caps = recipeCapabilitiesFor(persona);
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const { repository, isLocalDev } = repoState;

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const ownerUserId = authUserId ?? (isLocalDev ? 'local-dev-user' : '');

  const recipeId = useRecipeStore((s) => s.savedRecipeId);
  const recipeName = useRecipeStore((s) => s.savedRecipeName);
  const versionNumber = useRecipeStore((s) => s.currentVersionNumber);
  const latestVersionNumber = useRecipeStore((s) => s.savedRecipeLatestVersionNumber);
  const versionDate = useRecipeStore((s) => s.currentVersionDate);
  const loadRecipeInput = useRecipeStore((s) => s.loadRecipeInput);

  const restoreM = useRestoreProCoreVersion(repository, ownerUserId);
  const [error, setError] = useState<string | null>(null);

  const historical =
    recipeId !== null &&
    versionNumber !== null &&
    latestVersionNumber !== null &&
    versionNumber < latestVersionNumber;

  if (!historical) return null;

  const restore = () => {
    setError(null);
    if (!recipeId || versionNumber === null) return;
    void (async () => {
      try {
        const created = await restoreM.mutateAsync({
          recipeId,
          targetVersionNumber: versionNumber,
          by: ownerUserId,
          caps,
        });
        // The draft becomes the NEW latest version; every earlier version is preserved.
        loadRecipeInput(created.recipeInput, {
          savedId: recipeId,
          savedName: recipeName,
          versionNumber: created.versionNumber,
          latestVersionNumber: created.versionNumber,
          versionId: created.versionId,
          versionDate: created.createdAt,
          composition: created.productComposition,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : c.restoreFailed);
      }
    })();
  };

  return (
    <section
      role="status"
      data-testid="historical-version-notice"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/35 bg-education-ivory/60 px-4 py-3"
    >
      <p className="text-sm text-stone-700">
        <span className="font-semibold text-ink">
          {c.heading(versionNumber, versionDate ? formatSavedRecipeDate(versionDate) : null)}
        </span>{' '}
        {c.body(latestVersionNumber)}
      </p>
      <span className="flex items-center gap-3">
        {error ? <span className="text-xs text-status-error">{error}</span> : null}
        <button
          type="button"
          className={buttonClasses('ivory', 'sm')}
          disabled={restoreM.isPending || !caps.canRestoreRecipeVersion}
          onClick={restore}
          data-testid="historical-version-restore"
        >
          {restoreM.isPending ? c.restoring : c.restore}
        </button>
      </span>
    </section>
  );
}
