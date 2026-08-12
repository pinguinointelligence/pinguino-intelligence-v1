import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  buildRecipeVersion,
  canCreateNewRecipe,
  compareVersions,
  resolveRecipeCapabilities,
  restoreVersion,
} from '@/features/pro-core/recipeVersioning';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  attachPracticalRecipeAudit,
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { InMemoryRecipes } from './inMemoryRecipes';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const NOW = '2026-07-12T10:00:00.000Z';
const COMPOSITION: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: ['a'],
  toppings: [
    {
      id: 'top-milk',
      ingredient: {
        id: 'PI-ING-MILK',
        canonical_ingredient_id: 'PI-ING-MILK',
        name: 'Milk topping',
        category: 'dairy',
        composition: { water: 87, total_solids: 13 },
        source_type: 'manual',
      } as unknown as RecipeCompositionMetadata['toppings'][number]['ingredient'],
      planned_grams: 70,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    },
  ],
  migrationAmbiguities: [],
};

// The domain only reads item.id / item.ingredient.name / item.planned_grams + top-level batch.
const item = (id: string, name: string, grams: number) => ({
  id,
  ingredient: { name },
  planned_grams: grams,
});
const input = (
  batch: number,
  items: Array<{ id: string; ingredient: { name: string }; planned_grams: number }>,
): RecipeInput =>
  ({
    items,
    mode: 'gelato',
    category: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
  }) as unknown as RecipeInput;

const PRO: RecipeCapabilities = {
  canSaveRecipe: true,
  canViewRecipeVersions: true,
  canRestoreRecipeVersion: true,
  maxSavedRecipes: null,
  canViewExactGrams: true,
};
const HOME: RecipeCapabilities = { ...PRO, maxSavedRecipes: 1 };
const DEMO: RecipeCapabilities = {
  canSaveRecipe: false,
  canViewRecipeVersions: false,
  canRestoreRecipeVersion: false,
  maxSavedRecipes: 0,
  canViewExactGrams: false,
};

