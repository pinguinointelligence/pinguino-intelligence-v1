/**
 * CROWN AUTO-SEED CONTRACT (owner P0).
 *
 * The Main crown is a ROLE, never an amount. But a crowned line still has to
 * exist in the formulation, and a line the user has not yet given an amount
 * sits at 0 g. Crowning it there used to leave a role-changed line that no
 * revalidation pass ever revisits (a 0 g line is not a ProductBehavior
 * required line), so every following grams edit was refused.
 *
 * The contract:
 *
 *   grams == 0, Crown ON   -> seed exactly 1 g and remember that WE seeded it
 *   grams  > 0, Crown ON   -> preserve the amount exactly, remember nothing
 *   Crown OFF              -> restore 0 g ONLY while the seeded gram is still
 *                             untouched; otherwise preserve what is there
 *
 * There is no gram stack and no history. One transient provenance flag, held
 * per line in the draft store and never persisted, plus the seed amount still
 * being exactly the seed. Any explicit user grams write clears the flag, so a
 * user who deliberately types 1 g keeps their 1 g when the crown comes off.
 *
 * 1 g is an ordinary positive Main amount: no threshold, no lock, no solver
 * involvement, and grams editing is never disabled.
 */

/** The seeded amount. One ordinary gram — not a threshold. */
export const CROWN_AUTO_SEED_GRAMS = 1;

export interface CrownAutoSeedDecision {
  /** Grams the line holds after Crown ON. */
  plannedGrams: number;
  /** True when this exact gram was seeded by the crown, not by the user. */
  autoSeeded: boolean;
}

/** Crown ON. Preserves any amount the user already has. */
export function crownOnPlannedGrams(plannedGrams: number): CrownAutoSeedDecision {
  return Number.isFinite(plannedGrams) && plannedGrams > 0
    ? { plannedGrams, autoSeeded: false }
    : { plannedGrams: CROWN_AUTO_SEED_GRAMS, autoSeeded: true };
}

/**
 * Crown OFF. Restores 0 g only for an untouched auto-seeded gram; every other
 * amount — including one the user typed after the seed — is preserved exactly.
 */
export function crownOffPlannedGrams(plannedGrams: number, autoSeeded: boolean): number {
  return autoSeeded && plannedGrams === CROWN_AUTO_SEED_GRAMS ? 0 : plannedGrams;
}

/** Adds one line to the transient provenance set. */
export function markCrownAutoSeeded(lineIds: readonly string[], lineId: string): string[] {
  return lineIds.includes(lineId) ? [...lineIds] : [...lineIds, lineId];
}

/** Removes one line from the transient provenance set. */
export function clearCrownAutoSeeded(lineIds: readonly string[], lineId: string): string[] {
  return lineIds.filter((id) => id !== lineId);
}

/** Removes several lines at once — one explicit multi-line grams write. */
export function clearCrownAutoSeededLines(
  lineIds: readonly string[],
  clearedLineIds: Iterable<string>,
): string[] {
  const cleared = new Set(clearedLineIds);
  return lineIds.filter((id) => !cleared.has(id));
}
