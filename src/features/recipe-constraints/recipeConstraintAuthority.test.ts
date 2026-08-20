import { describe, expect, it } from 'vitest';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { starterMilkBase, starterLine } from './constraintFixtures';
import { evaluateRecipeConstraintAuthority } from './recipeConstraintAuthority';

describe('canonical exact-candidate constraint authority', () => {
  it('accepts the existing native-safe starter through the synthetic fixture seam', () => {
    const recipe = starterMilkBase();
    expect(
      evaluateRecipeConstraintAuthority({ recipe, requireProductBehavior: false }).valid,
    ).toBe(true);
  });

  it('rejects a native Engine violation independently of ProductBehavior', () => {
    const recipe = starterMilkBase();
    const items = recipe.items.map((item) =>
      item.id === starterLine('sucrose')
        ? { ...item, planned_grams: item.planned_grams + 300 }
        : item,
    );
    const invalid = {
      ...recipe,
      items,
      target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
    };
    expect(
      evaluateRecipeConstraintAuthority({ recipe: invalid, requireProductBehavior: false })
        .issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'engine' })]));
  });

  it('fails closed when a managed technical line has no current ProductBehavior', () => {
    const recipe = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(recipe);
    delete snapshots[recipe.items[0]!.id];
    const verdict = evaluateRecipeConstraintAuthority({ recipe, snapshots });
    expect(verdict.valid).toBe(false);
    expect(verdict.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'product_behavior',
          code: 'product_behavior_invalid',
        }),
      ]),
    );
  });

  it('rejects frozen profile evidence that does not include the selected profile', () => {
    const recipe = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(recipe);
    const lineId = recipe.items[0]!.id;
    snapshots[lineId] = {
      ...snapshots[lineId]!,
      sharedFacts: {
        ...snapshots[lineId]!.sharedFacts!,
        profileEligibility: ['sorbet'],
      },
    };
    expect(evaluateRecipeConstraintAuthority({ recipe, snapshots }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'profile', code: 'profile_not_eligible' }),
      ]),
    );
  });
});
