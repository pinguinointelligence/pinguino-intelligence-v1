/**
 * „I changed something here" — the subtle per-line change marker (owner
 * 2026-08-23, mobile Pro UX §8).
 *
 * PRESENTATION ONLY. This module never touches the Engine, the recipe vector,
 * pricing, persistence or the dirty/version semantics: it compares the values
 * ALREADY on screen against a baseline captured at the last clean state (a
 * load, a reopen, or a successful save — exactly the moments `recipeStore.dirty`
 * returns to false) and reports which line ids differ.
 *
 * The comparison covers everything the owner named as an ingredient change:
 * grams (and therefore the derived %), the exclusive lock, the Main/standard
 * role, required/unavailable status, and the effective price per kg.
 */

export interface IngredientChangeInput {
  lineId: string;
  plannedGrams: number;
  lockType: string;
  /** Customer role: 'main' | 'standard' | 'addition'. */
  role: string;
  required: boolean;
  unavailable: boolean;
  /** Effective €/kg actually shown on the line (own price included), or null. */
  pricePerKg: number | null;
  /** Which authority the price came from — switching to „MOJA CENA" is a change. */
  priceSource: string;
  /** Identity of the product on the line; a substitution is a change too. */
  ingredientId: string;
}

/** One stable, comparable string per line. Rounded to the precision shown. */
export function ingredientChangeSignature(input: IngredientChangeInput): string {
  return [
    input.ingredientId,
    input.plannedGrams.toFixed(3),
    input.lockType,
    input.role,
    input.required ? 'req' : '-',
    input.unavailable ? 'unavail' : '-',
    input.pricePerKg === null ? 'no-price' : input.pricePerKg.toFixed(4),
    input.priceSource,
  ].join('|');
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
