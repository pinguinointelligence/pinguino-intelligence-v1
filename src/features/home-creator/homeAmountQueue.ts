/**
 * HOME's amount question, one product at a time (Package 2A closure, 2026-09-11).
 *
 * Several products can need an amount at once — the chips that land after the
 * customer's first crown, a scanned product, a pick from the list. Each one gets
 * its own question, in the order they arrived; none silently replaces another.
 */
export function queueAmountQuestion<Q extends { readonly ingredient: { readonly id: string } }>(
  queue: readonly Q[],
  next: Q | null,
): Q[] {
  // `null` closes the question on screen and moves on to the next one.
  if (next === null) return queue.slice(1);
  // The same product is asked once.
  if (queue.some((pending) => pending.ingredient.id === next.ingredient.id)) return [...queue];
  return [...queue, next];
}
