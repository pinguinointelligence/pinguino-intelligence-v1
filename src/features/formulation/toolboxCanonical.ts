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

export interface ToolboxCanonicalIdentity {
  /** Engine correction-candidate id (DEFAULT_CORRECTION_CANDIDATES). */
  toolboxId: string;
  /** Stable canonical Mapper ingredient id (staging-verified). */
  mapperId: string;
  /** Polish display name for PI-added lines and reasons. */
  namePl: string;
}

const CANONICAL: readonly ToolboxCanonicalIdentity[] = [
  { toolboxId: 'sucrose', mapperId: 'PI-ING-000514', namePl: 'Sacharoza (cukier)' },
  { toolboxId: 'dextrose', mapperId: 'PI-ING-000494', namePl: 'Dekstroza' },
  { toolboxId: 'tara_gum', mapperId: 'PI-ING-000492', namePl: 'Guma tara' },
  { toolboxId: 'cream_30', mapperId: 'PI-ING-000180', namePl: 'Śmietanka 30%' },
  { toolboxId: 'milk_3_5', mapperId: 'PI-ING-000236', namePl: 'Mleko 3,5%' },
  { toolboxId: 'smp', mapperId: 'PI-ING-000270', namePl: 'Odtłuszczone mleko w proszku' },
  { toolboxId: 'inulin', mapperId: 'PI-ING-000456', namePl: 'Inulina' },
  { toolboxId: 'water', mapperId: 'PI-ING-001409', namePl: 'Woda' },
];

const BY_TOOLBOX_ID = new Map(CANONICAL.map((entry) => [entry.toolboxId, entry]));

/** Exact-identity lookup (null = candidate has no canonical registry entry). */
export function canonicalToolboxIdentity(toolboxId: string): ToolboxCanonicalIdentity | null {
  return BY_TOOLBOX_ID.get(toolboxId) ?? null;
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
  if (excluded.has(toolboxId)) return true;
  const canonical = BY_TOOLBOX_ID.get(toolboxId);
  return canonical !== null && canonical !== undefined && excluded.has(canonical.mapperId);
}

export function listToolboxCanonicalIdentities(): readonly ToolboxCanonicalIdentity[] {
  return CANONICAL;
}