describe('pure versioning domain', () => {
  it('a version snapshot is frozen — mutating the source input never changes it', () => {
    const src = input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]);
    const v = buildRecipeVersion(
      {
        recipeId: 'r',
        ownerUserId: 'u',
        versionNumber: 1,
        recipeInput: src,
        trace: TRACE,
        source: 'manual',
        createdBy: 'u',
        createdAt: NOW,
      },
      'v1',
    );
    src.items[0]!.planned_grams = 999; // mutate the caller's object afterwards
    expect(v.recipeInput.items[0]?.planned_grams).toBe(600);
    expect(v.totalBatchG).toBe(1000);
    expect(v.engineVersion).toBe('e1');
  });

  it('restoreVersion produces a NEW version derived from the target (history preserved)', () => {
    const v1 = buildRecipeVersion(
      {
        recipeId: 'r',
        ownerUserId: 'u',
        versionNumber: 1,
        recipeInput: input(1000, [item('a', 'Milk', 600)]),
        trace: TRACE,
        source: 'manual',
        createdBy: 'u',
        createdAt: NOW,
      },
      'v1',
    );
    const v2 = buildRecipeVersion(
      {
        recipeId: 'r',
        ownerUserId: 'u',
        versionNumber: 2,
        recipeInput: input(1200, [item('a', 'Milk', 700)]),
        trace: TRACE,
        source: 'manual',
        createdBy: 'u',
        createdAt: NOW,
      },
      'v2',
    );
    const restored = restoreVersion([v1, v2], 1, 'u', NOW, 'v3');
    expect(restored.versionNumber).toBe(3);
    expect(restored.source).toBe('restored');
    expect(restored.restoredFromVersion).toBe(1);
    expect(restored.recipeInput.items[0]?.planned_grams).toBe(600); // v1's values
  });

  it('freezes and restores the product composition sidecar with its recipe version', () => {
    const source = JSON.parse(JSON.stringify(COMPOSITION)) as RecipeCompositionMetadata;
    const v1 = buildRecipeVersion(
      {
        recipeId: 'r', ownerUserId: 'u', versionNumber: 1,
        recipeInput: input(1000, [item('a', 'Milk', 1000)]),
        productComposition: source,
        trace: TRACE, source: 'manual', createdBy: 'u', createdAt: NOW,
      },
      'v1',
    );
    source.toppings[0]!.planned_grams = 999;
    const v2 = buildRecipeVersion(
      {
        recipeId: 'r', ownerUserId: 'u', versionNumber: 2,
        recipeInput: input(1200, [item('a', 'Milk', 1200)]),
        productComposition: { ...COMPOSITION, toppings: [] },
        trace: TRACE, source: 'manual', createdBy: 'u', createdAt: NOW,
      },
      'v2',
    );
    const restored = restoreVersion([v1, v2], 1, 'u', NOW, 'v3');
    expect(v1.productComposition?.toppings[0]?.planned_grams).toBe(70);
    expect(restored.productComposition).toEqual(COMPOSITION);
    expect(restored.productComposition).not.toBe(v1.productComposition);
  });

  it('compareVersions reports added/removed/changed/unchanged + identical', () => {
    const a = buildRecipeVersion(
      {
        recipeId: 'r',
        ownerUserId: 'u',
        versionNumber: 1,
        recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]),
        trace: TRACE,
        source: 'manual',
        createdBy: 'u',
        createdAt: NOW,
      },
      'a',
    );
    const b = buildRecipeVersion(
      {
        recipeId: 'r',
        ownerUserId: 'u',
        versionNumber: 2,
        recipeInput: input(1000, [item('a', 'Milk', 650), item('c', 'Cream', 350)]),
        trace: TRACE,
        source: 'manual',
        createdBy: 'u',
        createdAt: NOW,
      },
      'b',
    );
    const cmp = compareVersions(a, b);
    expect(cmp.identical).toBe(false);
    const change = (k: string) => cmp.lines.find((l) => l.key === k)?.change;
    expect(change('a')).toBe('changed');
    expect(change('b')).toBe('removed');
    expect(change('c')).toBe('added');
    expect(compareVersions(a, a).identical).toBe(true);
  });

  it('canCreateNewRecipe enforces the capability limit (versions do not count)', () => {
    expect(canCreateNewRecipe(0, HOME).allowed).toBe(true);
    expect(canCreateNewRecipe(1, HOME).allowed).toBe(false); // Home limit 1
    expect(canCreateNewRecipe(5, PRO).allowed).toBe(true); // unlimited
    expect(
      canCreateNewRecipe(
        0,
        resolveRecipeCapabilities({
          canSaveRecipe: false,
          canViewRecipeVersions: false,
          canViewExactGrams: false,
          maxSavedRecipes: 0,
        }),
      ).allowed,
    ).toBe(false);
  });
});

