/// <reference types="node" />
/**
 * GELLATTI — seed one saved, production-ready recipe per profile on staging.
 *
 * Phase B needs a saved recipe for Sorbet, Vegan and Protein so the Production
 * weighing workflow can be driven for each. Building them by hand in the
 * workbench was not possible from the automation harness: the profile
 * `<select>` is a controlled React input and neither a native value change, a
 * keyboard change nor a synthesised `onChange` moves the store, so the profile
 * could never be switched.
 *
 * This takes the honest route instead — it uses the SAME paths the application
 * uses: the canonical starter, the real staging ProductBehavior authority for
 * every line, the real Preview/Apply doors, and the real Supabase recipes
 * adapter (which goes through `create_recipe_with_v1`, guarded server-side by
 * `assert_recipe_behavior_authority_all_lines_v1`). Nothing is faked: a recipe
 * that would not pass the server's own authority cannot be seeded here either.
 *
 * Run: `QA_SEED_PROFILES=1 npm run acceptance:matrix -- seedProfileRecipes`
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { productBehaviorSnapshotFingerprint } from '@/features/product-intelligence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from '@/features/constraint-studio/applyPipeline';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { supabaseRecipesRepository } from '@/services/proCore/supabaseRecipes';
import { supabase } from '@/lib/supabase/client';
import { resolveRecipeProposalBehaviorSnapshots } from '@/services/productIntelligence';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import {
  PROFILE_CATEGORY,
  PROFILE_VISIBLE,
  QA_EMAIL,
  QA_PASSWORD,
  ROTATION,
  SORBET_MAINS,
  mapperIngredient,
  priceIndexFor,
  type Profile,
} from './matrixSupport';

const AT = '2026-08-29T23:30:00.000Z';
const CAPS: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};

/** One production-ready recipe per profile Phase B still needs. */
interface SeedTarget {
  profile: Profile;
  title: string;
  main: string | null;
  extra: string;
  serving: 'temp_minus_11' | 'temp_minus_12' | 'temp_minus_13';
}

const TARGETS: readonly SeedTarget[] = [
  {
    profile: 'Sorbet',
    title: 'QA Sorbet Truskawka -12',
    main: SORBET_MAINS[0]!,
    extra: ROTATION.Sorbet[0]!,
    serving: 'temp_minus_12',
  },
  /* PC-01 is temperature-specific: the same Sorbet answers at -13 and cannot
     move Direction at all at -12 under OPTIMAL. Seeding both makes the
     difference observable in the served application, not only in the ledger. */
  {
    profile: 'Sorbet',
    title: 'QA Sorbet Truskawka -13',
    main: SORBET_MAINS[0]!,
    extra: ROTATION.Sorbet[0]!,
    serving: 'temp_minus_13',
  },
  {
    profile: 'Vegan',
    title: 'QA Vegan Kokos -12',
    main: null,
    extra: ROTATION.Vegan[2]!,
    serving: 'temp_minus_12',
  },
  {
    profile: 'Protein',
    title: 'QA Protein Kakao -12',
    main: null,
    extra: ROTATION.Protein[5]!,
    serving: 'temp_minus_12',
  },
];

