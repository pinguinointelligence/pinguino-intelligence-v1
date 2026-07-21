import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

const r = copy.recipes;
const d = copy.recipes.dialog;
const TRACE = { engineVersion: ENGINE_VERSION, configVersion: CONFIG_VERSION, mapperDatasetVersion: null };

const fieldClass =
  'mt-1 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone-400 transition-colors focus:border-ink/40 focus:outline-none';

/**
 * THE ONE canonical save (S2 repair). Backed by the pro-core RecipesRepository so every save
 * is a real aggregate + immutable version — never the legacy `saved_recipes`-only path that
 * produced orphan rows and an every-second-save alternation.
 *
 *   • no linked aggregate → "Zapisz recepturę": createRecipe (atomic aggregate + meta + v1);
 *   • linked aggregate    → "Zapisz nową wersję": saveNewVersion (DB-derived, concurrency-safe);
 *   • always available     → "Zapisz jako nową recepturę": create a NEW aggregate.
 *
 * Honest failure: a backend error is shown, the modal STAYS open, the button leaves the loading
 * state and can be retried — never a false "saved". Double submit is disabled while busy.
 */
export function SaveRecipeDialog({ onClose }: { onClose: () => void }) {
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
  const currentVersionNumber = useRecipeStore((s) => s.currentVersionNumber);
  const markSaved = useRecipeStore((s) => s.markSaved);

  const linked = Boolean(savedRecipeId);
  // Linked → default to appending a version; the user can switch to "save as new" (a fresh name).
  const [asNew, setAsNew] = useState(!linked);
  const [name, setName] = useState(savedRecipeName ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsName = asNew;
  const nextVersion = (currentVersionNumber ?? 0) + 1;
  const blocked = !authed ? d.signIn : unavailable || repository === null ? d.unavailable : !caps.canSaveRecipe ? d.demoCannotSave : null;
  const canSubmit = !busy && blocked === null && (!needsName || name.trim().length > 0);

  const persist = async () => {
    if (!canSubmit || !repository) return;
    setBusy(true);
    setError(null);
    try {
      const recipeInput = buildRecipeInput(useRecipeStore.getState());
      if (asNew || !savedRecipeId) {
        const { recipe, version } = await repository.createRecipe({
          ownerUserId: ownerId,
          title: name.trim(),
          notes: note.trim() || null,
          recipeInput,
          trace: TRACE,
          source: 'manual',
          by: ownerId,
          capabilities: caps,
        });
        markSaved(recipe.recipeId, recipe.title, version.versionNumber);
      } else {
        const version = await repository.saveNewVersion(savedRecipeId, recipeInput, TRACE, ownerId, {
          note: note.trim() || undefined,
        });
        markSaved(savedRecipeId, savedRecipeName ?? name.trim(), version.versionNumber);
      }
      // Refresh the lists/history so the save appears WITHOUT a page reload (pro-core + legacy).
      const savedId = useRecipeStore.getState().savedRecipeId;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pro-core-recipes', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['saved-recipes'] }),
        savedId
          ? queryClient.invalidateQueries({ queryKey: ['pro-core-recipe-versions', savedId] })
          : Promise.resolve(),
      ]);
      onClose();
    } catch (caught) {
      // HONEST failure — keep the modal open, surface the real cause, allow a first-try retry.
      setError(caught instanceof Error ? caught.message : d.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) void persist();
  };

  const primaryLabel = busy ? d.saving : asNew ? d.createButton : d.versionButton(nextVersion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label={d.cancel}
        className="absolute inset-0 h-full w-full bg-ink/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-ink/10 bg-paper p-7">
        <SectionLabel>{asNew ? d.createTitle : d.versionTitle}</SectionLabel>

        {linked && !asNew ? (
          <p className="mt-3 text-xs leading-relaxed text-stone-500" data-testid="save-linked-line">
            {d.linkedLine(savedRecipeName ?? '—', currentVersionNumber ?? 1)}
          </p>
        ) : null}

        {isLocalDev ? (
          <p className="mt-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {copy.proCore.localMode}
          </p>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          {needsName ? (
            <label className="block">
              <span className="text-xs tracking-label text-stone-500 uppercase">{d.nameLabel}</span>
              <input
                required
                autoFocus
                value={name}
                placeholder={d.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
                className={fieldClass}
                data-testid="save-name"
              />
            </label>
          ) : null}
          <label className="block">
            <span className="text-xs tracking-label text-stone-500 uppercase">
              {asNew ? d.firstNoteLabel : d.changeNoteLabel}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={cn(fieldClass, 'resize-none')}
              data-testid="save-note"
            />
          </label>

          {blocked ? <p className="text-xs leading-relaxed text-stone-500">{blocked}</p> : null}
          {error ? (
            <p role="alert" className="text-xs leading-relaxed text-status-risky" data-testid="save-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(buttonClasses('primary', 'sm'), !canSubmit && 'opacity-50')}
              data-testid="save-primary"
            >
              {primaryLabel}
            </button>
            {linked && !asNew ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAsNew(true);
                  setError(null);
                }}
                className={cn(buttonClasses('ghost', 'sm'), busy && 'opacity-50')}
                data-testid="save-as-new"
              >
                {d.saveAsNew}
              </button>
            ) : null}
          </div>
        </form>

        <button
          type="button"
          className="mt-4 text-xs text-stone-400 transition-colors hover:text-ink"
          onClick={onClose}
        >
          {r.cancel}
        </button>
      </div>
    </div>
  );
}