describe('in-memory adapter', () => {
  let svc: InMemoryRecipes;
  let k: number;
  beforeEach(() => {
    k = 0;
    svc = new InMemoryRecipes(
      () => NOW,
      () => `id-${(k += 1)}`,
    );
  });

  const create = (caps = PRO, over = {}) =>
    svc.createRecipe({
      ownerUserId: 'u1',
      title: 'Vanilla',
      recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]),
      trace: TRACE,
      by: 'u1',
      capabilities: caps,
      ...over,
    });

  it('Demo cannot save (never receives a save-capable exact payload)', () => {
    expect(() => create(DEMO)).toThrow(/cannot save/i);
  });

  it('Home is limited to one recipe aggregate; versioning the existing one still works', () => {
    const { recipe } = create(HOME);
    expect(() =>
      svc.createRecipe({
        ownerUserId: 'u1',
        title: 'Second',
        recipeInput: input(500, [item('a', 'Milk', 500)]),
        trace: TRACE,
        by: 'u1',
        capabilities: HOME,
      }),
    ).toThrow(/limit reached/i);
    // but a new VERSION of the existing recipe is allowed
    const v2 = svc.saveNewVersion(
      recipe.recipeId,
      input(1100, [item('a', 'Milk', 700), item('b', 'Sugar', 400)]),
      TRACE,
      'u1',
    );
    expect(v2.versionNumber).toBe(2);
  });

  it('editing creates a new version; the prior version stays byte-for-byte identical', () => {
    const { recipe } = create();
    const v1Before = JSON.stringify(svc.getVersion(recipe.recipeId, 1)!.recipeInput);
    svc.saveNewVersion(
      recipe.recipeId,
      input(1500, [item('a', 'Milk', 900), item('b', 'Sugar', 600)]),
      TRACE,
      'u1',
    );
    expect(svc.getRecipe(recipe.recipeId)?.latestVersionNumber).toBe(2);
    expect(JSON.stringify(svc.getVersion(recipe.recipeId, 1)!.recipeInput)).toBe(v1Before); // unchanged
    expect(svc.getVersions(recipe.recipeId)).toHaveLength(2);
  });

  it('restore creates a new latest version from an old snapshot (no history rewind)', () => {
    const { recipe } = create();
    svc.saveNewVersion(recipe.recipeId, input(1500, [item('a', 'Milk', 900)]), TRACE, 'u1');
    const v3 = svc.restore(recipe.recipeId, 1, 'u1', PRO);
    expect(v3.versionNumber).toBe(3);
    expect(v3.restoredFromVersion).toBe(1);
    expect(svc.getVersions(recipe.recipeId)).toHaveLength(3); // v1 + v2 + v3, nothing deleted
  });

  it('restores the same verified practical vector and audit as an immutable new version', () => {
    const practical = practicalizeRecipeCandidate(ownerSameInputRecipe(), { byLineId: {} });
    expect(practical.ok).toBe(true);
    if (!practical.ok) return;
    const saved = attachPracticalRecipeAudit(
      practical.audit.executableInput,
      practical.audit.exactInput,
      NOW,
    );
    const { recipe } = svc.createRecipe({
      ownerUserId: 'u1',
      title: 'Practical G17',
      recipeInput: saved,
      trace: TRACE,
      by: 'u1',
      capabilities: PRO,
    });
    svc.saveNewVersion(recipe.recipeId, input(1200, [item('a', 'Milk', 1200)]), TRACE, 'u1');
    const restored = svc.restore(recipe.recipeId, 1, 'u1', PRO);
    const audit = readPracticalRecipeAudit(restored.recipeInput);
    const taraLine = restored.recipeInput.items.find((line) => line.id === 'owner:tara_gum');
    expect(restored.restoredFromVersion).toBe(1);
    expect(taraLine?.planned_grams).toBe(2);
    expect(taraLine).toBeDefined();
    expect(audit?.exactGramsByLineId[taraLine!.id]).toBe(1.9);
    expect(practicalRecipeAuditMatchesInput(restored.recipeInput, audit)).toBe(true);
  });

  it('rename + archive; owner isolation on list', () => {
    const { recipe } = create();
    svc.renameRecipe(recipe.recipeId, 'Vanilla Base');
    expect(svc.getRecipe(recipe.recipeId)?.title).toBe('Vanilla Base');
    svc.archiveRecipe(recipe.recipeId, true);
    expect(svc.listRecipes('u1')).toHaveLength(0); // archived hidden by default
    expect(svc.listRecipes('u1', { includeArchived: true })).toHaveLength(1);
    expect(svc.listRecipes('someone-else')).toHaveLength(0); // owner isolation
  });

  it('there is no auto-save method — saving is always explicit', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(svc));
    expect(methods).not.toContain('autoSave');
    expect(methods).toContain('createRecipe');
    expect(methods).toContain('saveNewVersion');
  });
});
