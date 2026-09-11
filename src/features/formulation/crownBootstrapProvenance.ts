/**
 * PRO CROWN BOOTSTRAP PROVENANCE (owner 2026-09-11).
 *
 * The gram PRO's Crown seeds onto an empty line (GEL-P0-002, GEL-P0-037) is a
 * bootstrap: it makes the crowned line a real, required recipe line, but it is
 * not a user quantity request — not a grams lock, not a minimum, and not an
 * exact Direction anchor. The Main search sizes it like any unsized Main.
 *
 * `amount_provenance: 'AUTO_CROWN_SEED'` records that on the line itself, so a
 * reload or a reopen before the first recalculation keeps the distinction. The
 * decision is PROVENANCE, never value: a gram the user typed is never marked,
 * whatever its size. The marker disappears with the first explicit amount,
 * real lock, Crown OFF, or recalculation that changes the amount. Only PRO's
 * surface writes it; HOME's Crown never does.
 *
 * Separate from `crownAutoSeededLineIds`, the transient Crown-OFF provenance
 * (GEL-P0-003/004), which deliberately never persists.
 */
import type { RecipeItem } from '@/engine';

export const AUTO_CROWN_SEED = 'AUTO_CROWN_SEED' as const;

/** The line's amount is still the untouched Crown bootstrap. */
export function withCrownBootstrap<T extends RecipeItem>(item: T): T {
  return { ...item, amount_provenance: AUTO_CROWN_SEED };
}

/** The line's amount is no longer (or never was) the Crown bootstrap. */
export function withoutCrownBootstrap<T extends RecipeItem>(item: T): T {
  if (item.amount_provenance === undefined) return item;
  const next = { ...item };
  delete next.amount_provenance;
  return next;
}

/**
 * A Main line whose amount is still the untouched Crown bootstrap and which
 * carries no real grams / percent / range constraint of its own. A real lock
 * always wins over the bootstrap.
 */
export function isCrownBootstrapLine(item: RecipeItem): boolean {
  return (
    item.lock_type === 'main' &&
    item.amount_provenance === AUTO_CROWN_SEED &&
    item.grams_constraint === undefined &&
    item.percent_constraint === undefined &&
    item.range_constraint === undefined
  );
}
