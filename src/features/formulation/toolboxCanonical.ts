/**
 * CANONICAL TOOLBOX IDENTITY (owner P0 Phase 2 — NIGHTLY, Agent A).
 *
 * Every approved functional-toolbox candidate resolves by EXACT canonical
 * registry identity — never fuzzy search. Each entry binds the engine's
 * correction-candidate id (the composition source, science-frozen) to its
 * stable Mapper canonical ingredient id and the Polish display name used on
 * every PI-added line.
 *
 * The Mapper ids below were verified READ-ONLY against the staging catalogue
 * (project tunabqqrwabacxjcxxkz, table mapper_basement, 2026-07-24): all rows
 * exist, are `approved_for_engines = true` and `verification_status =
 * 'Verified'`, and match the repo-bundled seed `mapper_basement_v1_0.sql`
 * byte-for-byte. NOTHING here is invented; no composition values live in this
 * file (science freeze), and this module performs no I/O of any kind.
 */

import {
  CORE_INGREDIENT_IDENTITIES,
  canonicalIngredientIdFromSourceId,
  coreIdentityByToolboxId,
} from '@/data/ingredients/canonicalIngredientIdentity';

export interface ToolboxCanonicalIdentity {
  /** Engine correction-candidate id (DEFAULT_CORRECTION_CANDIDATES). */
  toolboxId: string;
  /** Stable canonical Mapper ingredient id (staging-verified). */
  mapperId: string;
  /** Polish display name for PI-added lines and reasons. */
  namePl: string;
}

const CANONICAL: readonly ToolboxCanonicalIdentity[] = CORE_INGREDIENT_IDENTITIES;

/** Exact-identity lookup (null = candidate has no canonical registry entry). */
export function canonicalToolboxIdentity(toolboxId: string): ToolboxCanonicalIdentity | null {
  return coreIdentityByToolboxId(toolboxId);
}

/**
 * TRUE when the user's explicit exclusions cover this toolbox candidate under
 * ANY of its canonical identities — the engine candidate id (a removed
 * PI-added line) OR the stable Mapper id (a removed catalogue product of the
 * same canonical ingredient). Closes the identity-mismatch hole: an excluded
 * ingredient is excluded, whichever registry the removed line came from.
 */
export function isToolboxCandidateExcluded(
  toolboxId: string,
  excluded: ReadonlySet<string>,
): boolean {
  const canonical = coreIdentityByToolboxId(toolboxId);
  if (!canonical) return excluded.has(toolboxId);
  return [...excluded].some(
    (excludedId) => canonicalIngredientIdFromSourceId(excludedId) === canonical.mapperId,
  );
}

export function listToolboxCanonicalIdentities(): readonly ToolboxCanonicalIdentity[] {
  return CANONICAL;
}
