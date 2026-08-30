/**
 * §32 — the OFFICIAL recipe side of matching. PURE.
 *
 * ── THE HONEST STATE OF THE OFFICIAL LIBRARY (verified 2026-08-30) ──────────
 *
 * There are two things in the repo that look like an official recipe library, and
 * only one of them is a recipe authority at all:
 *
 *   `flavorCatalogue*`            INSPIRATION metadata. Its own header: "no grams, no
 *                                 product ids, no verified doses, no Engine-ready
 *                                 recipe". It must never be promoted into a recipe
 *                                 authority, so it is not read here.
 *
 *   `EXECUTABLE_RECIPE_TEMPLATES` The real executable authority — 6 templates, all
 *                                 `profile: 'milk_gelato'`, and every one of them
 *                                 `publicationStage: 'owner_review'`. Opening one goes
 *                                 through `openExecutableRecipeTemplate`, which
 *                                 refuses anybody without `admin_users` access
 *                                 ("Owner Review wymaga aktywnego uprawnienia
 *                                 administratora" — an administrative staging surface,
 *                                 explicitly NOT a Pro entitlement).
 *
 * So for an ordinary customer the official corpus is EMPTY BY DESIGN. This module is
 * built and tested against the real templates so it works the moment a
 * customer-facing official library exists — but `officialCandidatesFor` takes the
 * viewer's owner-review access and returns nothing without it.
 *
 * That gate is not squeamishness: offering a customer a match they would then be
 * refused at open time is a worse experience than no match at all, and §32 is about
 * showing recipes the user can actually have.
 */
import {
  EXECUTABLE_RECIPE_TEMPLATES,
  type ExecutableRecipeTemplate,
} from '@/data/recipes/executableRecipeLibrary';
import type { IntentProfile } from '../homeIntentParsing';
import type { CandidateIngredient, RecipeCandidate } from '../homeRecipeMatching';

/** The template profiles that map onto a customer-visible HOME profile. */
const PROFILE_BY_TEMPLATE_PROFILE: Readonly<Record<string, IntentProfile>> = {
  milk_gelato: 'gelato',
};

/**
 * A template may be OFFERED only when it could actually be produced.
 * `BLOCKED_EXACT_PRODUCT_DATA` means a required product has no approved dose, so the
 * recipe cannot be materialised — offering it would be a false promise.
 */
export const isOfferableTemplate = (template: ExecutableRecipeTemplate): boolean =>
  template.status === 'OWNER_REVIEW_EDITABLE';

/** Template lines → candidate ingredients, by CANONICAL identity (§32, §22). */
export function templateIngredients(
  template: ExecutableRecipeTemplate,
): readonly CandidateIngredient[] {
  const lines: CandidateIngredient[] = [];
  for (const line of template.base) {
    // A line with no resolved Mapper identity cannot satisfy an identity request.
    if (line.mapperIngredientId === null) continue;
    lines.push({
      productId: line.mapperIngredientId,
      role: 'ingredient',
      displayName: line.note,
    });
  }
  for (const line of template.toppings) {
    if (line.mapperIngredientId === null) continue;
    lines.push({ productId: line.mapperIngredientId, role: 'topping', displayName: line.note });
  }
  return lines;
}

export function templateToCandidate(template: ExecutableRecipeTemplate): RecipeCandidate | null {
  const profile = PROFILE_BY_TEMPLATE_PROFILE[template.profile];
  if (profile === undefined) return null;
  return {
    id: template.id,
    title: template.displayName,
    source: 'official',
    profile,
    ingredients: templateIngredients(template),
    imageUrl: null,
    // §38: an official recipe's public attribution is Gellatti itself.
    originalCreatorName: null,
  };
}

/**
 * The official candidates this viewer may be offered.
 *
 * `canOpenOwnerReview` must come from the SAME authority that guards opening
 * (`currentUserHasOwnerReviewAccess`), so the offer and the open can never disagree.
 */
export function officialCandidatesFor(
  canOpenOwnerReview: boolean,
  templates: readonly ExecutableRecipeTemplate[] = EXECUTABLE_RECIPE_TEMPLATES,
): readonly RecipeCandidate[] {
  if (!canOpenOwnerReview) return [];
  return templates
    .filter(isOfferableTemplate)
    .map(templateToCandidate)
    .filter((candidate): candidate is RecipeCandidate => candidate !== null);
}
