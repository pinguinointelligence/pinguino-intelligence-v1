/**
 * §28 — when the main HOME call to action exists at all.
 *
 * On the empty screen the customer should be looking at ONE thing: the composer.
 * So `Zamień pomysł w recepturę` is not rendered greyed out, and no "add at
 * least one ingredient" hint stands under it either — a control that cannot be
 * used yet, and a sentence explaining why, are both noise before the first idea.
 *
 * The gate is the BASE of the recipe. A topping is not a recipe: someone whose
 * only chip is „posypka czekoladowa" has described a decoration, not something
 * the Engine can balance, so the CTA stays away until a base ingredient or
 * flavour is present. `role === null` means the user never stated a role, which
 * is the ordinary case for „banan" — unstated is base, only an explicit topping
 * word is a topping (`homeIntentParsing.detectStatedRole`).
 *
 * Pure on purpose: the same question is asked by the composer, by its tests and
 * by anything that later needs to know whether an idea is executable.
 */
import type { IntentRole } from './homeIntentParsing';

export interface ComposerGateChip {
  readonly role: IntentRole | null;
}

/** True when at least one chip contributes to the BASE of the recipe (§28). */
export function hasBaseIdea(chips: readonly ComposerGateChip[]): boolean {
  return chips.some((chip) => chip.role !== 'topping');
}

/**
 * §28 — the CTA is rendered only for a base idea that already exists as a chip.
 *
 * Text still sitting in the field is NOT an idea yet: it has not been parsed, so
 * nobody knows whether it names an ingredient, a profile or nothing at all.
 * Enter and the send arrow turn it into a chip; the CTA follows the chips.
 */
export function shouldOfferRecipeCta(chips: readonly ComposerGateChip[]): boolean {
  return hasBaseIdea(chips);
}
