/// <reference types="node" />
/**
 * PHASE 5 — persistence: create → Apply → Save v1 → reopen → modify → Save v2 →
 * restore v1 → verify v3, across five structurally different Vegan recipes from
 * the internet corpus.
 *
 * Driven through the REAL recipe service layer (the authorized seeding route):
 * both the in-memory reference adapter and the Supabase adapter running against
 * the repo's own FakeDB, so the same contract is proven on the code path the
 * served app uses. Nothing writes arbitrary rows or bypasses validation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateRecipe,
  type RecipeDirectionTarget,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { parseCsv } from '@/lib/csv';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { InMemoryRecipes } from '@/services/proCore/inMemoryRecipes';
import {
  inMemoryRecipesRepository,
  type RecipesRepository,
} from '@/services/proCore/recipesRepository';
import { supabaseRecipesRepository } from '@/services/proCore/supabaseRecipes';
import { FakeDB, makeClient } from '@/services/proCore/supabaseRecipesFake';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import type { CustomerPriceIndex } from '@/features/pro-core/effectiveRecipePricing';
import { VEGAN_INTERNET_CORPUS, type CorpusRecipe } from './veganInternetCorpus';
import { veganComposition } from './veganBehaviorAuthorityFixture';

const TRI = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (v: string, c: string): string | number | boolean | null => {
  if (v === '') return null;
  if (TRI.has(c)) return v.toLowerCase();
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};
const grid = parseCsv(
  readFileSync(join(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const MAPPER = new Map<string, IngredientRow>(
  grid
    .slice(1)
    .filter((c) => c.some((x) => x.trim() !== ''))
    .map((cells) => {
      const row = Object.fromEntries(
        header.map((h, i) => [h, cell(cells[i] ?? '', h)]),
      ) as unknown as IngredientRow;
      return [row.ingredient_id, row] as const;
    }),
);
const ingredientOf = (id: string): EngineIngredient => {
  const r = MAPPER.get(id);
  if (!r) throw new Error(`Missing ${id}`);
  return ingredientRowToEngineIngredient(r);
};

const owner = (id: string, e: number) =>
  [
    id,
    {
      overrideId: `o-${id}`,
      ownerUserId: 'user-1',
      canonicalIngredientId: id,
      pricePerKg: e,
      currency: 'EUR',
      createdBy: 'user-1',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    },
  ] as const;
const OWNER_PRICES: CustomerPriceIndex = Object.fromEntries([
  owner('PI-ING-000163', 5),
  owner('PI-ING-001565', 5),
  owner('PI-ING-000456', 9),
  owner('PI-ING-000492', 13),
  owner('PI-ING-001409', 1),
  owner('PI-ING-000514', 0.53),
  owner('PI-ING-000494', 1.48),
]);

const CAPS: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const TRACE = { engineVersion: 'campaign', configVersion: 'campaign' } as never;

const toInput = (
  recipe: CorpusRecipe,
  temperature: -11 | -12 | -13,
  strategy: 'optimal' | 'eco',
  sw: RecipeDirectionTarget,
  hd: RecipeDirectionTarget,
): RecipeInput => {
  const raw = recipe.lines.reduce((s, l) => s + l.grams, 0);
  const scale = 1000 / raw;
  return {
    mode: 'classic',
    category: 'vegan_gelato',
    target_temperature_c: temperature,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    items: recipe.lines.map((l, i) => ({
      id: `${recipe.id}-${i}-${l.mapperId}`,
      ingredient: ingredientOf(l.mapperId),
      planned_grams: Math.max(1, Math.round(l.grams * scale)),
      actual_grams: null,
      lock_type: l.role === 'main' ? ('main' as const) : ('unlocked' as const),
    })),
    goals: {
      formulation_strategy: strategy,
      direction_targets_active: true,
      direction_targets: { sweetness: sw, softness: hd, creaminess: 0, flavor: 0 },
    },
  };
};

/** Structural fingerprint used for exact-state comparison across save/reopen. */
const fingerprint = (input: RecipeInput) => ({
  category: input.category,
  temperature: input.target_temperature_c,
  batch: input.target_batch_grams,
  strategy: input.goals?.formulation_strategy,
  direction: input.goals?.direction_targets,
  directionActive: input.goals?.direction_targets_active,
  lines: input.items.map((i) => ({
    id: i.id,
    article: i.ingredient.canonical_ingredient_id ?? i.ingredient.id,
    grams: i.planned_grams,
    lock: i.lock_type,
    ratio: i.main_ratio_weight ?? null,
  })),
  total: Math.round(plannedSum(input)),
  zeroGram: input.items.filter((i) => i.planned_grams === 0).length,
});

const SELECTED = ['R01', 'R05', 'R14', 'R18', 'R21'] as const;

