// @vitest-environment jsdom

/**
 * OWNER BRIEF 2026-09-11 — PRO zero-gram grams editing and Fresh Fruit
 * BASE_RECIPE authority across Crown ON/OFF.
 *
 * Served staging c65e52ef: a Fresh Fruit line crowned at 0 g (the 1 g seed)
 * and then uncrowned went back to 0 g WITHOUT its ProductBehavior snapshot
 * (3696d2bc deleted it). The workspace stays managed and a 0 g line is outside
 * the required set, so nothing ever re-resolved it. The + stepper looked open
 * (the row gate judged the current 0 g) while every press was refused by the
 * BASE_RECIPE gate (judged at the requested 1 g), and Przelicz then asked for
 * "≥ 1 g". These cases drive the REAL row control over the REAL store.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { calculateRecipe } from '@/engine';
import {
  missingProductDosePreviewIssue,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientBuilder } from './IngredientBuilder';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

/** The owner's three Fresh Fruit lines (served Mapper identities). */
const STRAWBERRIES = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
const WATERMELON = 'PI-ING-000405';

const st = () => useRecipeStore.getState();
const line = (id: string) => st().items.find((item) => item.id === id)!;
const snapshotOf = (id: string) => st().productBehaviorSnapshots[id];

const mainCapable = (snapshot: ProductBehaviorSnapshot): ProductBehaviorSnapshot => ({
  ...snapshot,
  mainClassification: 'MAIN_ALLOWED',
  mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
});

/** What the managed PRO pass writes once the server has re-resolved the draft. */
const managedPass = () => {
  const snapshots = productBehaviorTestSnapshots(buildRecipeInput(st()));
  st().syncProductBehaviorSnapshots(
    Object.fromEntries(
      Object.entries(snapshots).map(([lineId, snapshot]) => [lineId, mainCapable(snapshot)]),
    ),
  );
};

/** PRO „Nowa receptura · Sorbet", each fruit through the picker door at 0 g. */
const openSorbetWith = (ids: readonly string[]): string[] => {
  st().startNewRecipe('sorbet');
  managedPass();
  return ids.map((id) => {
    const added = st().addIngredient(sorbetMapperIngredient(id), 0);
    if (added.status !== 'added') throw new Error(`add failed: ${added.status}`);
    const snapshot = productBehaviorTestSnapshots(buildRecipeInput(st()))[added.lineId]!;
    st().setProductBehaviorSnapshot(added.lineId, {
      ...mainCapable(snapshot),
      lineId: added.lineId,
    });
    return added.lineId;
  });
};

let mounted: { container: HTMLElement; root: Root } | null = null;
const render = (): HTMLElement => {
  const state = st();
  const calculated = calculateRecipe({
    mode: state.mode,
    category: state.category,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: state.machine_capacity_grams,
    goals: { formulation_strategy: state.formulation_strategy },
    items: state.items,
  });
  if (!mounted) {
    const container = document.createElement('div');
    document.body.append(container);
    mounted = { container, root: createRoot(container) };
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { root } = mounted;
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <SurfaceToneContext.Provider value="paper">
          <IngredientBuilder
            items={calculated.items}
            totalBatchG={calculated.total_batch_g}
            targetBatchG={state.target_batch_grams}
            demo
            layout="workbench"
          />
        </SurfaceToneContext.Provider>
      </QueryClientProvider>,
    ),
  );
  return mounted.container;
};

const row = (id: string) => {
  const container = render();
  const control = container.querySelector<HTMLElement>(`[data-testid="row-grams-control-${id}"]`);
  return {
    plus: control?.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]') ?? null,
    input: control?.querySelector<HTMLInputElement>('input[role="spinbutton"]') ?? null,
    refusal: container.querySelector(`[data-testid="row-edit-refusal-${id}"]`)?.textContent ?? null,
  };
};

const pressPlus = (id: string) => {
  const { plus } = row(id);
  expect(plus, 'the grams + control is rendered').not.toBeNull();
  act(() => plus!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

const typeGrams = (id: string, value: string) => {
  const input = row(id).input!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  });
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
};

beforeEach(() => {
  useConstraintStudioStore.getState().resetForTests();
  useIngredientTableUxStore.getState().reset();
});

afterEach(() => {
  if (!mounted) return;
  act(() => mounted!.root.unmount());
  mounted.container.remove();
  mounted = null;
});

describe('PRO — an unlocked 0 g line is manually editable without a Crown', () => {
  it('P1 — + once from 0 g gives 1 g', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    pressPlus(id!);
    expect(line(id!).planned_grams).toBe(1);
  });

  it('P2 — typing 20 into a 0 g line gives 20 g', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    typeGrams(id!, '20');
    expect(line(id!).planned_grams).toBe(20);
  });
});

