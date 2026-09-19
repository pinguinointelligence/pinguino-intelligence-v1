/**
 * OD-24 (Owner 19.09.2026) — the durable recipe reference a batch needs, without making
 * the customer save their recipe to the library first.
 *
 * A run points at an immutable `recipe_version`; that is what gives it exact resume,
 * history, labels, Rescue, repeat and an audit trail, and it is deliberately not being
 * loosened. What changes is that HOME no longer has to ask for „Zapisz recepturę" to get
 * one: when a batch is about to start and the recipe has no durable version yet, the
 * product writes a TECHNICAL, hidden snapshot (`origin: 'production_snapshot'`) through
 * the SAME save authority a library save uses, and the run starts from it.
 *
 * Three rules this module exists to keep:
 *
 *  1. REUSE over create. A recipe that already has a durable version matching what is on
 *     screen starts its batch from that version — no second row, no version churn.
 *  2. IDEMPOTENT under a double tap. Two calls for the same state in flight share ONE
 *     promise, so a double click, a retry after a dropped response or a re-render cannot
 *     leave two snapshots behind.
 *  3. Never a library recipe. The snapshot carries `origin: 'production_snapshot'`, so
 *     „Receptury → Moje" never lists it and no saved-recipe limit counts it.
 *
 * NOT here: starting the run. `useProductionWorkspace` does that, for HOME and PRO alike,
 * once the source carries a recipe id and a version — which is exactly what this returns.
 */
import type { RecipeInput } from '@/engine';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import type { RecipesRepository } from '@/services/proCore/recipesRepository';

export interface DurableProductionRecipe {
  recipeId: string;
  versionId: string;
  versionNumber: number;
  /** False when an existing durable version was reused — the common case on a re-entry. */
  created: boolean;
}

export interface EnsureDurableProductionRecipeInput {
  repository: RecipesRepository;
  ownerUserId: string;
  /** The FINAL recipe the batch will be made from — never a draft mid-recalculation. */
  recipeInput: RecipeInput;
  productComposition: RecipeCompositionMetadata | null;
  /** The name the snapshot carries; the customer never sees it as a recipe of theirs. */
  title: string;
  capabilities: RecipeCapabilities;
  trace: { engineVersion: string; configVersion: string; mapperDatasetVersion?: string | null };
  /**
   * What the recipe already has. All three present AND `matchesCurrentRecipe` means the
   * durable version on record IS what is on screen, so the batch starts from it.
   */
  existing: {
    recipeId: string | null;
    versionId: string | null;
    versionNumber: number | null;
    matchesCurrentRecipe: boolean;
  };
}

/**
 * In-flight work, keyed by owner + what is being made. Two callers asking for the same
 * thing at the same moment get the same promise — this is the whole of the double-tap
 * protection, and it deliberately lives beside the authority rather than in a screen.
 */
const inFlight = new Map<string, Promise<DurableProductionRecipe>>();

const keyOf = (input: EnsureDurableProductionRecipeInput): string =>
  JSON.stringify([
    input.ownerUserId,
    input.existing.recipeId,
    input.existing.versionId,
    input.recipeInput.target_batch_grams,
    input.recipeInput.items.map((item) => [item.id, item.planned_grams]),
  ]);

export function ensureDurableProductionRecipe(
  input: EnsureDurableProductionRecipeInput,
): Promise<DurableProductionRecipe> {
  const { existing } = input;
  if (
    existing.recipeId !== null &&
    existing.versionId !== null &&
    existing.versionNumber !== null &&
    existing.matchesCurrentRecipe
  ) {
    // Already durable and still true: the batch starts from the version on record.
    return Promise.resolve({
      recipeId: existing.recipeId,
      versionId: existing.versionId,
      versionNumber: existing.versionNumber,
      created: false,
    });
  }

  const key = keyOf(input);
  const running = inFlight.get(key);
  if (running) return running;

  const work = (async (): Promise<DurableProductionRecipe> => {
    const { recipe, version } = await input.repository.createRecipe({
      ownerUserId: input.ownerUserId,
      title: input.title,
      notes: null,
      recipeInput: input.recipeInput,
      productComposition: input.productComposition,
      trace: {
        engineVersion: input.trace.engineVersion,
        configVersion: input.trace.configVersion,
        mapperDatasetVersion: input.trace.mapperDatasetVersion ?? null,
      },
      /* The version's own word for „this came from a starter draft, not a deliberate
         library save" — an existing value, not a new versioning system. */
      source: 'starter_draft',
      origin: 'production_snapshot',
      by: input.ownerUserId,
      capabilities: input.capabilities,
    });
    return {
      recipeId: recipe.recipeId,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      created: true,
    };
  })();

  inFlight.set(key, work);
  /* A failure must not poison the key: the next attempt is allowed to try again. The
     cleanup handles BOTH outcomes, so it never leaves a rejected promise of its own for
     the runtime to report as unhandled — the caller owns the rejection. */
  const forget = () => {
    if (inFlight.get(key) === work) inFlight.delete(key);
  };
  void work.then(forget, forget);
  return work;
}

/** Tests only: forget in-flight work between cases. */
export function resetDurableProductionRecipeForTests(): void {
  inFlight.clear();
}
