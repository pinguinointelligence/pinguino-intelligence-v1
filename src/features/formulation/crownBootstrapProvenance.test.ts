/**
 * OWNER 2026-09-11 — PRO Crown bootstrap provenance, through the real store.
 *
 * The gram PRO's Crown seeds onto an empty line is a bootstrap, never a user
 * amount. The distinction is PROVENANCE, never value: a typed 1 g is not a
 * bootstrap, a seeded 1 g is. Only PRO's surface writes it; HOME never does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import { AUTO_CROWN_SEED, isCrownBootstrapLine } from './crownBootstrapProvenance';

const STRAWBERRIES = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
const WATERMELON = 'PI-ING-000405';

const st = () => useRecipeStore.getState();
const line = (id: string) => st().items.find((item) => item.id === id)!;
const provenance = (id: string) => line(id).amount_provenance ?? null;

const mainCapable = (snapshot: ProductBehaviorSnapshot): ProductBehaviorSnapshot => ({
  ...snapshot,
  mainClassification: 'MAIN_ALLOWED',
  mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
});

/** The managed pass: every current line resolved in the current context. */
const managedPass = () => {
  const snapshots = productBehaviorTestSnapshots(buildRecipeInput(st()));
  st().syncProductBehaviorSnapshots(
    Object.fromEntries(Object.entries(snapshots).map(([id, s]) => [id, mainCapable(s)])),
  );
};

/** PRO „Nowa receptura", each fruit through the picker door at `grams`. */
const open = (
  profile: 'gelato' | 'sorbet' | 'vegan' | 'protein',
  mapperIds: readonly string[],
  grams = 0,
): string[] => {
  st().startNewRecipe(profile);
  managedPass();
  return mapperIds.map((mapperId) => {
    const added = st().addIngredient(sorbetMapperIngredient(mapperId), grams);
    if (added.status !== 'added') throw new Error(`add failed: ${added.status}`);
    const snapshot = productBehaviorTestSnapshots(buildRecipeInput(st()))[added.lineId]!;
    st().setProductBehaviorSnapshot(added.lineId, {
      ...mainCapable(snapshot),
      lineId: added.lineId,
    });
    return added.lineId;
  });
};

beforeEach(() => {
  useConstraintStudioStore.getState().resetForTests();
});

describe('A — the PRO 0 g Crown seed is a bootstrap', () => {
  it('P1: 0 g → Crown → 1 g Main marked AUTO_CROWN_SEED (both PRO doors)', () => {
    const [viaMain, viaLock] = open('sorbet', [STRAWBERRIES, CRANBERRY]);
    st().setMainIngredient(viaMain!);
    st().setLockType(viaLock!, 'main');
    for (const id of [viaMain!, viaLock!]) {
      expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
      expect(provenance(id)).toBe(AUTO_CROWN_SEED);
      expect(isCrownBootstrapLine(line(id))).toBe(true);
    }
  });

  it('P7: positive grams already present before the Crown are never relabelled', () => {
    const [id] = open('sorbet', [STRAWBERRIES], 170);
    st().setMainIngredient(id!);
    expect(line(id!)).toMatchObject({ planned_grams: 170, lock_type: 'main' });
    expect(provenance(id!)).toBeNull();
  });

  it('re-asserting an existing crown keeps the bootstrap', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    st().setMainIngredient(id!);
    st().setLockType(id!, 'main');
    expect(provenance(id!)).toBe(AUTO_CROWN_SEED);
  });
});

describe('B — provenance, never value: a typed 1 g is the user amount', () => {
  it('P2: 1 g typed BEFORE the Crown is not a bootstrap', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setPlannedGrams(id!, 1);
    st().setMainIngredient(id!);
    expect(line(id!)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
    expect(provenance(id!)).toBeNull();
    expect(isCrownBootstrapLine(line(id!))).toBe(false);
  });

  it('P2: 1 g typed AFTER the Crown ends the bootstrap', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    managedPass();
    st().setPlannedGrams(id!, 1);
    expect(line(id!).planned_grams).toBe(1);
    expect(provenance(id!)).toBeNull();
  });

  it('P3: a typed 100 g keeps its user authority either way round', () => {
    const [before, after] = open('sorbet', [STRAWBERRIES, CRANBERRY]);
    st().setPlannedGrams(before!, 100);
    st().setMainIngredient(before!);
    st().setMainIngredient(after!);
    managedPass();
    st().setPlannedGrams(after!, 100);
    for (const id of [before!, after!]) {
      expect(line(id).planned_grams).toBe(100);
      expect(provenance(id)).toBeNull();
    }
  });
});

