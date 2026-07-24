/**
 * PINGÜINO Pro — the compact bottom ACTION/RESULT bar (owner one-screen architecture).
 *
 * A fixed, thin row under the editor/Monitor split. Three honest states, all read from
 * the ONE constraint-studio session store (no new pipeline, no second apply path):
 *
 *  - staged preview → „Podgląd przeliczenia gotowy." + the button that re-opens the
 *    Przelicz overlay (Zastosuj/Anuluj live INSIDE the overlay, never duplicated);
 *  - after Apply → the canonical applied confirmation + „Cofnij" (the SAME
 *    `undoLastApply`, availability by the SAME `isUndoAvailable` check);
 *  - idle → batch mass + the live-recalculation hint.
 *
 * Save stays in the workbar (owner: no duplicated Save). Presentation only.
 */
import { useMemo } from 'react';
import { copy } from '@/copy/en';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  isUndoAvailable,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';

const a = copy.proWorkbench.actionBar;
const r = copy.proWorkbar.recalcPanel;

export function WorkbenchActionBar({
  totalBatchG,
  onOpenPreview,
}: {
  totalBatchG: number;
  onOpenPreview: () => void;
}) {
  const preview = useConstraintStudioStore((s) => s.preview);
  const history = useConstraintStudioStore((s) => s.history);
  const constraints = useConstraintStudioStore((s) => s.constraints);

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

  return (
    <div
      className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ivory/10 px-4 py-1.5"
      data-testid="workbench-action-bar"
    >
      <p className="font-mono text-[12px] tabular-nums text-ivory/70">
        {a.total}:{' '}
        <span className="text-ivory">{Math.round(totalBatchG).toLocaleString('pl-PL')} g</span>
      </p>

      {preview ? (
        <span className="flex items-center gap-2" data-testid="workbench-action-preview">
          <span className="text-[12px] text-ivory/80">{a.previewReady}</span>
          <button
            type="button"
            onClick={onOpenPreview}
            data-testid="workbench-open-preview"
            className="rounded-md border border-ivory/25 px-3 py-1 text-[12px] font-medium text-ivory transition-colors hover:border-ivory/50"
          >
            {a.openPreview}
          </button>
        </span>
      ) : undoAvailable ? (
        <span className="flex items-center gap-2" data-testid="workbench-action-applied">
          <span className="text-[12px] text-ivory/80">{r.applied}</span>
          <button
            type="button"
            onClick={() => useConstraintStudioStore.getState().undoLastApply()}
            data-testid="workbench-undo"
            className="rounded-md border border-ivory/25 px-3 py-1 text-[12px] font-medium text-ivory transition-colors hover:border-ivory/50"
          >
            {r.undo}
          </button>
        </span>
      ) : (
        <span className="text-[11px] text-ivory/60" data-testid="workbench-action-idle">
          {a.idleHint}
        </span>
      )}
    </div>
  );
}
