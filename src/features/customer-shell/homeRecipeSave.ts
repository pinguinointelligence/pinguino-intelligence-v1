/**
 * Customer `/start` — the HOME SAVE seam (pure).
 *
 * DEFECT THIS REPAIRS (code-grounded, 2026-07-26): the canonical plan matrix grants Home exactly
 * ONE saved recipe (`HOME_MAX_SAVED_RECIPES = 1`, versions of that recipe never count), and
 * `customerShellAccessFor(persona).save` already resolved that capability — but NO surface
 * consumed it. `/start` (the Home flow) rendered a result with no save action at all, and the only
 * mounted save UI (`ProWorkbar`) lives inside `/pro`, which shows a Pro upgrade gate for a `home`
 * persona. A paying Home subscriber therefore could never save the one recipe their plan grants.
 *
 * This module makes the decision — and ONLY the decision — pure and testable: given the canonical
 * capability, the auth state, the repository availability, whether a REAL engine payload exists,
 * and the owner's existing recipe aggregates, which save affordance is honest right now?
 *
 * It invents no rule of its own: the limit itself is enforced by the canonical
 * `canCreateNewRecipe` gate (the same gate the repositories run server-side), so the UI can never
 * disagree with what the backend will allow.
 */
import { canCreateNewRecipe } from '@/features/pro-core/recipeVersioning';
import type { RecipeCapabilities, SavedRecipe } from '@/features/pro-core/recipeContracts';

/** The aggregate fields the seam needs (a full `SavedRecipe` satisfies it). */
export type HomeSaveRecipe = Pick<
  SavedRecipe,
  'recipeId' | 'title' | 'latestVersionNumber' | 'archived' | 'updatedAt'
>;

export type HomeSaveState =
  /** The plan cannot save at all (Demo) — the paywall already owns that surface. */
  | { kind: 'hidden' }
  /** Signed out — an honest sign-in prompt, never a save button that cannot work. */
  | { kind: 'signin' }
  /** No configured recipe backend in this build — honest, never a fake "saved". */
  | { kind: 'unavailable' }
  /** A structure-only preview (no engine payload) — there is nothing truthful to store. */
  | { kind: 'not_calculated' }
  /** The owner's recipe list is still loading. */
  | { kind: 'loading' }
  /** May create a NEW aggregate (Home with none yet; Pro always). */
  | { kind: 'create' }
  /**
   * At the plan's aggregate limit (Home with its one recipe): the canonical rule allows a NEW
   * IMMUTABLE VERSION of that same recipe, so the honest affordance is "save as version N", never
   * a dead-end error and never a silent overwrite.
   */
  | { kind: 'version'; recipeId: string; title: string; nextVersion: number }
  /** At the limit with no recipe to version (defensive; carries the canonical reason). */
  | { kind: 'blocked'; reason: string };

export interface HomeSaveInput {
  /** The canonical save capability from `customerShellAccessFor(persona).save`. */
  caps: RecipeCapabilities;
  authed: boolean;
  repositoryAvailable: boolean;
  /** True only when a REAL `calculateRecipe` payload backs the result (never structure-only). */
  hasCalculatedRecipe: boolean;
  recipesLoading: boolean;
  /** The owner's aggregates, or null while unknown. */
  recipes: readonly HomeSaveRecipe[] | null;
}

/** Newest-updated first — the recipe a limited plan versions into. */
const byUpdatedDesc = (a: HomeSaveRecipe, b: HomeSaveRecipe): number =>
  a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1;

/** Active (non-archived) aggregates — the ONLY ones the canonical limit counts. */
export function activeRecipes(recipes: readonly HomeSaveRecipe[]): HomeSaveRecipe[] {
  return recipes.filter((r) => !r.archived);
}

export function resolveHomeSaveState(input: HomeSaveInput): HomeSaveState {
  if (!input.caps.canSaveRecipe) return { kind: 'hidden' };
  if (!input.authed) return { kind: 'signin' };
  if (!input.repositoryAvailable) return { kind: 'unavailable' };
  if (!input.hasCalculatedRecipe) return { kind: 'not_calculated' };
  if (input.recipesLoading || input.recipes === null) return { kind: 'loading' };

  const active = activeRecipes(input.recipes);
  const gate = canCreateNewRecipe(active.length, input.caps);
  if (gate.allowed) return { kind: 'create' };

  const target = [...active].sort(byUpdatedDesc)[0];
  if (target === undefined) return { kind: 'blocked', reason: gate.reason };
  return {
    kind: 'version',
    recipeId: target.recipeId,
    title: target.title,
    nextVersion: target.latestVersionNumber + 1,
  };
}

/** A default recipe name proposal (the customer may edit it before saving). */
export function proposeRecipeTitle(resultTitle: string): string {
  return resultTitle.trim();
}
