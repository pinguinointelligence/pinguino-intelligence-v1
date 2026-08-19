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

export function WorkbenchActionBar({ onOpenPreview }: { onOpenPreview: () => void }) {
  const preview = useConstraintStudioStore((s) => s.preview);
  const history = useConstraintStudioStore((s) => s.history);
  const constraints = useConstraintStudioStore((s) => s.constraints);

  const mode = useRecipeStore((s) => s.mode);
  const category = useRecipeStore((s) => s.category);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const machineCapacityGrams = useRecipeStore((s) => s.machine_capacity_grams);
  const machineCapacitySource = useRecipeStore((s) => s.machine_capacity_source);
  const flavorIntensity = useRecipeStore((s) => s.flavor_intensity);
  const costPriority = useRecipeStore((s) => s.cost_priority);
  const targetProteinPercent = useRecipeStore((s) => s.target_protein_percent);
  const formulationStrategy = useRecipeStore((s) => s.formulation_strategy);
  const directionTargets = useRecipeStore((s) => s.direction_targets);
  const directionTargetsActive = useRecipeStore((s) => s.direction_targets_active);
  const excludedIngredientIds = useRecipeStore((s) => s.excludedIngredientIds);
  const unavailableMainIngredientIds = useRecipeStore((s) => s.unavailableMainIngredientIds);
  const items = useRecipeStore((s) => s.items);

  // Mirror every RecipeInputState field used by the canonical draft. Omitting
  // Direction targets here made a valid Apply look stale and hid Undo.
  const currentInput = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c: temperatureC,
        target_batch_grams: batchGrams,
        machine_capacity_grams: machineCapacityGrams,
        machine_capacity_source: machineCapacitySource,
        flavor_intensity: flavorIntensity,
        cost_priority: costPriority,
        target_protein_percent: targetProteinPercent,
        formulation_strategy: formulationStrategy,
        direction_targets: directionTargets,
        direction_targets_active: directionTargetsActive,
        excludedIngredientIds,
        unavailableMainIngredientIds,
        items,
      }),
    [
      mode,
      category,
      temperatureC,
      batchGrams,
      machineCapacityGrams,
      machineCapacitySource,
      flavorIntensity,
      costPriority,
      targetProteinPercent,
      formulationStrategy,
      directionTargets,
      directionTargetsActive,
      excludedIngredientIds,
      unavailableMainIngredientIds,
      items,
    ],
  );

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  return (
    <div className="flex min-w-0 items-center justify-end gap-2" data-testid="workbench-action-bar">
      {preview ? (
        <span className="flex min-w-0 items-center gap-2" data-testid="workbench-action-preview">
          <span className="hidden min-w-0 truncate text-xs text-stone-600 xl:inline">
            {a.previewReady}
          </span>
          <button
            type="button"
            onClick={onOpenPreview}
            data-testid="workbench-open-preview"
            className="h-11 shrink-0 rounded-lg border border-ink/20 px-2 text-xs font-semibold text-ink transition-colors hover:border-ink/45 lg:h-8"
          >
            {a.openPreview}
          </button>
        </span>
      ) : undoAvailable ? (
        <span className="flex min-w-0 items-center gap-2" data-testid="workbench-action-applied">
          <span className="hidden min-w-0 truncate text-xs text-status-ideal xl:inline">
            {r.applied}
          </span>
          <button
            type="button"
            onClick={() => useConstraintStudioStore.getState().undoLastApply()}
            data-testid="workbench-undo"
            className="h-11 shrink-0 rounded-lg border border-ink/20 px-2 text-xs font-semibold text-ink transition-colors hover:border-ink/45 lg:h-8"
          >
            {r.undo}
          </button>
        </span>
      ) : (
        <span className="hidden text-xs text-stone-600" data-testid="workbench-action-idle">
          {a.idleHint}
        </span>
      )}
    </div>
  );
}
