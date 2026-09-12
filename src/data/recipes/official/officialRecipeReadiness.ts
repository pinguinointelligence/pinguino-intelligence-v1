/**
 * Official Gellatti Recipe Library — per-recipe readiness.
 *
 * Every recipe carries exactly one explicit state (worst first):
 *   OTHER_EXPLICIT_BLOCKER — a line's canonical PI is blocked by the FINAL Mapper,
 *                            the runtime does not serve it, or a BRAK label has no crosswalk row;
 *   INTERNAL_SUBRECIPE     — a BRAK line is an internal subrecipe whose versioned formula is not built;
 *   PRODUCT_BLOCKED        — a BRAK line needs a physical product (the owner's product table);
 *   REVIEW_REQUIRED        — a BRAK line the owner crosswalk resolves to an existing PI, applied only
 *                            after review at landing;
 *   DYNAMIC_MAIN           — the Sorbet scaffold Main is chosen by the user; no product is missing;
 *   READY                  — every line has an approved canonical PI.
 *
 * Missing country products never make a recipe unusable: without a market route the
 * canonical PI stays (the country resolver never substitutes). The blockers are local to the
 * recipe — they never hide the library.
 */
import {
  OFFICIAL_BRAK_RESOLUTIONS,
  OFFICIAL_FINAL_BLOCKED_PIS,
  type OfficialBrakResolution,
} from './officialBrakResolution.generated';
import type { OfficialRecipe, OfficialRecipeLine } from './officialRecipeTypes';

export const OFFICIAL_RECIPE_READINESS_STATES = [
  'READY',
  'DYNAMIC_MAIN',
  'REVIEW_REQUIRED',
  'PRODUCT_BLOCKED',
  'INTERNAL_SUBRECIPE',
  'OTHER_EXPLICIT_BLOCKER',
] as const;
export type OfficialRecipeReadinessState = (typeof OFFICIAL_RECIPE_READINESS_STATES)[number];

const RANK: Readonly<Record<OfficialRecipeReadinessState, number>> = Object.fromEntries(
  OFFICIAL_RECIPE_READINESS_STATES.map((state, index) => [state, index]),
) as Record<OfficialRecipeReadinessState, number>;

export type OfficialLineBlockReason =
  | 'final_mapper_blocked'
  | 'runtime_unavailable'
  | 'missing_crosswalk'
  | 'internal_subrecipe'
  | 'physical_product'
  | 'crosswalk_review'
  | 'dynamic_main';

export interface OfficialLineReadiness {
  readonly line: OfficialRecipeLine;
  readonly state: Exclude<OfficialRecipeReadinessState, 'READY'>;
  readonly reason: OfficialLineBlockReason;
  readonly resolution: OfficialBrakResolution | null;
}

export interface OfficialRecipeReadiness {
  readonly state: OfficialRecipeReadinessState;
  /** Every line that keeps the recipe from READY, in recipe order. */
  readonly blockingLines: readonly OfficialLineReadiness[];
}

const RESOLUTION_BY_LABEL: ReadonlyMap<string, OfficialBrakResolution> = new Map(
  OFFICIAL_BRAK_RESOLUTIONS.map((resolution) => [resolution.label, resolution]),
);
const FINAL_BLOCKED_PIS: ReadonlySet<string> = new Set(OFFICIAL_FINAL_BLOCKED_PIS.map((entry) => entry.pi));

/** The owner crosswalk row for a BRAK label (exact label match; never fuzzy). */
export function officialBrakResolutionFor(label: string): OfficialBrakResolution | null {
  return RESOLUTION_BY_LABEL.get(label) ?? null;
}

function brakLineReadiness(line: OfficialRecipeLine): OfficialLineReadiness {
  const resolution = officialBrakResolutionFor(line.label);
  if (line.identity.kind === 'dynamic_main') {
    return { line, state: 'DYNAMIC_MAIN', reason: 'dynamic_main', resolution };
  }
  if (!resolution) {
    return { line, state: 'OTHER_EXPLICIT_BLOCKER', reason: 'missing_crosswalk', resolution: null };
  }
  switch (resolution.resolutionClass) {
    case 'INTERNAL_SUBRECIPE':
      return { line, state: 'INTERNAL_SUBRECIPE', reason: 'internal_subrecipe', resolution };
    case 'USE_EXISTING_PI':
      return resolution.targetApproved === false
        ? { line, state: 'OTHER_EXPLICIT_BLOCKER', reason: 'final_mapper_blocked', resolution }
        : { line, state: 'REVIEW_REQUIRED', reason: 'crosswalk_review', resolution };
    case 'NO_ACTION':
      return { line, state: 'DYNAMIC_MAIN', reason: 'dynamic_main', resolution };
    default:
      return { line, state: 'PRODUCT_BLOCKED', reason: 'physical_product', resolution };
  }
}

/**
 * Readiness of one official recipe. `unavailablePis` (from the Mapper runtime) can only make a
 * recipe worse — it is never used to mark something ready.
 */
export function officialRecipeReadiness(
  recipe: OfficialRecipe,
  options: { readonly unavailablePis?: ReadonlySet<string> } = {},
): OfficialRecipeReadiness {
  const blockingLines: OfficialLineReadiness[] = [];
  for (const line of recipe.lines) {
    if (line.identity.kind !== 'mapped') {
      blockingLines.push(brakLineReadiness(line));
      continue;
    }
    const pi = line.identity.mapperIngredientId;
    if (FINAL_BLOCKED_PIS.has(pi)) {
      blockingLines.push({ line, state: 'OTHER_EXPLICIT_BLOCKER', reason: 'final_mapper_blocked', resolution: null });
    } else if (options.unavailablePis?.has(pi)) {
      blockingLines.push({ line, state: 'OTHER_EXPLICIT_BLOCKER', reason: 'runtime_unavailable', resolution: null });
    }
  }
  const state = blockingLines.reduce<OfficialRecipeReadinessState>(
    (worst, entry) => (RANK[entry.state] > RANK[worst] ? entry.state : worst),
    'READY',
  );
  return { state, blockingLines };
}

/** Whether the main recipe action can start a working copy now. */
export function officialRecipeCanStart(readiness: OfficialRecipeReadiness): boolean {
  return readiness.state === 'READY';
}

/** Static library-wide counts (runtime availability not applied). */
export function officialLibraryReadinessCounts(
  recipes: readonly OfficialRecipe[],
): Readonly<Record<OfficialRecipeReadinessState, number>> {
  const counts = Object.fromEntries(OFFICIAL_RECIPE_READINESS_STATES.map((state) => [state, 0])) as Record<
    OfficialRecipeReadinessState,
    number
  >;
  for (const recipe of recipes) counts[officialRecipeReadiness(recipe).state] += 1;
  return counts;
}
