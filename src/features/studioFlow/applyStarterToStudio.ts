/**
 * Local "Apply starter to Studio" — writes a `ready` starter draft's exact
 * engine input into the EXISTING canonical local Studio draft state
 * (`useRecipeStore`, the same store the ingredient table + engine panel read).
 *
 * HARD SCOPE (test-pinned):
 *  - ENTIRELY LOCAL: no network, no DB write, no recipe save (`savedRecipeId`
 *    stays null), no accepted-correction record, no optimization run;
 *  - exact underlying quantities — the payload's planned grams are written
 *    as-is (never display-rounded), and `target_batch_grams` is the exact
 *    requested batch (decimal batches included);
 *  - ONE undo snapshot: apply returns a deep snapshot of the prior local
 *    draft; `undoStarterApplyToStudio` restores it exactly (deep-equal),
 *    including the preset highlight and the saved-recipe link. A second apply
 *    replaces the snapshot deterministically — no general history;
 *  - the trace stays honest: the applied line ids keep the
 *    `starter:<templateId>:<ingredientId>` shape from the locked template.
 */
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput, RecipeItem } from '@/engine';
import { useRecipeStore, type RecipeState } from '@/stores/recipeStore';

/** The full local Studio draft slice (everything apply/undo may touch). */
export interface StudioDraftSnapshot {
  mode: RecipeState['mode'];
  category: RecipeState['category'];
  target_temperature_c: number;
  target_batch_grams: number;
  machine_capacity_grams: number | null;
  flavor_intensity: RecipeState['flavor_intensity'];
  cost_priority: RecipeState['cost_priority'];
  items: RecipeItem[];
  activePresetId: RecipeState['activePresetId'];
  savedRecipeId: string | null;
  savedRecipeName: string | null;
}

type SnapshotSource = Pick<RecipeState, keyof StudioDraftSnapshot>;

const cloneItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.map((item) => ({ ...item }));

/** Deep snapshot of the current local Studio draft (pure over its input). */
export const captureStudioDraftSnapshot = (state: SnapshotSource): StudioDraftSnapshot => ({
  mode: state.mode,
  category: state.category,
  target_temperature_c: state.target_temperature_c,
  target_batch_grams: state.target_batch_grams,
  machine_capacity_grams: state.machine_capacity_grams,
  flavor_intensity: state.flavor_intensity,
  cost_priority: state.cost_priority,
  items: cloneItems(state.items),
  activePresetId: state.activePresetId,
  savedRecipeId: state.savedRecipeId,
  savedRecipeName: state.savedRecipeName,
});

/**
 * "Pristine" = the untouched default cold-open state (the seeded Milk Base
 * preset, never edited, never linked to a saved recipe). Content-compared —
 * line ids are ignored so a reloaded-but-untouched session still counts.
 */
export function isStudioDraftPristine(snapshot: StudioDraftSnapshot): boolean {
  const preset = DEFAULT_PRESET;
  if (snapshot.activePresetId !== preset.id) return false;
  if (snapshot.savedRecipeId !== null || snapshot.savedRecipeName !== null) return false;
  if (
    snapshot.mode !== preset.mode ||
    snapshot.category !== preset.category ||
    snapshot.target_temperature_c !== preset.target_temperature_c ||
    snapshot.target_batch_grams !== preset.target_batch_grams ||
    snapshot.machine_capacity_grams !== preset.machine_capacity_grams ||
    snapshot.flavor_intensity !== preset.flavor_intensity ||
    snapshot.cost_priority !== preset.cost_priority
  ) {
    return false;
  }
  if (snapshot.items.length !== preset.items.length) return false;
  return snapshot.items.every((item, index) => {
    const reference = preset.items[index];
    return (
      reference !== undefined &&
      item.ingredient.id === reference.ingredient.id &&
      item.planned_grams === reference.planned_grams &&
      item.actual_grams === reference.actual_grams &&
      item.lock_type === reference.lock_type
    );
  });
}

/** True when the Studio holds a non-pristine draft → apply must be confirmed. */
export const studioHoldsUserDraft = (): boolean =>
  !isStudioDraftPristine(captureStudioDraftSnapshot(useRecipeStore.getState()));

/**
 * Apply the starter's exact engine input into the local Studio draft state.
 * Returns the deep snapshot of the PRIOR draft (the one undo restores).
 * Local-only: goes through the store's existing `loadRecipeInput` — no save,
 * no optimizer, no network.
 */
export function applyStarterRecipeInputToStudio(payload: RecipeInput): StudioDraftSnapshot {
  const prior = captureStudioDraftSnapshot(useRecipeStore.getState());
  useRecipeStore.getState().loadRecipeInput(payload);
  return prior;
}

/** Restore the EXACT prior local draft from the apply snapshot (deep-equal). */
export function undoStarterApplyToStudio(snapshot: StudioDraftSnapshot): void {
  useRecipeStore.setState({
    mode: snapshot.mode,
    category: snapshot.category,
    target_temperature_c: snapshot.target_temperature_c,
    target_batch_grams: snapshot.target_batch_grams,
    machine_capacity_grams: snapshot.machine_capacity_grams,
    flavor_intensity: snapshot.flavor_intensity,
    cost_priority: snapshot.cost_priority,
    items: cloneItems(snapshot.items),
    activePresetId: snapshot.activePresetId,
    savedRecipeId: snapshot.savedRecipeId,
    savedRecipeName: snapshot.savedRecipeName,
  });
}
