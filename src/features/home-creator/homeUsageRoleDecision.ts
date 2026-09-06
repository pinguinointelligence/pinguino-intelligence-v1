/**
 * §58 — ask only where the question is real.
 *
 * Most products answer this themselves. Cream is a base ingredient; sprinkles are a
 * topping; the catalogue already says so through `moduleEligibility`, and asking a
 * customer to confirm what Gellatti already knows is a step with no decision in it. That
 * is what "never ask unnecessarily" means: an unnecessary question is not politeness, it
 * is a stall.
 *
 * A few products genuinely are both — chocolate can be melted into the base or scattered
 * on top, and no amount of catalogue data settles which one THIS customer meant. Those,
 * and only those, get the question.
 *
 * PURE. The authority is the ProductBehavior snapshot the picker already resolved; this
 * reads it and decides nothing else. It never guesses eligibility, and when the snapshot
 * cannot say, it does not invent a question either — see `unknown` below.
 */
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';

export type HomeUsageRole = 'ingredient' | 'topping';

export type HomeUsageDecision =
  /** The catalogue is clear. Add it, say nothing. */
  | { readonly kind: 'settled'; readonly role: HomeUsageRole }
  /** Genuinely both. This is the ONLY case that earns the question. */
  | { readonly kind: 'ask' }
  /**
   * The snapshot cannot answer. Treated as an ingredient rather than a question,
   * because a question the customer has no basis to answer is worse than a default
   * they can change: every row already has "Zmień ilość" and a remove action.
   */
  | { readonly kind: 'settled'; readonly role: 'ingredient'; readonly reason: 'unknown' };

const isEligible = (
  behavior: ProductBehaviorSnapshot | null | undefined,
  module: 'BASE_RECIPE' | 'TOPPING',
): boolean => behavior?.moduleEligibility?.[module] === 'eligible';

/**
 * Decide how a product being added should be used.
 *
 * `TOPPING_ONLY` is honoured even when the module map is silent: the server role is a
 * direct statement about the product, and ignoring it would ask about something already
 * answered.
 */
export function decideUsageRole(
  behavior: ProductBehaviorSnapshot | null | undefined,
): HomeUsageDecision {
  if (behavior?.behaviorRole === 'TOPPING_ONLY') return { kind: 'settled', role: 'topping' };

  const base = isEligible(behavior, 'BASE_RECIPE');
  const topping = isEligible(behavior, 'TOPPING');

  if (base && topping) return { kind: 'ask' };
  if (topping) return { kind: 'settled', role: 'topping' };
  if (base) return { kind: 'settled', role: 'ingredient' };
  return { kind: 'settled', role: 'ingredient', reason: 'unknown' };
}
