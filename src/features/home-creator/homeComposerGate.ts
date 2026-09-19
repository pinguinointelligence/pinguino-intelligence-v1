/**
 * When the main HOME call to action may act.
 *
 * DESIGN V3.0 VI/IX (owner 2026-09-17) replaces §28's „not rendered before the first idea”:
 * ONE „Rozpocznij recepturę” stands at the bottom of the start screen in both modes, and
 * it is visibly INACTIVE until there is a minimal input — a base idea chip or typed text
 * in „Twój pomysł”, a chosen recipe in „Receptury”. The empty field carries the hint
 * „Dodaj przynajmniej jeden składnik albo smak.” instead of hiding the action.
 *
 * The gate is still the BASE of the recipe. A topping is not a recipe: someone whose
 * only chip is „posypka czekoladowa" has described a decoration, not something
 * the Engine can balance, so the CTA stays inactive until a base ingredient or
 * flavour is present. `role === null` means the user never stated a role, which
 * is the ordinary case for „banan" — unstated is base, only an explicit topping
 * word is a topping (`homeIntentParsing.detectStatedRole`).
 *
 * Pure on purpose: the same question is asked by the start screen, by its tests and
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
 * An idea that can already be turned into a recipe: a base idea that exists as a chip.
 *
 * Text still sitting in the field is NOT an idea yet: it has not been parsed, so
 * nobody knows whether it names an ingredient, a profile or nothing at all.
 * Enter and the send arrow turn it into a chip; the idea follows the chips.
 */
export function shouldOfferRecipeCta(chips: readonly ComposerGateChip[]): boolean {
  return hasBaseIdea(chips);
}

/** The two ways HOME starts (DESIGN V3.0 VI): the customer's idea, or the recipes. */
export type HomeStartMode = 'idea' | 'library';

/**
 * DESIGN V3.0 VI/IX — is „Rozpocznij recepturę” active?
 *
 *   • „Twój pomysł”: a base idea chip, or text typed in the field. Pressing it first turns
 *     the typed text into chips (the same door as Enter), so the existing CTA handler still
 *     only runs for a base idea — see `shouldOfferRecipeCta`;
 *   • „Receptury”: a chosen recipe card.
 */
export function startCtaEnabled(input: {
  readonly mode: HomeStartMode;
  readonly chips: readonly ComposerGateChip[];
  readonly typedText: boolean;
  readonly recipeChosen: boolean;
}): boolean {
  if (input.mode === 'library') return input.recipeChosen;
  return hasBaseIdea(input.chips) || input.typedText;
}
