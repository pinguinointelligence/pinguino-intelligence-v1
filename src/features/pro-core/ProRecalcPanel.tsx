/**
 * PINGÜINO Pro — the workbar-level recalculation panel (owner P0, 2026-07-22).
 *
 * „Przelicz z PI" in the sticky workbar initiates the REAL canonical recalculation —
 * change recipe → Przelicz z PI → Podgląd → „Zastosuj zmiany" / „Anuluj" → optional „Cofnij"
 * → „Zapisz nową wersję". It is a SECOND VIEW over the ONE constraint-studio session store
 * (createOptimizePreview / applyPreview / cancelPreview / undoLastApply): no new optimizer, no
 * second apply pipeline, and the boundary rule (constraintStudioStore = the only recipe writer)
 * stays intact. Preview rows render through the same pure ConstraintPreviewCard; failures render
 * the same honest Polish messages; a verify-failed apply renders the same BlockedApplyNotice.
 */
import { useMemo } from 'react';
import { copy } from '@/copy/en';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  isUndoAvailable,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import { BlockedApplyNotice } from '@/features/constraint-studio/ui/BlockedApplyNotice';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';

const r = copy.proWorkbar.recalcPanel;

export function ProRecalcPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const preview = useConstraintStudioStore((s) => s.preview);
  const previewIssue = useConstraintStudioStore((s) => s.previewIssue);
  const blocked = useConstraintStudioStore((s) => s.blocked);
  const history = useConstraintStudioStore((s) => s.history);
  const constraints = useConstraintStudioStore((s) => s.constraints);
  // Actions are stable references — reading them once via getState is safe.
  const store = useConstraintStudioStore.getState();

  const mode = useRecipeStore((s) => s.mode);
  const category = useRecipeStore((s) => s.category);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const machineCapacityGrams = useRecipeStore((s) => s.machine_capacity_grams);
  const flavorIntensity = useRecipeStore((s) => s.flavor_intensity);
  const costPriority = useRecipeStore((s) => s.cost_priority);
  const items = useRecipeStore((s) => s.items);

  const currentInput = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c: temperatureC,
        target_batch_grams: batchGrams,
        machine_capacity_grams: machineCapacityGrams,
        flavor_intensity: flavorIntensity,
        cost_priority: costPriority,
        items,
      }),
    [mode, category, temperatureC, batchGrams, machineCapacityGrams, flavorIntensity, costPriority, items],
  );

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  if (!open) return null;

  return (
    <section
      aria-label={r.title}
      data-testid="pro-recalc-panel"
      className="mt-3 rounded-lg bg-shell px-4 py-4 text-ivory [color-scheme:dark]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-label text-ivory/60 uppercase">{r.title}</p>
        <button
          type="button"
          onClick={onClose}
          data-testid="pro-recalc-close"
          className="rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
        >
          {r.close}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {blocked ? <BlockedApplyNotice blocked={blocked} onDismiss={store.dismissBlocked} /> : null}

        {previewIssue ? (
          <p className="text-sm leading-relaxed text-ivory/70" data-testid="pro-recalc-issue">
            {previewIssueMessagePl(previewIssue)}
          </p>
        ) : null}

        {preview ? (
          <ConstraintPreviewCard
            preview={preview}
            onApply={store.applyPreview}
            onCancel={() => {
              store.cancelPreview();
              onClose();
            }}
          />
        ) : null}

        {!preview && undoAvailable ? (
          <div className="space-y-2" data-testid="pro-recalc-applied">
            <p className="text-sm leading-relaxed text-ivory/80">{r.applied}</p>
            <button
              type="button"
              onClick={store.undoLastApply}
              data-testid="pro-recalc-undo"
              className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            >
              {r.undo}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