describe('PRO — Crown ON/OFF never disables grams editing', () => {
  it('P3 — Crown ON at 0 g gives 1 g + Main (the PRO seed is unchanged)', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    st().setMainIngredient(id!);
    expect(line(id!)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
    expect(st().crownAutoSeededLineIds).toContain(id);
  });

  it('P4 — Crown OFF returns the seed to 0 g, keeps the authority, and + gives 1 g', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    st().setMainIngredient(id!);
    managedPass();
    st().setStandardIngredient(id!);

    expect(line(id!)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
    expect(snapshotOf(id!)?.resolutionState).toBe('RESOLVED');
    expect(row(id!).refusal).toBeNull();

    pressPlus(id!);
    expect(line(id!).planned_grams).toBe(1);
  });

  it('P4 — after Crown OFF, typing 20 gives 20 g', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    st().setMainIngredient(id!);
    managedPass();
    st().setStandardIngredient(id!);
    typeGrams(id!, '20');
    expect(line(id!).planned_grams).toBe(20);
  });

  it('the Crown re-arms at 0 g after Crown OFF', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    st().setMainIngredient(id!);
    managedPass();
    st().setStandardIngredient(id!);
    st().setMainIngredient(id!);
    expect(line(id!)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
  });

  it('product identity is stable across add, Crown ON, the pass and Crown OFF', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    const identity = () => ({
      mapper: line(id!).ingredient.canonical_ingredient_id,
      snapshotMapper: snapshotOf(id!)?.mapperIngredientId,
      productId: snapshotOf(id!)?.productId,
      productVersionId: snapshotOf(id!)?.productVersionId,
    });
    const added = identity();
    expect(added.mapper).toBe(STRAWBERRIES);
    st().setMainIngredient(id!);
    expect(identity()).toEqual(added);
    managedPass();
    expect(identity()).toEqual(added);
    st().setStandardIngredient(id!);
    expect(identity()).toEqual(added);
  });
});

describe('the row control tells the truth about the amount it would write', () => {
  it('a 0 g line whose authority is stale shows a closed control and says why', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    // Crown ON then OFF before the managed pass has answered: the line is back
    // at 0 g holding the role-transition snapshot the pass has not yet resolved.
    st().setMainIngredient(id!);
    st().setStandardIngredient(id!);
    expect(snapshotOf(id!)?.resolutionState).toBe('REVALIDATION_REQUIRED');

    const closed = row(id!);
    expect(closed.plus?.disabled).toBe(true);
    expect(closed.refusal).toBe(`Brak zatwierdzonego uprawnienia BASE_RECIPE dla: ${id}.`);

    // The managed pass resolves the line; the same control opens and works.
    managedPass();
    expect(row(id!).plus?.disabled).toBe(false);
    pressPlus(id!);
    expect(line(id!).planned_grams).toBe(1);
  });

  it('a real BASE_RECIPE blocker still fails closed at 0 g', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    const blocked = snapshotOf(id!)!;
    st().setProductBehaviorSnapshot(id!, {
      ...blocked,
      moduleEligibility: { ...blocked.moduleEligibility, BASE_RECIPE: 'blocked' },
    });

    const closed = row(id!);
    expect(closed.plus?.disabled).toBe(true);
    expect(closed.refusal).toBe(`Brak zatwierdzonego uprawnienia BASE_RECIPE dla: ${id}.`);
    st().setPlannedGrams(id!, 20);
    expect(line(id!).planned_grams).toBe(0);
  });
});

describe('PRO / Sorbet — three Fresh Fruit Mains from 0 g', () => {
  it('keep valid BASE_RECIPE authority, stay editable and pass every Przelicz gate before the solver', () => {
    const ids = openSorbetWith([STRAWBERRIES, CRANBERRY, WATERMELON]);
    for (const id of ids) st().setMainIngredient(id);
    for (const id of ids) expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });

    managedPass();
    for (const id of ids) {
      expect(snapshotOf(id)?.resolutionState).toBe('RESOLVED');
      expect(row(id).refusal).toBeNull();
    }
    expect(missingProductDosePreviewIssue(buildRecipeInput(st()))).toBeNull();

    useConstraintStudioStore.getState().createOptimizePreview();
    const { previewIssue, recalculationTerminal } = useConstraintStudioStore.getState();
    expect(recalculationTerminal?.state).not.toBe('PRODUCT_GRAMS_REQUIRED');
    expect([
      'product_behavior_missing',
      'product_behavior_invalid',
      'missing_required_role',
    ]).not.toContain(previewIssue?.code);
  });

  it('Crown OFF on one of three keeps the others Main and the uncrowned one editable', () => {
    const ids = openSorbetWith([STRAWBERRIES, CRANBERRY, WATERMELON]);
    for (const id of ids) st().setMainIngredient(id);
    managedPass();
    st().setStandardIngredient(ids[0]!);

    expect(line(ids[0]!)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
    expect(line(ids[1]!).lock_type).toBe('main');
    expect(line(ids[2]!).lock_type).toBe('main');
    pressPlus(ids[0]!);
    expect(line(ids[0]!).planned_grams).toBe(1);
  });
});

describe('HOME — the same shared store, HOME rules unchanged', () => {
  it('the HOME Crown control OFF/ON keeps the line eligible and editable', () => {
    const [id] = openSorbetWith([STRAWBERRIES]);
    st().setLockType(id!, 'main', 'home');
    // Owner OD-1 (2026-09-11): HOME's Crown is mass-neutral — 0 g stays 0 g.
    expect(line(id!)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    st().setLockType(id!, 'unlocked', 'home');
    expect(line(id!)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
    expect(snapshotOf(id!)?.resolutionState).toBe('RESOLVED');
    st().setPlannedGrams(id!, 1);
    expect(line(id!).planned_grams).toBe(1);
  });

  it('HOME Protein Crown stays mass-neutral — no PRO seed on the HOME surface', () => {
    st().startNewRecipe('protein');
    managedPass();
    const added = st().addIngredient(sorbetMapperIngredient(WATERMELON), 0);
    if (added.status !== 'added') throw new Error('add failed');
    const snapshot = productBehaviorTestSnapshots(buildRecipeInput(st()))[added.lineId]!;
    st().setProductBehaviorSnapshot(added.lineId, {
      ...mainCapable(snapshot),
      lineId: added.lineId,
    });
    st().setMainIngredient(added.lineId, 'home');
    expect(line(added.lineId)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(st().crownAutoSeededLineIds).not.toContain(added.lineId);
  });
});
