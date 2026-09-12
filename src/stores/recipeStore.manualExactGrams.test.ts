import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildDraftCandidateVector } from '@/features/constraint-studio/draftCandidateVector';
import {
  selectCanonicalDraft,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildRecipeVersion, restoreVersion } from '@/features/pro-core/recipeVersioning';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import type { RecipeState } from './recipeStore';
import { useRecipeStore } from './recipeStore';

const line = () => useRecipeStore.getState().items[0]!;
const lock = () => selectCanonicalDraft().constraints.byLineId[line().id];

describe('Owner manual grams = exact quantity intent', () => {
  let priorRecipe: RecipeState;
  let priorConstraints: ReturnType<typeof useConstraintStudioStore.getState>;

  beforeEach(() => {
    priorRecipe = useRecipeStore.getState();
    priorConstraints = useConstraintStudioStore.getState();
    useConstraintStudioStore.getState().resetForTests();
    useRecipeStore.getState().loadRecipeInput(ownerSameInputRecipe());
  });

  afterEach(() => {
    useRecipeStore.setState(priorRecipe, true);
    useConstraintStudioStore.setState(priorConstraints, true);
  });

  it('MGAL-STORE-01 atomically stores a real user grams change as an exact lock', () => {
    const before = line();

    useRecipeStore.getState().setExactGrams(before.id, before.planned_grams + 7);

    expect(line()).toMatchObject({
      planned_grams: before.planned_grams + 7,
      lock_type: 'grams',
      grams_constraint: { grams: before.planned_grams + 7 },
    });
    expect(lock()).toEqual({ mode: 'locked', grams: before.planned_grams + 7 });
  });

  it('MGAL-STORE-02 a manual unlock stays unlocked until another amount edit', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 1);

    useConstraintStudioStore.getState().toggleLock(id);

    expect(line().lock_type).toBe('unlocked');
    expect(line().grams_constraint).toBeUndefined();
    expect(lock()).toBeUndefined();
  });

  it('MGAL-STORE-03 the next real manual edit after unlock restores the exact lock', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 1);
    useConstraintStudioStore.getState().toggleLock(id);

    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 1);

    expect(line().lock_type).toBe('grams');
    expect(line().grams_constraint).toEqual({ grams: line().planned_grams });
    expect(lock()).toEqual({ mode: 'locked', grams: line().planned_grams });
  });

  it('MGAL-STORE-04 a crowned line keeps Main while gaining an exact grams sidecar', () => {
    const id = line().id;
    useRecipeStore.setState({
      items: useRecipeStore
        .getState()
        .items.map((item) => (item.id === id ? { ...item, lock_type: 'main' as const } : item)),
    });
    const next = line().planned_grams + 3;

    useRecipeStore.getState().setExactGrams(id, next);

    expect(line()).toMatchObject({
      planned_grams: next,
      lock_type: 'main',
      grams_constraint: { grams: next },
    });
    expect(lock()).toEqual({ mode: 'locked', grams: next });
  });

  it('MGAL-STORE-05 an uncrowned line gains only the exact lock', () => {
    const id = line().id;
    const next = line().planned_grams + 2;

    useRecipeStore.getState().setExactGrams(id, next);

    expect(line()).toMatchObject({ lock_type: 'grams', grams_constraint: { grams: next } });
    expect(line().lock_type).not.toBe('main');
  });

  it('MGAL-STORE-06 a Crown toggle by itself does not create a quantity lock', () => {
    const id = line().id;
    const snapshots = productBehaviorTestSnapshots(buildRecipeInput(useRecipeStore.getState()));
    snapshots[id] = { ...snapshots[id]!, mainClassification: 'MAIN_ALLOWED' };
    useRecipeStore.setState({ productBehaviorSnapshots: snapshots });
    useRecipeStore.getState().setMainIngredient(id, 'home');

    expect(line().lock_type).toBe('main');
    expect(line().grams_constraint).toBeUndefined();
    expect(lock()).toBeUndefined();
  });

  it('MGAL-STORE-07 a solver/system vector write does not auto-lock changed rows', () => {
    const id = line().id;
    useRecipeStore.getState().setPlannedGramsVector({ [id]: line().planned_grams + 5 });

    expect(line().lock_type).toBe('unlocked');
    expect(line().grams_constraint).toBeUndefined();
  });

  it('MGAL-STORE-08 verified Apply does not auto-lock proposal changes', () => {
    const input = buildRecipeInput(useRecipeStore.getState());
    const [first, second] = input.items;
    const proposed = {
      ...input,
      items: input.items.map((item) =>
        item.id === first!.id
          ? { ...item, planned_grams: item.planned_grams + 5 }
          : item.id === second!.id
            ? { ...item, planned_grams: item.planned_grams - 5 }
            : item,
      ),
    };

    expect(useRecipeStore.getState().applyVerifiedRecipeInput(proposed)).toEqual({ ok: true });
    expect(useRecipeStore.getState().items.every((item) => !item.grams_constraint)).toBe(true);
  });

  it('MGAL-STORE-09 batch scaling changes amounts without creating locks', () => {
    expect(useRecipeStore.getState().setBatchGrams(900).ok).toBe(true);

    expect(useRecipeStore.getState().items.every((item) => !item.grams_constraint)).toBe(true);
  });

  it('MGAL-STORE-10 machine-driven scaling changes amounts without creating locks', () => {
    expect(
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: 'ninja-gelato',
        machineId: 'ninja-test',
        label: 'Ninja Gelato',
        temperatureC: -13,
        batchGrams: 900,
        hardCapacityGrams: 900,
      }).ok,
    ).toBe(true);

    expect(useRecipeStore.getState().items.every((item) => !item.grams_constraint)).toBe(true);
  });

  it('MGAL-STORE-11 opening a source/official working copy does not infer locks', () => {
    const source = ownerSameInputRecipe();
    useRecipeStore.getState().loadRecipeInput(structuredClone(source));

    expect(useRecipeStore.getState().items.every((item) => !item.grams_constraint)).toBe(true);
    expect(useRecipeStore.getState().items.every((item) => item.lock_type === 'unlocked')).toBe(
      true,
    );
  });

  it('MGAL-STORE-12 opening an unlocked saved recipe does not infer locks', () => {
    useRecipeStore.getState().loadRecipeInput(structuredClone(ownerSameInputRecipe()), {
      savedId: 'saved-unlocked',
      savedName: 'Saved unlocked',
      versionNumber: 3,
    });

    expect(useRecipeStore.getState().items.every((item) => !item.grams_constraint)).toBe(true);
    expect(useRecipeStore.getState().items.every((item) => item.lock_type === 'unlocked')).toBe(
      true,
    );
  });

  it('MGAL-STORE-13 replacement preserves both locked and unlocked quantity contracts', () => {
    const cream = findDemoIngredient('raspberry')!;
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 4);
    const exact = line().planned_grams;

    expect(useRecipeStore.getState().replaceIngredient(id, cream).status).toBe('replaced');
    expect(line()).toMatchObject({
      planned_grams: exact,
      grams_constraint: { grams: exact },
    });
    useConstraintStudioStore.getState().toggleLock(id);
    const unlocked = line().planned_grams;
    expect(
      useRecipeStore.getState().replaceIngredient(id, findDemoIngredient('banana')!).status,
    ).toBe('replaced');
    expect(line()).toMatchObject({ planned_grams: unlocked, lock_type: 'unlocked' });
    expect(line().grams_constraint).toBeUndefined();
  });

  it('MGAL-STORE-14 a no-op exact assignment does not create a lock or revision', () => {
    const before = useRecipeStore.getState().draftRevision;
    useRecipeStore.getState().setExactGrams(line().id, line().planned_grams);

    expect(line().lock_type).toBe('unlocked');
    expect(line().grams_constraint).toBeUndefined();
    expect(useRecipeStore.getState().draftRevision).toBe(before);
  });

  it('MGAL-STORE-15 an invalid exact assignment mutates neither amount nor lock', () => {
    const before = structuredClone(line());
    const revision = useRecipeStore.getState().draftRevision;

    useRecipeStore.getState().setExactGrams(before.id, Number.NaN);

    expect(line()).toEqual(before);
    expect(useRecipeStore.getState().draftRevision).toBe(revision);
  });

  it('MGAL-STORE-16 save/reopen preserves the canonical exact lock', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 9);
    const saved = structuredClone(buildRecipeInput(useRecipeStore.getState()));

    useRecipeStore.getState().loadRecipeInput(saved, {
      savedId: 'saved-exact',
      savedName: 'Saved exact',
      versionNumber: 1,
    });

    expect(useRecipeStore.getState().items.find((item) => item.id === id)).toMatchObject({
      lock_type: 'grams',
      grams_constraint: { grams: saved.items.find((item) => item.id === id)!.planned_grams },
    });
    expect(selectCanonicalDraft().constraints.byLineId[id]).toEqual({
      mode: 'locked',
      grams: saved.items.find((item) => item.id === id)!.planned_grams,
    });
  });

  it('MGAL-STORE-17 a manual exact 20 g line is absent from the solver candidate vector', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, 20);
    const draft = selectCanonicalDraft();

    expect(
      buildDraftCandidateVector(draft.input, draft.constraints).map((item) => item.lineId),
    ).not.toContain(id);
  });

  it('MGAL-STORE-18 the same 20 g line returns to the solver vector after manual unlock', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, 20);
    useConstraintStudioStore.getState().toggleLock(id);
    const draft = selectCanonicalDraft();

    expect(
      buildDraftCandidateVector(draft.input, draft.constraints).map((item) => item.lineId),
    ).toContain(id);
  });

  it('MGAL-STORE-19 an Add Ingredient amount explicitly supplied by the user starts exact', () => {
    useRecipeStore.setState({ items: [], baseOrder: [], target_batch_grams: 1000 });
    const added = useRecipeStore
      .getState()
      .addIngredient(findDemoIngredient('sucrose')!, 20, { amountIntent: 'user_exact' });

    expect(added.status).toBe('added');
    expect(line()).toMatchObject({
      planned_grams: 20,
      lock_type: 'grams',
      grams_constraint: { grams: 20 },
    });
  });

  it('MGAL-STORE-20 a system/source Add Ingredient amount remains solver-mutable', () => {
    useRecipeStore.setState({ items: [], baseOrder: [], target_batch_grams: 1000 });
    useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 20);

    expect(line().lock_type).toBe('unlocked');
    expect(line().grams_constraint).toBeUndefined();
  });

  it('MGAL-STORE-21 a valid user-originated zero follows the same exact rule', () => {
    const id = line().id;

    useRecipeStore.getState().setExactGrams(id, 0);

    expect(line()).toMatchObject({
      planned_grams: 0,
      lock_type: 'grams',
      grams_constraint: { grams: 0 },
    });
  });

  it('MGAL-STORE-22 immutable recipe versions preserve the exact sidecar', () => {
    const id = line().id;
    useRecipeStore.getState().setExactGrams(id, line().planned_grams + 6);
    const recipeInput = buildRecipeInput(useRecipeStore.getState());
    const version = buildRecipeVersion(
      {
        recipeId: 'manual-exact',
        ownerUserId: 'owner',
        versionNumber: 1,
        recipeInput,
        trace: { engineVersion: 'test', configVersion: 'test' },
        source: 'manual',
        createdBy: 'owner',
        createdAt: '2026-09-12T00:00:00.000Z',
      },
      'manual-exact-v1',
    );
    const restored = restoreVersion(
      [version],
      1,
      'owner',
      '2026-09-12T00:01:00.000Z',
      'manual-exact-v2',
    );

    expect(restored.recipeInput.items.find((item) => item.id === id)).toMatchObject({
      lock_type: 'grams',
      grams_constraint: { grams: recipeInput.items.find((item) => item.id === id)!.planned_grams },
    });
  });
});
