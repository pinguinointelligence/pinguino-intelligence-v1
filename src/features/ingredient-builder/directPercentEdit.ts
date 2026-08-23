import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import type { ConstraintSet } from '@/features/recipe-constraints';

export type DirectPercentEditResult =
  | {
      ok: true;
      gramsByLineId: Readonly<Record<string, number>>;
    }
  | {
      ok: false;
      code: 'line_missing' | 'invalid_percent' | 'protected_line' | 'main_zero' | 'no_rebalance_capacity';
    };

const protectedConstraint = (set: ConstraintSet, lineId: string): boolean => {
  const value = set.byLineId[lineId];
  return value !== undefined && value.mode !== 'ai';
};

const unavailable = (ids: readonly string[]): Set<string> =>
  new Set(ids.map((id) => id.trim()).filter(Boolean));

/**
 * Human direct-manipulation seam for the recipe percentage control.
 *
 * It keeps target batch fixed, changes the selected share, preserves a
 * Multi-Main ratio through one common scale, and proportionally absorbs the
 * opposite mass only in ordinary unlocked planning lines. This is deliberately
 * draft editing, not an Engine solve; Preview remains the only path that may
 * call the optimizer and Apply.
 */
export function buildDirectPercentEdit(
  input: RecipeInput,
  set: ConstraintSet,
  lineId: string,
  requestedPercent: number,
  excludedIngredientIds: readonly string[] = [],
): DirectPercentEditResult {
  if (!Number.isFinite(requestedPercent) || requestedPercent < 0 || requestedPercent > 100) {
    return { ok: false, code: 'invalid_percent' };
  }
  const selected = input.items.find((item) => item.id === lineId);
  if (!selected) return { ok: false, code: 'line_missing' };
  if (
    selected.actual_grams !== null ||
    selected.lock_type === 'already_added' ||
    selected.lock_type === 'required' ||
    selected.lock_type === 'grams' ||
    selected.lock_type === 'percent' ||
    protectedConstraint(set, selected.id)
  ) {
    return { ok: false, code: 'protected_line' };
  }
  // A stabilizer's amount belongs to PINGÜINO's own stabilizer system, which
  // owns the aggregate band and the per-component clamp. Manufacturer dosage is
  // informational and never granted (or withheld) this permission.
  if (resolveFunctionalRole(selected.ingredient) === 'stabilizer') {
    return { ok: false, code: 'protected_line' };
  }

  const selectedIsMain = selected.lock_type === 'main';
  const changed = selectedIsMain
    ? input.items.filter((item) => item.lock_type === 'main')
    : [selected];
  const excluded = unavailable(excludedIngredientIds);
  if (
    selectedIsMain &&
    changed.some(
      (item) =>
        item.actual_grams !== null ||
        protectedConstraint(set, item.id) ||
        resolveFunctionalRole(item.ingredient) === 'stabilizer' ||
        excluded.has(canonicalIngredientId(item.ingredient)),
    )
  ) {
    return { ok: false, code: 'protected_line' };
  }
  const selectedTarget = (input.target_batch_grams * requestedPercent) / 100;
  if (selectedIsMain && selected.planned_grams <= 0) return { ok: false, code: 'main_zero' };
  const scale = selectedIsMain ? selectedTarget / selected.planned_grams : 1;
  const changedIds = new Set(changed.map((item) => item.id));
  const changedBefore = changed.reduce((sum, item) => sum + item.planned_grams, 0);
  const changedAfter = selectedIsMain ? changedBefore * scale : selectedTarget;
  const massDelta = changedAfter - changedBefore;
  const rebalance = input.items.filter(
    (item) =>
      !changedIds.has(item.id) &&
      item.actual_grams === null &&
      item.lock_type === 'unlocked' &&
      !protectedConstraint(set, item.id) &&
      resolveFunctionalRole(item.ingredient) !== 'stabilizer' &&
      !excluded.has(canonicalIngredientId(item.ingredient)),
  );
  const rebalanceBefore = rebalance.reduce((sum, item) => sum + item.planned_grams, 0);
  const rebalanceAfter = rebalanceBefore - massDelta;
  if (rebalanceAfter < -1e-9 || (Math.abs(massDelta) > 1e-9 && rebalanceBefore <= 0)) {
    return { ok: false, code: 'no_rebalance_capacity' };
  }
  const rebalanceScale = rebalanceBefore > 0 ? Math.max(0, rebalanceAfter) / rebalanceBefore : 1;

  const gramsByLineId: Record<string, number> = Object.fromEntries(
    input.items.map((item) => [item.id, item.planned_grams]),
  );
  for (const item of changed) {
    gramsByLineId[item.id] = selectedIsMain ? item.planned_grams * scale : selectedTarget;
  }
  for (const item of rebalance) gramsByLineId[item.id] = item.planned_grams * rebalanceScale;

  // Close floating-point residue on the largest eligible line. This is still
  // full-precision draft math; practical whole grams are created only by Preview.
  const sum = Object.values(gramsByLineId).reduce((total, grams) => total + grams, 0);
  const residue = input.target_batch_grams - sum;
  const sink = [...rebalance].sort(
    (a, b) => b.planned_grams - a.planned_grams || a.id.localeCompare(b.id),
  )[0];
  if (Math.abs(residue) > 1e-8 && !sink) return { ok: false, code: 'no_rebalance_capacity' };
  if (sink) gramsByLineId[sink.id] = gramsByLineId[sink.id]! + residue;
  return { ok: true, gramsByLineId };
}
