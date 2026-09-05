import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { productBehaviorRequiredLineIds } from '@/features/product-intelligence/productBehaviorAccess';
import { starterMilkBase, withGrams } from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { CROWN_AUTO_SEED_GRAMS, crownOffPlannedGrams, crownOnPlannedGrams } from './crownAutoSeed';

const lineId = (input: RecipeInput) => input.items[0]!.id;
const grams = (id: string) =>
  useRecipeStore.getState().items.find((item) => item.id === id)!.planned_grams;
const seededIds = () => useRecipeStore.getState().crownAutoSeededLineIds;

const loadWith = (lineGrams: number): string => {
  const base = starterMilkBase();
  const id = lineId(base);
  const input = withGrams(base, id, lineGrams);
  useRecipeStore.getState().loadRecipeInput(input);
  return id;
};

describe('crown auto-seed contract (pure)', () => {
  it('seeds exactly one gram from zero and marks the provenance', () => {
    expect(crownOnPlannedGrams(0)).toEqual({ plannedGrams: 1, autoSeeded: true });
    expect(CROWN_AUTO_SEED_GRAMS).toBe(1);
  });

  it('preserves any existing amount and claims no provenance', () => {
    expect(crownOnPlannedGrams(170)).toEqual({ plannedGrams: 170, autoSeeded: false });
    expect(crownOnPlannedGrams(1)).toEqual({ plannedGrams: 1, autoSeeded: false });
  });

  it('restores zero only for an untouched seeded gram', () => {
    expect(crownOffPlannedGrams(1, true)).toBe(0);
    expect(crownOffPlannedGrams(50, true)).toBe(50);
    expect(crownOffPlannedGrams(1, false)).toBe(1);
    expect(crownOffPlannedGrams(170, false)).toBe(170);
  });
});

