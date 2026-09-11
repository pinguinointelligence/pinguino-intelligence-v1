/**
 * OWNER OD-3 (2026-09-11, Package 2A closure): a new HOME topping starts at 5 %
 * of the current BASE mass.
 *
 * A default at creation, nothing more: the topping stays outside the BASE, outside
 * priority and the Crown, and Engine-external. Once the customer changes its
 * amount, that amount is theirs — nothing recomputes it.
 */
export const HOME_TOPPING_DEFAULT_SHARE = 0.05;

/** 5 % of the current BASE mass, in whole grams. */
export function defaultHomeToppingGrams(
  baseItems: readonly { readonly planned_grams: number }[],
): number {
  const base = baseItems.reduce(
    (sum, item) =>
      sum + (Number.isFinite(item.planned_grams) ? Math.max(0, item.planned_grams) : 0),
    0,
  );
  return Math.round(base * HOME_TOPPING_DEFAULT_SHARE);
}
