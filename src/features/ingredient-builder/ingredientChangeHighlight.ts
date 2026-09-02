/**
 * One unambiguous ingredient-row marker: the line genuinely differs between
 * the before and after vectors of the latest Recalculate result.
 *
 * PRESENTATION ONLY. The result never enters Engine math, recipe persistence,
 * pricing, dirty/version semantics, Preview validation or Apply authorization.
 */
export interface RecalculationMarkerLine {
  id: string;
  ingredientId: string;
  plannedGrams: number;
  lockType: string;
}

/**
 * Recipe rows display one decimal gram. Residue at or below half that display
 * step is not visible to the owner and therefore cannot truthfully raise a
 * marker. This remains display-only; no value is rounded back into the recipe.
 */
export const RECALCULATION_MARKER_EPSILON_GRAMS = 0.05;

/**
 * IDs of rows genuinely changed by ONE Recalculate result.
 *
 * The result follows AFTER order because only those rows can be rendered. An
 * added row is a change; a removed row is absent and cannot receive a marker.
 * Product identity and lock changes remain material even when grams are equal.
 */
export function recalculatedIngredientLineIds(
  before: readonly RecalculationMarkerLine[],
  after: readonly RecalculationMarkerLine[],
  epsilonGrams = RECALCULATION_MARKER_EPSILON_GRAMS,
): ReadonlySet<string> {
  const beforeById = new Map(before.map((line) => [line.id, line] as const));
  const changed = new Set<string>();
  for (const next of after) {
    const previous = beforeById.get(next.id);
    if (
      previous === undefined ||
      previous.ingredientId !== next.ingredientId ||
      previous.lockType !== next.lockType ||
      Math.abs(previous.plannedGrams - next.plannedGrams) > epsilonGrams
    ) {
      changed.add(next.id);
    }
  }
  return changed;
}
