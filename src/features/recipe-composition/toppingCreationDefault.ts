/**
 * OWNER OD-3 (2026-09-11, Package 2A closure): a new topping created WITHOUT an amount
 * the customer confirmed starts at 5 % of the current BASE mass.
 *
 * Shared recipe-composition authority (owner §18, 2026-09-18): this is recipe math, so
 * it lives here, next to the other topping rules, and HOME only calls it — HOME owns
 * no gram arithmetic. PRO creates a topping at the amount its own control sets and
 * does not use this default today; adopting it there is an owner decision, and would
 * be one import, not a second copy of the rule.
 *
 * A default at creation, nothing more: the topping stays outside the BASE, outside
 * priority and the Crown, and Engine-external. Once the customer changes its amount,
 * that amount is theirs — nothing recomputes it.
 */
export const TOPPING_CREATION_DEFAULT_SHARE = 0.05;

/** 5 % of the current BASE mass, in whole grams. */
export function toppingCreationDefaultGrams(
  baseItems: readonly { readonly planned_grams: number }[],
): number {
  const base = baseItems.reduce(
    (sum, item) =>
      sum + (Number.isFinite(item.planned_grams) ? Math.max(0, item.planned_grams) : 0),
    0,
  );
  return Math.round(base * TOPPING_CREATION_DEFAULT_SHARE);
}