describe('OWNER P0 — Crown toggle at 0 g', () => {
  beforeEach(() => {
    useRecipeStore.setState({ productBehaviorSnapshots: {} });
  });

  it('0 -> Crown -> 1', () => {
    const id = loadWith(0);
    expect(grams(id)).toBe(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);
    expect(seededIds()).toContain(id);
  });

  it('the displayed/store 1 g is the exact canonical Engine input', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);

    const stored = useRecipeStore.getState().items.find((item) => item.id === id)!;
    const engine = buildRecipeInput(useRecipeStore.getState()).items.find(
      (item) => item.id === id,
    )!;

    expect(stored).toMatchObject({ planned_grams: 1, lock_type: 'main', main_ratio_weight: 1 });
    expect(engine).toMatchObject({ planned_grams: 1, lock_type: 'main', main_ratio_weight: 1 });
    expect(engine.planned_grams).toBe(stored.planned_grams);
  });

  it('0 -> Crown -> 1 -> off -> 0', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(0);
    expect(seededIds()).not.toContain(id);
  });

  it('0 -> Crown -> 1 -> off -> 0 can immediately re-arm Crown without a PB deadlock', () => {
    const id = loadWith(0);
    const snapshots = productBehaviorTestSnapshots(buildRecipeInput(useRecipeStore.getState()));
    useRecipeStore.setState({
      productBehaviorSnapshots: {
        ...snapshots,
        [id]: {
          ...snapshots[id]!,
          mainClassification: 'MAIN_ALLOWED',
          mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
        },
      },
    });

    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);
    // The managed PB pass resolves the positive Main line before the next
    // customer action, exactly as the served Workbench does.
    useRecipeStore.getState().syncProductBehaviorSnapshots({
      ...snapshots,
      [id]: {
        ...snapshots[id]!,
        mainClassification: 'MAIN_ALLOWED',
        mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
      },
    });

    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(0);
    expect(useRecipeStore.getState().productBehaviorSnapshots[id]).toBeUndefined();

    useRecipeStore.getState().setMainIngredient(id);
    expect(useRecipeStore.getState().items.find((item) => item.id === id)).toMatchObject({
      planned_grams: 1,
      lock_type: 'main',
      main_ratio_weight: 1,
    });
    expect(seededIds()).toContain(id);
  });

  it('170 -> Crown -> off -> 170', () => {
    const id = loadWith(170);
    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(170);
    expect(seededIds()).not.toContain(id);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(170);
  });

  it('0 -> Crown -> 1 -> user 50 -> off -> 50', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);
    useRecipeStore.getState().setPlannedGrams(id, 50);
    expect(grams(id)).toBe(50);
    expect(seededIds()).not.toContain(id);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(50);
  });

  it('ON -> edit -> OFF -> ON uses the current grams and creates fresh Main metadata', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    useRecipeStore.getState().setPlannedGrams(id, 50);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(useRecipeStore.getState().items.find((item) => item.id === id)).toMatchObject({
      planned_grams: 50,
      lock_type: 'unlocked',
    });
    expect(
      useRecipeStore.getState().items.find((item) => item.id === id)?.main_ratio_weight,
    ).toBeUndefined();

    const snapshots = productBehaviorTestSnapshots(buildRecipeInput(useRecipeStore.getState()));
    useRecipeStore.setState({
      productBehaviorSnapshots: {
        ...snapshots,
        [id]: {
          ...snapshots[id]!,
          mainClassification: 'MAIN_ALLOWED',
          mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
        },
      },
    });
    useRecipeStore.getState().setMainIngredient(id);
    expect(useRecipeStore.getState().items.find((item) => item.id === id)).toMatchObject({
      planned_grams: 50,
      lock_type: 'main',
      main_ratio_weight: 1,
    });
    expect(seededIds()).not.toContain(id);
  });

  it('a deliberately typed 1 g is the user amount, not the seed', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    useRecipeStore.getState().setPlannedGrams(id, 1);
    expect(seededIds()).not.toContain(id);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(1);
  });

  it('Crown at 0 g never disables grams editing', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    for (const value of [50, 3, 1, 240, 7]) {
      useRecipeStore.getState().setPlannedGrams(id, value);
      expect(grams(id)).toBe(value);
    }
  });

  it('delete → re-add → Crown creates fresh Main state without stale line metadata', () => {
    const id = loadWith(0);
    const ingredient = structuredClone(
      useRecipeStore.getState().items.find((item) => item.id === id)!.ingredient,
    );
    useRecipeStore.getState().setMainIngredient(id);
    expect(seededIds()).toContain(id);

    useRecipeStore.getState().removeItem(id);
    expect(useRecipeStore.getState().items.some((item) => item.id === id)).toBe(false);
    expect(seededIds()).not.toContain(id);

    const added = useRecipeStore.getState().addIngredient(ingredient, 0);
    expect(added.status).toBe('added');
    if (added.status !== 'added') return;
    expect(added.lineId).not.toBe(id);
    useRecipeStore.getState().setMainIngredient(added.lineId);
    expect(useRecipeStore.getState().items.find((item) => item.id === added.lineId)).toMatchObject({
      planned_grams: 1,
      lock_type: 'main',
      main_ratio_weight: 1,
    });
  });

  it('makes the crowned line a ProductBehavior required line, so the role transition is revalidated', () => {
    // The permanent block came from a 0 g crowned line never being required:
    // no revalidation pass revisits it, so its role-transition snapshot stays
    // REVALIDATION_REQUIRED for ever and every grams write is refused.
    const id = loadWith(0);
    expect(
      productBehaviorRequiredLineIds({ items: useRecipeStore.getState().items }),
    ).not.toContain(id);
    useRecipeStore.getState().setMainIngredient(id);
    expect(productBehaviorRequiredLineIds({ items: useRecipeStore.getState().items })).toContain(
      id,
    );
  });

  it('accepts an immediate grams write on a managed workspace once the seeded line is revalidated', () => {
    // The seed is what makes the revalidation reachable: a 0 g line is not a
    // required line, so the Pro workspace pass that resolves a role-transition
    // snapshot never sees it. At 1 g it does, exactly like any other line.
    const id = loadWith(0);
    const base = starterMilkBase();
    const mainCapableSnapshots = () => {
      const snapshots = productBehaviorTestSnapshots({
        ...base,
        items: useRecipeStore.getState().items,
      });
      return {
        ...snapshots,
        [id]: {
          ...snapshots[id]!,
          mainClassification: 'MAIN_ALLOWED' as const,
          mainCapability: 'MAIN_CAPABLE_UNCALIBRATED' as const,
        },
      };
    };
    useRecipeStore.setState({ productBehaviorSnapshots: mainCapableSnapshots() });

    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);
    expect(productBehaviorRequiredLineIds({ items: useRecipeStore.getState().items })).toContain(
      id,
    );

    // What the existing Pro revalidation pass does for every required line.
    useRecipeStore.getState().syncProductBehaviorSnapshots(mainCapableSnapshots());
    useRecipeStore.getState().setPlannedGrams(id, 42);
    expect(grams(id)).toBe(42);
  });

  it('applies the same contract to the lower-level lock-type role write', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setLockType(id, 'main');
    expect(grams(id)).toBe(1);
    expect(seededIds()).toContain(id);
    useRecipeStore.getState().setLockType(id, 'unlocked');
    expect(grams(id)).toBe(0);
    expect(seededIds()).not.toContain(id);
  });

  it('does not restore zero when the crown never seeded the amount', () => {
    const id = loadWith(170);
    useRecipeStore.getState().setLockType(id, 'main');
    expect(grams(id)).toBe(170);
    useRecipeStore.getState().setLockType(id, 'unlocked');
    expect(grams(id)).toBe(170);
  });

  it('re-asserting a crown the line already wears keeps the seed provenance', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    useRecipeStore.getState().setMainIngredient(id);
    useRecipeStore.getState().setLockType(id, 'main');
    expect(grams(id)).toBe(1);
    expect(seededIds()).toContain(id);
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(0);
  });

  it('a multi-line grams vector write ends the seed provenance', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(seededIds()).toContain(id);
    useRecipeStore.getState().setPlannedGramsVector({ [id]: 12 });
    expect(grams(id)).toBe(12);
    expect(seededIds()).not.toContain(id);
  });

  it('never writes a user-intent anchor for a gram the crown seeded', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    const seeded = useRecipeStore.getState().items.find((item) => item.id === id)!;
    expect(seeded.user_intent_anchor_grams).toBeUndefined();
    useRecipeStore.getState().setStandardIngredient(id);
    const restored = useRecipeStore.getState().items.find((item) => item.id === id)!;
    expect(restored.planned_grams).toBe(0);
    expect(restored.user_intent_anchor_grams).toBeUndefined();
  });
});

