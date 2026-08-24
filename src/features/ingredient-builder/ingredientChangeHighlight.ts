/**
 * „I changed something here" — the subtle per-line change marker (owner
 * 2026-08-23, mobile Pro UX §8).
 *
 * PRESENTATION ONLY. This module never touches the Engine, the recipe vector,
 * pricing, persistence or the dirty/version semantics: it compares the values
 * ALREADY on screen against a baseline captured at the last accepted state and
 * reports which line ids differ.
 *
 * WHAT IT COMPARES — and, just as importantly, what it does not.
 *
 * The signature is the RECIPE VECTOR of a line and nothing else: which product
 * is on it, how many grams (and therefore its %), and its exclusive lock, which
 * is where the Main crown lives (`lock_type === 'main'`).
 *
 * It deliberately excludes every value that does NOT belong to the recipe's
 * accepted state — the owner's „MOJA CENA", the required/unavailable UX flags.
 * That is the owner's ruling (2026-08-24: „recipe-state only"), and it is also
 * what makes the marker sound: those values arrive ASYNCHRONOUSLY. Served QA
 * caught the same class of failure three separate times through three different
 * doors — a module switch, a first paint before prices landed, and a
 * signature-format migration on a dirty draft — every one of them because a
 * server-hydrated field sat in the signature. A field that can change without
 * the user touching anything cannot be evidence that the user touched
 * something.
 */

export interface IngredientChangeInput {
  lineId: string;
  /** Identity of the product on the line; a substitution is a change too. */
  ingredientId: string;
  plannedGrams: number;
  /** The exclusive lock — this is also where the Main crown lives. */
  lockType: string;
}

/**
 * One stable, comparable string per line, compared at THE PRECISION THE ROW
 * ACTUALLY SHOWS (one decimal for grams, matching the list row and the stepper).
 *
 * This is not a detail. A percentage edit rebalances the other lines and can
 * leave a residue far below the displayed precision — served staging QA showed
 * SUCROSE and INULIN marked as changed while both rows still displayed exactly
 * `135 g` and `121 g`. A marker the owner cannot explain from the numbers in
 * front of them is worse than no marker, so the comparison rounds the same way
 * the display does. Rounding stays display-only: nothing here re-enters the
 * Engine, the recipe vector or any saved value.
 */
export function ingredientChangeSignature(input: IngredientChangeInput): string {
  return [input.ingredientId, input.plannedGrams.toFixed(1), input.lockType].join('|');
}

export type IngredientSignatureMap = Readonly<Record<string, string>>;

/**
 * Lines whose current signature differs from the captured baseline. A line with
 * NO baseline entry counts as changed only when a baseline exists at all — on a
 * cold start there is nothing to compare against and nothing may be marked.
 */
export function changedIngredientLineIds(
  current: IngredientSignatureMap,
  baseline: IngredientSignatureMap,
): ReadonlySet<string> {
  const changed = new Set<string>();
  const baselineKnown = Object.keys(baseline).length > 0;
  if (!baselineKnown) return changed;
  for (const [lineId, signature] of Object.entries(current)) {
    if (baseline[lineId] !== signature) changed.add(lineId);
  }
  return changed;
}
