import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { InMemoryRecipes } from './inMemoryRecipes';
import { InMemoryProduction } from './inMemoryProduction';
import { InMemoryCosts, type NewCostEntry } from './inMemoryCosts';
import { inMemoryRecipesRepository } from './recipesRepository';
import { inMemoryProductionRepository } from './productionRepository';
import { inMemoryCostsRepository } from './costsRepository';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const NOW = '2026-07-12T10:00:00.000Z';
const PRO: RecipeCapabilities = { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: null, canViewExactGrams: true };
const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;

describe('in-memory adapters conform to the async repository ports', () => {
  it('RecipesRepository round-trips create → list → versions', async () => {
    let k = 0;
    const repo = inMemoryRecipesRepository(new InMemoryRecipes(() => NOW, () => `id-${(k += 1)}`));
    const { recipe } = await repo.createRecipe({ ownerUserId: 'u1', title: 'Vanilla', recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]), trace: TRACE, by: 'u1', capabilities: PRO });
    await repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 700), item('b', 'Sugar', 400)]), TRACE, 'u1');
    expect((await repo.listRecipes('u1')).map((r) => r.recipeId)).toEqual([recipe.recipeId]);
    expect(await repo.getVersions(recipe.recipeId)).toHaveLength(2);
  });

  it('ProductionRepository plans + transitions through the port', async () => {
    let k = 0;
    const recipes = new InMemoryRecipes(() => NOW, () => `id-${(k += 1)}`);
    const { version } = recipes.createRecipe({ ownerUserId: 'u1', title: 'V', recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]), trace: TRACE, by: 'u1', capabilities: PRO });
    const repo = inMemoryProductionRepository(new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`));
    const run = await repo.createRun({ ownerUserId: 'u1', version, target: { kind: 'weight_g', grams: 5000 }, capabilities: productionCapabilitiesFor('pro'), by: 'u1' });
    expect(run.recipeVersionId).toBe(version.versionId);
    const planned = await repo.transition(run.runId, 'planned', 'u1');
    expect(planned.status).toBe('planned');
    expect((await repo.listRuns('u1')).total).toBe(1);
  });

  it('CostsRepository adds entries + builds an immutable snapshot through the port', async () => {
    let k = 0;
    const repo = inMemoryCostsRepository(new InMemoryCosts(() => NOW, () => `id-${(k += 1)}`));
    const base: NewCostEntry = { ownerUserId: 'u1', ingredientId: 'a', ingredientName: 'Milk', supplier: null, purchaseQuantity: 2, purchaseUnit: 'kg', densityGPerMl: null, unitWeightG: null, unitsPerPackage: null, price: 10, currency: 'EUR', priceIncludesTax: false, taxRatePercent: null, effectiveFrom: '2026-01-01', expiresAt: null, note: null, createdBy: 'u1' };
    await repo.addEntry(base);
    const snap = await repo.buildSnapshot({ ownerUserId: 'u1', recipeId: 'r', recipeVersionId: 'v1', lines: [{ ingredientId: 'a', ingredientName: 'Milk', grams: 1000 }], currency: 'EUR', basis: 'net', asOf: '2026-03-01', engineVersion: 'e1', configVersion: 'c1', by: 'u1' });
    expect(snap.complete).toBe(true);
    expect(snap.totalCost).toBeCloseTo(5, 10);
    expect((await repo.listSnapshots('u1'))).toHaveLength(1);
  });
});