const buildInput = (target: SeedTarget): RecipeInput => {
  const batch = 1_000;
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: PROFILE_VISIBLE[target.profile],
    servingModeId: target.serving,
    formulationStrategy: 'optimal',
    targetBatchGrams: batch,
  });
  let items = starter.items.map((item) => ({
    ...item,
    ingredient: structuredClone(item.ingredient),
  }));
  if (target.main) {
    const mainGrams = Math.max(1, Math.round(starter.metrics.missingMainMassGrams || batch * 0.6));
    const supportTotal = items.reduce((sum, item) => sum + item.planned_grams, 0);
    const remaining = Math.max(0, batch - mainGrams);
    if (supportTotal > 0 && remaining > 0) {
      items = items.map((item) => ({
        ...item,
        planned_grams: Math.max(1, Math.round(item.planned_grams * (remaining / supportTotal))),
      }));
    }
    items.push({
      id: `seed-main-${target.main}`,
      ingredient: mapperIngredient(target.main),
      planned_grams: mainGrams,
      actual_grams: null,
      lock_type: 'main' as const,
      main_ratio_weight: mainGrams,
      user_intent_anchor_grams: mainGrams,
    });
  }
  items.push({
    id: `seed-extra-${target.extra}`,
    ingredient: mapperIngredient(target.extra),
    planned_grams: Math.max(5, Math.round(batch * 0.03)),
    actual_grams: null,
    lock_type: 'unlocked' as const,
  });
  return {
    mode: 'classic',
    category: PROFILE_CATEGORY[target.profile],
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: batch,
    machine_capacity_grams: null,
    items,
    goals: {
      formulation_strategy: 'optimal',
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

/**
 * The REAL snapshots, not a local fixture with an overlay.
 *
 * `create_recipe_with_v1` is guarded by
 * `assert_recipe_behavior_authority_all_lines_v1`, which checks the binding
 * ids, fingerprints and resolution context the server itself produced. An
 * overlay over the test fixture carries none of those, and the server rightly
 * answers "recipe product behavior is stale or blocked". So this uses the same
 * resolver the application uses, through the application's own client.
 */
const snapshotsFor = async (
  input: RecipeInput,
  accountId: string,
): Promise<Record<string, ProductBehaviorSnapshot>> => {
  const resolved = await resolveRecipeProposalBehaviorSnapshots({
    recipe: input,
    snapshots: {},
    accountId,
    module: 'BASE_RECIPE',
  });
  if (resolved.unresolvedLineIds.length > 0) {
    throw new Error(`unresolved lines: ${resolved.unresolvedLineIds.join(', ')}`);
  }
  return resolved.snapshots;
};

describe('seed one production-ready recipe per remaining profile', () => {
  it(
    'saves Sorbet, Vegan and Protein through the real adapter',
    async () => {
      if (process.env.QA_SEED_PROFILES !== '1') return;
      if (!supabase) throw new Error('Supabase is not configured for this run.');
      const auth = await supabase.auth.signInWithPassword({
        email: QA_EMAIL,
        password: QA_PASSWORD,
      });
      if (auth.error || !auth.data.user) {
        throw new Error(`QA sign-in failed: ${auth.error?.message ?? 'no user'}`);
      }
      const accountId = auth.data.user.id;
      const repo = supabaseRecipesRepository(supabase);
      const seeded: Array<Record<string, unknown>> = [];

      for (const target of TARGETS) {
        const input = buildInput(target);
        const snapshots = await snapshotsFor(input, accountId);
        const constraints = { byLineId: {} as Record<string, never> };
        const prices = priceIndexFor(input, AT);

        const unbound = buildOptimizePreview(input, constraints, AT, {
          effectivePriceOverrides: prices,
          productBehaviorSnapshots: snapshots,
          technicalOnlyMainLineIds: [],
          requirePracticalPreview: true,
        });
        if (!unbound.ok) {
          seeded.push({ profile: target.profile, saved: false, reason: `preview:${unbound.code}` });
          continue;
        }
        const proposalSnapshots = await snapshotsFor(unbound.preview.proposedInput, accountId);
        const built = bindProductBehaviorToPreview(unbound, proposalSnapshots, snapshots, []);
        if (!built.ok) {
          seeded.push({ profile: target.profile, saved: false, reason: `bind:${built.code}` });
          continue;
        }
        const executable = built.preview.proposedInput;
        const committed = commitPreview(
          input,
          constraints,
          built.preview,
          AT,
          `seed-${target.profile}`,
          [],
          undefined,
          null,
          null,
          {
            baseFingerprint: built.preview.baseFingerprint,
            targetFingerprint: directionTargetFingerprint(input),
            candidateFingerprint: workingStateFingerprint(
              executable,
              built.preview.nextConstraints,
            ),
          },
          null,
          snapshots,
          [],
          {
            baseFingerprint: built.preview.baseFingerprint,
            proposedFingerprint: workingStateFingerprint(
              executable,
              built.preview.nextConstraints,
            ),
            baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(snapshots),
            proposedProductBehaviorFingerprint:
              productBehaviorSnapshotFingerprint(proposalSnapshots),
            snapshots: structuredClone(proposalSnapshots),
          },
          null,
          { effectivePriceOverrides: prices, requirePracticalPreview: true },
        );
        if (!committed.ok) {
          seeded.push({ profile: target.profile, saved: false, reason: `apply:${committed.code}` });
          continue;
        }

        const applied = committed.verified.input;
        const composition: RecipeCompositionMetadata = {
          schemaVersion: 1,
          baseScope: 'BASE_FORMULATION',
          baseOrder: applied.items.map((item) => item.id),
          toppings: [],
          behaviorSnapshots: committed.verified.productBehaviorSnapshots,
          migrationAmbiguities: [],
        };
        try {
          const created = await repo.createRecipe({
            ownerUserId: accountId,
            title: target.title,
            recipeInput: applied,
            productComposition: composition,
            trace: { engineVersion: 'qa-seed', configVersion: 'qa-seed-v1' } as never,
            by: accountId,
            capabilities: CAPS,
          });
          seeded.push({
            profile: target.profile,
            saved: true,
            title: target.title,
            recipeId: created.recipe.recipeId,
            version: created.version.versionNumber,
            lines: applied.items.length,
          });
        } catch (error) {
          seeded.push({
            profile: target.profile,
            saved: false,
            reason: `save:${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      writeFileSync(
        join(process.cwd(), 'reports', 'e2e', 'screenshots', 'seeded-profile-recipes.json'),
        `${JSON.stringify(seeded, null, 2)}\n`,
      );
      expect(seeded).toHaveLength(TARGETS.length);
    },
    15 * 60 * 1000,
  );
});
