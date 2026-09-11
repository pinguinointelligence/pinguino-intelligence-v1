/**
 * HOME priority mode — who writes a priority, and who sees it.
 *
 * There is exactly ONE representation of a priority: the Main role,
 * `lock_type: 'main'`. The Engine, the Main envelope and every preview gate read
 * it unchanged. This module adds only the product-layer question the owner asked
 * (Package 2A, closed 2026-09-11 on current staging):
 *
 *   AUTO   — a HOME draft is born here. Every BASE ingredient the customer adds
 *            becomes a priority through the existing Main authority (so a product
 *            Main cannot carry is still refused), and NONE of it is shown as a
 *            crown: an automatic priority is not a choice the customer made.
 *   MANUAL — PRO always, every loaded/reopened recipe, and HOME from the first
 *            crown the customer presses. From then on the priorities are exactly
 *            the crowns they set; an ingredient added later stays ordinary until
 *            they crown it. There is no way back to AUTO.
 *
 * A TOPPING never takes part: toppings live in `state.toppings`, carry no
 * `lock_type`, and are not in the Base the Engine balances.
 */
export type PriorityMode = 'AUTO' | 'MANUAL';

/** The mode every draft has unless HOME deliberately starts it in AUTO. */
export const DEFAULT_PRIORITY_MODE: PriorityMode = 'MANUAL';

/** Any recipe line — only whether it holds the Main role matters here. */
export interface PriorityLine {
  readonly id: string;
  readonly lock_type: string;
}

/** The lines that ARE priorities for the Engine — in either mode. */
export function effectivePriorityLineIds(items: readonly PriorityLine[]): string[] {
  return items.filter((item) => item.lock_type === 'main').map((item) => item.id);
}

/**
 * The lines HOME shows as an active crown. In AUTO the set is real but was never
 * chosen, so nothing is shown; in MANUAL the visible crowns ARE the priorities.
 */
export function visibleCrownLineIds(items: readonly PriorityLine[], mode: PriorityMode): string[] {
  return mode === 'AUTO' ? [] : effectivePriorityLineIds(items);
}

/** Does a BASE ingredient added right now become a priority automatically? */
export function autoPriorityAppliesToNewLine(mode: PriorityMode): boolean {
  return mode === 'AUTO';
}