describe('C — a real lock always wins over the bootstrap', () => {
  it('P4: grams lock', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    st().setGramLock(id!, 1);
    expect(line(id!).grams_constraint).toEqual({ grams: 1 });
    expect(provenance(id!)).toBeNull();
    expect(isCrownBootstrapLine(line(id!))).toBe(false);
  });

  it('P5: percent lock', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    st().setPercentLock(id!, 20);
    expect(line(id!).percent_constraint).toEqual({ percent: 20 });
    expect(provenance(id!)).toBeNull();
  });

  it('P6: range lock', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    st().setRangeLock(id!, 1, 5);
    expect(line(id!).range_constraint).toEqual({ min_grams: 1, max_grams: 5 });
    expect(provenance(id!)).toBeNull();
  });

  it('a lock-type role change and Crown OFF end the bootstrap', () => {
    const [locked, uncrowned] = open('sorbet', [STRAWBERRIES, CRANBERRY]);
    st().setMainIngredient(locked!);
    st().setMainIngredient(uncrowned!);
    st().setLockType(locked!, 'grams');
    st().setStandardIngredient(uncrowned!);
    expect(provenance(locked!)).toBeNull();
    expect(line(uncrowned!)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
    expect(provenance(uncrowned!)).toBeNull();
  });
});

describe('D — Multi-Main: provenance is per line', () => {
  it('P8: three seeds are independent; editing one clears only that one', () => {
    const ids = open('sorbet', [STRAWBERRIES, CRANBERRY, WATERMELON]);
    for (const id of ids) st().setMainIngredient(id);
    for (const id of ids) expect(provenance(id)).toBe(AUTO_CROWN_SEED);
    managedPass();
    st().setPlannedGrams(ids[1]!, 40);
    expect(provenance(ids[0]!)).toBe(AUTO_CROWN_SEED);
    expect(provenance(ids[1]!)).toBeNull();
    expect(provenance(ids[2]!)).toBe(AUTO_CROWN_SEED);
  });

  it('a multi-line grams vector write ends the bootstrap of every line it writes', () => {
    const ids = open('sorbet', [STRAWBERRIES, CRANBERRY]);
    for (const id of ids) st().setMainIngredient(id);
    managedPass();
    st().setPlannedGramsVector({ [ids[0]!]: 12 });
    expect(provenance(ids[0]!)).toBeNull();
    expect(provenance(ids[1]!)).toBe(AUTO_CROWN_SEED);
  });
});

describe('E — a recalculation that sizes the seed ends it', () => {
  /** An on-batch draft whose first Main is still the untouched seed. */
  const onBatchWithSeed = () => {
    const [seed, other] = open('sorbet', [STRAWBERRIES, CRANBERRY]);
    st().setMainIngredient(seed!);
    managedPass();
    const sum = st().items.reduce((total, item) => total + item.planned_grams, 0);
    st().setPlannedGrams(other!, st().target_batch_grams - (sum - line(other!).planned_grams));
    return { seed: seed!, other: other! };
  };
  const written = (mutate: (input: RecipeInput) => RecipeInput) =>
    st().applyVerifiedRecipeInput(mutate(buildRecipeInput(st())), {});

  it('a written amount that differs from the seed removes the marker', () => {
    const { seed, other } = onBatchWithSeed();
    expect(provenance(seed)).toBe(AUTO_CROWN_SEED);
    const result = written((input) => ({
      ...input,
      items: input.items.map((item) =>
        item.id === seed
          ? { ...item, planned_grams: 101 }
          : item.id === other
            ? { ...item, planned_grams: item.planned_grams - 100 }
            : item,
      ),
    }));
    expect(result.ok).toBe(true);
    expect(line(seed).planned_grams).toBe(101);
    expect(provenance(seed)).toBeNull();
  });

  it('a write that leaves the seed amount untouched keeps it', () => {
    const { seed } = onBatchWithSeed();
    const result = written((input) => input);
    expect(result.ok).toBe(true);
    expect(provenance(seed)).toBe(AUTO_CROWN_SEED);
  });
});

describe('F — the distinction survives reload and reopen', () => {
  it('the persisted draft carries it; the transient Crown-OFF flag still does not', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    const persisted = recipePersistPartialize(st());
    expect(persisted.items.find((item) => item.id === id)?.amount_provenance).toBe(AUTO_CROWN_SEED);
    expect(persisted).not.toHaveProperty('crownAutoSeededLineIds');
  });

  it('reopening the saved lines keeps the bootstrap', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!);
    const saved: RecipeInput = {
      ...buildRecipeInput(st()),
      items: st().items.map((item) => structuredClone(item)),
    };
    st().loadRecipeInput(saved);
    expect(line(id!)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
    expect(provenance(id!)).toBe(AUTO_CROWN_SEED);
  });
});

describe('G — HOME never writes the PRO bootstrap', () => {
  it('HOME Sorbet is mass-neutral (owner OD-1, 2026-09-11) and unmarked', () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setMainIngredient(id!, 'home');
    expect(line(id!)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(provenance(id!)).toBeNull();
  });

  it('HOME Protein Crown stays mass-neutral and unmarked', () => {
    const [id] = open('protein', [WATERMELON]);
    st().setMainIngredient(id!, 'home');
    expect(line(id!)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(provenance(id!)).toBeNull();
  });

  it("HOME's own Crown control never marks a line", () => {
    const [id] = open('sorbet', [STRAWBERRIES]);
    st().setLockType(id!, 'main', 'home');
    expect(provenance(id!)).toBeNull();
  });
});