describe('the provenance flag is never business data', () => {
  it('is absent from the persisted draft slice', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(seededIds()).toContain(id);
    const persisted = recipePersistPartialize(useRecipeStore.getState());
    expect(persisted).not.toHaveProperty('crownAutoSeededLineIds');
    expect(JSON.stringify(persisted)).not.toContain('crownAutoSeed');
  });

  it('never reaches a recipe line, so no saved payload can carry it', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    const line = useRecipeStore.getState().items.find((item) => item.id === id)!;
    expect(JSON.stringify(line)).not.toContain('crownAutoSeed');
    expect(JSON.stringify(line)).not.toContain('autoSeed');
  });

  it('save/reopen does not restore the flag, so the reopened gram is a real amount', () => {
    const id = loadWith(0);
    useRecipeStore.getState().setMainIngredient(id);
    expect(grams(id)).toBe(1);

    // Reopen exactly what a save would have stored: the amounts, no provenance.
    const saved: RecipeInput = {
      mode: useRecipeStore.getState().mode,
      category: useRecipeStore.getState().category,
      target_temperature_c: useRecipeStore.getState().target_temperature_c,
      target_batch_grams: useRecipeStore.getState().target_batch_grams,
      machine_capacity_grams: useRecipeStore.getState().machine_capacity_grams,
      items: useRecipeStore.getState().items.map((item) => ({ ...item })),
    };
    useRecipeStore.getState().loadRecipeInput(saved);

    expect(seededIds()).toEqual([]);
    expect(grams(id)).toBe(1);
    // The reopened crown holds a real 1 g, so removing it preserves that gram.
    useRecipeStore.getState().setStandardIngredient(id);
    expect(grams(id)).toBe(1);
  });
});

