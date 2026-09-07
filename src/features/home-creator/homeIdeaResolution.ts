/**
 * An idea is not a recipe until every part of it has been answered.
 *
 * OWNER QA 2026-09-06. The flow moved on to the profile, the machine and a finished
 * recipe while elements of the idea were still unresolved — `runMatching` simply skipped
 * a chip with no product and carried on. The customer then met a recipe whose NAME
 * mentioned products that were never in it, and had to add them again by hand.
 *
 * Three things must be settled for each element before the flow may advance:
 *
 *   PRODUCT  a concrete catalogue item, not a search term
 *   ROLE     ingredient or topping — stated, or answered by the customer
 *   AMOUNT   a positive gram value the customer has seen
 *
 * PURE. It reports what is missing; it does not fix anything and does not decide how to
 * ask. That keeps the gate testable and keeps the asking in one place.
 */
import type { IntentChip } from './homeDraftStore';

export type IdeaGap = 'product' | 'role' | 'amount';

export interface UnresolvedElement {
  readonly chipId: string;
  readonly label: string;
  /** Every gap, so the UI can ask for them in one pass rather than one at a time. */
  readonly gaps: readonly IdeaGap[];
}

export interface IdeaResolution {
  readonly ready: boolean;
  readonly unresolved: readonly UnresolvedElement[];
}

/**
 * What is still missing before this idea can become a recipe.
 *
 * A chip the customer explicitly removed is gone from the list and is therefore not a
 * gap. An AMBIGUOUS chip counts as having no product: a term that matched several
 * products has not been resolved, it has merely been searched.
 */
export function resolveIdea(
  chips: readonly IntentChip[],
  amounts: Readonly<Record<string, number>> = {},
  /**
   * Chip ids whose role the customer still has to choose. Decided by the caller through
   * `decideUsageRole`, which reads the catalogue: most products settle their own role
   * silently, and only a genuinely both-ways product earns the question. The gate does
   * not re-derive that — one authority, asked once.
   */
  needsRoleChoice: ReadonlySet<string> = new Set(),
): IdeaResolution {
  const unresolved: UnresolvedElement[] = [];

  for (const chip of chips) {
    const gaps: IdeaGap[] = [];
    if (chip.productId === null || chip.ambiguous === true) gaps.push('product');
    // An unstated role is a gap ONLY where the product could genuinely be either; that
    // question is `decideUsageRole`'s, and it answers by settling most products silently.
    if (chip.role === null && needsRoleChoice.has(chip.id)) gaps.push('role');
    const grams = amounts[chip.id];
    if (!Number.isFinite(grams) || (grams ?? 0) <= 0) gaps.push('amount');
    if (gaps.length > 0) unresolved.push({ chipId: chip.id, label: chip.label, gaps });
  }

  return { ready: chips.length > 0 && unresolved.length === 0, unresolved };
}

/** Does the gap list block moving past the idea? Empty ideas do not block — see below. */
export const blocksAdvance = (resolution: IdeaResolution, chips: readonly IntentChip[]): boolean =>
  // An idea with no elements at all is a different journey (§41 `Create my own`), not an
  // unfinished one. Blocking it would trap a customer who never named anything.
  chips.length > 0 && !resolution.ready;