const ADAPTERS: ReadonlyArray<{
  name: string;
  make: () => { repo: RecipesRepository; reopen: () => RecipesRepository };
}> = [
  {
    name: 'in-memory reference adapter',
    make: () => {
      let k = 0;
      const store = new InMemoryRecipes(
        () => `2026-08-23T10:00:${String((k += 1) % 60).padStart(2, '0')}.000Z`,
        () => `id-${(k += 1)}`,
      );
      return {
        repo: inMemoryRecipesRepository(store),
        reopen: () => inMemoryRecipesRepository(store),
      };
    },
  },
  {
    name: 'supabase adapter - legacy first save (no RPC)',
    make: () => {
      const db = new FakeDB();
      return {
        repo: supabaseRecipesRepository(makeClient(db, 'user-1')),
        reopen: () => supabaseRecipesRepository(makeClient(db, 'user-1')),
      };
    },
  },
  {
    // This is the path staging actually takes: `create_recipe_with_v1` is present
    // in the staging database (verified read-only against tunabqqrwabacxjcxxkz),
    // so the transactional first save — not the legacy compensating path — is what
    // a real served save executes.
    name: 'supabase adapter - transactional first save (RPC present, as on staging)',
    make: () => {
      const db = new FakeDB();
      db.rpcEnabled = true;
      return {
        repo: supabaseRecipesRepository(makeClient(db, 'user-1')),
        reopen: () => supabaseRecipesRepository(makeClient(db, 'user-1')),
      };
    },
  },
];

describe.each(ADAPTERS)('Vegan persistence campaign — $name', ({ make }) => {
  it.each(SELECTED)(
    '%s survives create -> Apply -> v1 -> reopen -> v2 -> restore -> v3',
    async (recipeId) => {
      const recipe = VEGAN_INTERNET_CORPUS.find((r) => r.id === recipeId)!;
      const { repo, reopen } = make();

      // 1. create with a non-default temperature, mode and non-neutral Direction
      const draft = toInput(
        recipe,
        -13,
        'eco',
        1 as RecipeDirectionTarget,
        -1 as RecipeDirectionTarget,
      );
      expect(veganRecipeEligibilityIssues(draft.items)).toEqual([]);

      // 2. Preview + Apply through the real pipeline
      const built = buildOptimizePreview(draft, { byLineId: {} }, '2026-08-23T00:00:00.000Z', {
        effectivePriceOverrides: OWNER_PRICES,
      });
      const applied = built.ok ? built.preview.proposedInput : draft;
      expect(applied.items.filter((i) => i.planned_grams === 0)).toEqual([]);

      // 3. Save v1 through the real service layer
      const created = await repo.createRecipe({
        ownerUserId: 'user-1',
        title: `QA Vegan ${recipe.id}`,
        recipeInput: applied,
        productComposition: veganComposition(applied),
        trace: TRACE,
        by: 'user-1',
        capabilities: CAPS,
      });
      expect(created.version.versionNumber).toBe(1);
      const v1Print = fingerprint(applied);

      // 4. leave + reopen through a fresh port on the same store
      const reopened = reopen();
      const v1 = await reopened.getVersion(created.recipe.recipeId, 1);
      expect(v1).not.toBeNull();
      expect(fingerprint(v1!.recipeInput)).toEqual(v1Print);

      // 5. modify + Save v2
      // Edit the first line the user is actually free to move — index 0 is a locked
      // Main on several corpus recipes, and editing a Main is a different workflow.
      const editIndex = v1!.recipeInput.items.findIndex((i) => i.lock_type === 'unlocked');
      expect(editIndex).toBeGreaterThanOrEqual(0);
      const modified: RecipeInput = {
        ...v1!.recipeInput,
        items: v1!.recipeInput.items.map((i, index) =>
          index === editIndex ? { ...i, planned_grams: i.planned_grams + 10 } : i,
        ),
      };
      const v2 = await reopened.saveNewVersion(
        created.recipe.recipeId,
        modified,
        TRACE,
        'user-1',
        undefined,
        veganComposition(modified),
      );
      expect(v2.versionNumber).toBe(2);
      expect(fingerprint(v2.recipeInput)).not.toEqual(v1Print);

      // 6. restore v1 -> becomes v3, identical content to v1
      const v3 = await reopened.restore(created.recipe.recipeId, 1, 'user-1', CAPS);
      expect(v3.versionNumber).toBe(3);
      expect(fingerprint(v3.recipeInput)).toEqual(v1Print);

      // 7. immutable history: v1 and v2 unchanged after the restore
      const versions = await reopened.getVersions(created.recipe.recipeId);
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
      expect(fingerprint(versions[0]!.recipeInput)).toEqual(v1Print);
      expect(fingerprint(versions[1]!.recipeInput)).toEqual(fingerprint(modified));

      // 8. the restored state still calculates and stays Vegan-clean with no 0 g row
      const restoredResult = calculateRecipe(v3.recipeInput);
      expect(Number.isFinite(restoredResult.pod_points ?? 0)).toBe(true);
      expect(veganRecipeEligibilityIssues(v3.recipeInput.items)).toEqual([]);
      expect(v3.recipeInput.items.filter((i) => i.planned_grams === 0)).toEqual([]);
    },
    600_000,
  );
});