describe.each([
  ['Gelato', 'gelato'],
  ['Sorbet', 'sorbet'],
  ['Vegan', 'vegan'],
  ['Protein', 'protein'],
] as const)('%s Crown lifecycle', (_profileName, visibleProductType) => {
  it.each(['optimal', 'eco'] as const)(
    'keeps auto-1 g, OFF→ON, gram edits and save/reopen canonical in %s',
    (formulationStrategy) => {
      const starter = buildCanonicalNewRecipeStarter({
        visibleProductType,
        servingModeId: 'temp_minus_11',
        formulationStrategy,
        targetBatchGrams: 1_000,
      });
      const first = structuredClone(starter.items[0]!);
      const second = structuredClone(starter.items[1]!);
      first.id = `${visibleProductType}-${formulationStrategy}-main-a`;
      first.planned_grams = 120;
      first.lock_type = 'unlocked';
      second.id = `${visibleProductType}-${formulationStrategy}-main-b`;
      second.planned_grams = 0;
      second.lock_type = 'unlocked';
      useRecipeStore.getState().loadRecipeInput({
        mode: 'classic',
        category: starter.category,
        target_temperature_c: starter.targetTemperatureC,
        target_batch_grams: starter.targetBatchGrams,
        machine_capacity_grams: null,
        goals: { formulation_strategy: formulationStrategy },
        items: [first, second, ...starter.items.slice(2)],
      });
      const syncMainCapableSnapshots = () => {
        const snapshots = productBehaviorTestSnapshots(buildRecipeInput(useRecipeStore.getState()));
        for (const lineId of [first.id, second.id]) {
          snapshots[lineId] = {
            ...snapshots[lineId]!,
            mainClassification: 'MAIN_ALLOWED',
            mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
          };
        }
        useRecipeStore.getState().syncProductBehaviorSnapshots(snapshots);
      };
      syncMainCapableSnapshots();

      useRecipeStore.getState().setMainIngredient(first.id);
      useRecipeStore.getState().setMainIngredient(second.id);
      const autoSeeded = buildRecipeInput(useRecipeStore.getState());
      expect(
        autoSeeded.items
          .filter((item) => item.id === first.id || item.id === second.id)
          .map((item) => [item.id, item.planned_grams, item.lock_type, item.main_ratio_weight]),
      ).toEqual([
        [first.id, 120, 'main', 1],
        [second.id, 1, 'main', 1],
      ]);

      useRecipeStore.getState().setStandardIngredient(second.id);
      expect(useRecipeStore.getState().items.find((item) => item.id === second.id)).toMatchObject({
        planned_grams: 0,
        lock_type: 'unlocked',
      });
      expect(
        useRecipeStore.getState().items.find((item) => item.id === second.id)?.main_ratio_weight,
      ).toBeUndefined();

      // Each role transition is resolved before the next user action, exactly
      // as the managed Workbench does through ProductBehavior authority.
      syncMainCapableSnapshots();
      useRecipeStore.getState().setMainIngredient(second.id);
      expect(grams(second.id)).toBe(1);
      syncMainCapableSnapshots();
      for (const editedGrams of [2, 5, 10, 50]) {
        useRecipeStore.getState().setPlannedGrams(second.id, editedGrams);
        const engineLine = buildRecipeInput(useRecipeStore.getState()).items.find(
          (item) => item.id === second.id,
        );
        expect(engineLine).toMatchObject({
          planned_grams: editedGrams,
          lock_type: 'main',
          main_ratio_weight: 1,
        });
      }

      const saved = buildRecipeInput(useRecipeStore.getState());
      useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
        savedId: `${visibleProductType}-${formulationStrategy}-saved`,
        savedName: 'Crown lifecycle',
        versionNumber: 1,
      });
      const reopened = buildRecipeInput(useRecipeStore.getState());
      expect(reopened.category).toBe(saved.category);
      expect(reopened.goals?.formulation_strategy).toBe(formulationStrategy);
      expect(reopened.items.find((item) => item.id === second.id)).toMatchObject({
        planned_grams: 50,
        lock_type: 'main',
        main_ratio_weight: 1,
      });
      expect(seededIds()).toEqual([]);
    },
  );
});
