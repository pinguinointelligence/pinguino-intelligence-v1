import { useState, type FormEvent } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { cn } from '@/lib/cn';
import { useIntakeStore } from '@/stores/intakeStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildSavePayload } from './recipePayload';
import { useCreateRecipe, useUpdateRecipe } from './useSavedRecipes';

const r = copy.recipes;

const fieldClass =
  'mt-1 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone-400 transition-colors focus:border-ink/40 focus:outline-none';

/** Save / Save As dialog (Phase 2A.2). Builds the RecipeInput from the store and
 * persists it via the recipes service; results are never stored. */
export function SaveRecipeDialog({ onClose }: { onClose: () => void }) {
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const savedRecipeName = useRecipeStore((state) => state.savedRecipeName);
  const markSaved = useRecipeStore((state) => state.markSaved);

  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();

  const [name, setName] = useState(savedRecipeName ?? '');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = createRecipe.isPending || updateRecipe.isPending;

  const persist = async (asNew: boolean) => {
    setError(null);
    const store = useRecipeStore.getState();
    const intake = useIntakeStore.getState();
    const recipeInput = buildRecipeInput({
      mode: store.mode,
      category: store.category,
      target_temperature_c: store.target_temperature_c,
      target_batch_grams: store.target_batch_grams,
      machine_capacity_grams: store.machine_capacity_grams,
      flavor_intensity: store.flavor_intensity,
      cost_priority: store.cost_priority,
      items: store.items,
    });
    const payload = buildSavePayload({
      name,
      description,
      recipeInput,
      intakeProductId: intake.productProfileId,
      intakeServingId: intake.servingProfileId,
    });
    try {
      const row =
        !asNew && savedRecipeId
          ? await updateRecipe.mutateAsync({ id: savedRecipeId, payload })
          : await createRecipe.mutateAsync(payload);
      markSaved(row.id, row.name);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.');
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) void persist(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label={r.cancel}
        className="absolute inset-0 h-full w-full bg-ink/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-ink/10 bg-paper p-7">
        <SectionLabel>{r.saveTitle}</SectionLabel>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-xs tracking-label text-stone-500 uppercase">{r.nameLabel}</span>
            <input
              required
              value={name}
              placeholder={r.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-xs tracking-label text-stone-500 uppercase">{r.descriptionLabel}</span>
            <textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={cn(fieldClass, 'resize-none')}
            />
          </label>

          {error ? <p className="text-xs leading-relaxed text-status-risky">{error}</p> : null}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className={cn(buttonClasses('primary', 'sm'), 'flex-1', (busy || !name.trim()) && 'opacity-50')}
            >
              {busy ? r.saving : r.save}
            </button>
            {savedRecipeId ? (
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => {
                  if (name.trim()) void persist(true);
                }}
                className={cn(buttonClasses('ghost', 'sm'), busy && 'opacity-50')}
              >
                {r.saveAs}
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
