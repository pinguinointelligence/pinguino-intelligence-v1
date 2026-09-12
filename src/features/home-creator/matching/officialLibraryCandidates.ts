/**
 * §32 — the OFFICIAL recipe side of matching. PURE.
 *
 * The customer-facing official library is the Gellatti Recipe Library (`OFFICIAL_RECIPES`,
 * 177 frozen recipes). It replaces the six owner-review executable templates this module
 * used to read — those were admin-gated, so an ordinary customer was offered nothing.
 *
 * Only a recipe the customer can actually make is offered: READY by the library's own
 * readiness model, the same one that enables „Zrób te lody". A match that would then be
 * refused at open time is worse than no match (§32). Every other recipe stays browsable in
 * the library with its explicit state; nothing here hides it.
 *
 * Not offered, deliberately:
 *   • a Technical Base — HOME asks "does this flavour already exist?", and a base is not one;
 *   • a Heritage record — its profile is decided by the working copy's derivation, so it
 *     cannot pass the §40 profile filter honestly beforehand.
 *
 * Identity is canonical: a line matches only through its Mapper ingredient id (§22), never
 * by its name, so a wrong commercial form of the same flavour can never satisfy a request.
 */
import {
  OFFICIAL_RECIPES,
  officialRecipeImage,
  officialRecipeWorkingProfile,
  type OfficialRecipe,
} from '@/data/recipes/official/officialRecipeLibrary';
import {
  officialRecipeCanStart,
  officialRecipeReadiness,
} from '@/data/recipes/official/officialRecipeReadiness';
import { intentProfileFor } from '../homeProfileMapping';
import type { CandidateIngredient, RecipeCandidate } from '../homeRecipeMatching';

/** Recipe lines → candidate ingredients, by CANONICAL identity, each identity once. */
export function officialRecipeIngredients(recipe: OfficialRecipe): readonly CandidateIngredient[] {
  const seen = new Set<string>();
  const ingredients: CandidateIngredient[] = [];
  for (const line of recipe.lines) {
    if (line.identity.kind !== 'mapped') continue;
    const productId = line.identity.mapperIngredientId;
    if (seen.has(productId)) continue;
    seen.add(productId);
    // The working copy places every official line in the Base, so every line is an ingredient.
    ingredients.push({ productId, role: 'ingredient', displayName: line.label });
  }
  return ingredients;
}

export function officialRecipeToCandidate(recipe: OfficialRecipe): RecipeCandidate | null {
  if (recipe.productType === 'Technical Base') return null;
  if (!officialRecipeCanStart(officialRecipeReadiness(recipe))) return null;
  const { visibleProductType } = officialRecipeWorkingProfile(recipe);
  if (visibleProductType === null) return null;
  return {
    id: recipe.recipeId,
    title: recipe.name,
    source: 'official',
    profile: intentProfileFor(visibleProductType),
    ingredients: officialRecipeIngredients(recipe),
    imageUrl: officialRecipeImage(recipe).card,
    // §38: an official recipe's public attribution is Gellatti itself.
    originalCreatorName: null,
  };
}

/** The official candidates every signed-in customer may be offered. */
export function officialCandidates(
  recipes: readonly OfficialRecipe[] = OFFICIAL_RECIPES,
): readonly RecipeCandidate[] {
  return recipes
    .map(officialRecipeToCandidate)
    .filter((candidate): candidate is RecipeCandidate => candidate !== null);
}
