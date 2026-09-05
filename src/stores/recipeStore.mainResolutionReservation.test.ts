/**
 * Main resolution retires the starter reservation.
 *
 * `starterReservedMainGrams` means exactly one thing: **the required Main role
 * has not been resolved yet**. It is not "remaining desired Main grams", so it
 * is never decremented gram-by-gram — the moment a valid Main role resolves it
 * is retired to 0, whether the Crown is ON or OFF.
 *
 * GEL-P0-026 owns the state BEFORE that transition
 * (`sum(lines) + reservation === target`) and is untouched. This file owns the
 * transition itself, and what the draft is allowed to look like after it: a
 * recipe may sit under or over its target between Main insertion and
 * Recalculate. That is a legitimate intermediate draft, not a batch failure —
 * the missing mass must NOT be back-filled and must NOT be kept as reservation.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { NINJA_CREAMI_DELUXE_NC502EU, deriveMachineSetup } from '@/features/machine-catalog';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { recipePersistPartialize, useRecipeStore } from './recipeStore';

const st = () => useRecipeStore.getState();
const sum = () => st().items.reduce((total, item) => total + item.planned_grams, 0);
const reservation = () => st().starterReservedMainGrams;

const setup = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, 'sorbet');
const BATCH = setup.recommendedBatchGrams!;

/** A new Sorbet on the Ninja Deluxe: the GEL-P0-026 state. */
const reservedStarter = () => {
  useRecipeStore.getState().startNewRecipe('sorbet');
  useRecipeStore.getState().setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode!,
    machineId: NINJA_CREAMI_DELUXE_NC502EU.id,
    label: 'Ninja CREAMi Deluxe',
    temperatureC: -11,
    batchGrams: BATCH,
    hardCapacityGrams: setup.hardMaximumBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
};

/**
 * REAL Sorbet Main authority for a line — the owner-approved
 * `main-sorbet-exact-fruit-60-v1` envelope, taken from the shared fixture.
 * A snapshot describes the PRODUCT, so it is equally valid on a line whose
 * Crown is still OFF.
 */
const grantMainAuthority = (lineId: string) => {
  const probe: RecipeInput = {
    ...buildRecipeInput(st()),
    items: st().items.map((item) =>
      item.id === lineId ? { ...item, lock_type: 'main' as const } : item,
    ),
  };
  const snapshots = sorbetAuthoritySnapshots(probe);
  // Through the canonical door the served app uses, never a raw setState.
  for (const item of st().items) {
    const snapshot = snapshots[item.id];
    if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
  }
};

const addMain = (id: string, grams: number) => {
  const ingredient = sorbetMapperIngredient(id);
  useRecipeStore.getState().addIngredient(ingredient, grams);
  const line = st().items.find((item) => item.ingredient.name === ingredient.name)!;
  grantMainAuthority(line.id);
  return line;
};

describe('a resolved Main role retires the starter reservation', () => {
  it('0. the starting point is the GEL-P0-026 state', () => {
    reservedStarter();
    expect(reservation()).toBeGreaterThan(0);
    expect(sum() + reservation()).toBeCloseTo(BATCH, 6);
  });

  it('1. Crown OFF — a valid user-held Main retires it, and the draft may be short', () => {
    reservedStarter();
    const line = addMain(SORBET_MAIN_IDS.strawberry, 300);

    // The Crown is OFF: the role is resolved by ProductBehavior authority.
    expect(st().items.find((item) => item.id === line.id)!.lock_type).not.toBe('main');
    expect(reservation()).toBe(0);

    // The user's grams are exactly what they asked for...
    expect(st().items.find((item) => item.id === line.id)!.planned_grams).toBe(300);
    // ...and the draft is allowed to be short until Recalculate. Nothing
    // back-fills the difference, and nothing keeps it as reservation.
    expect(sum()).toBeLessThan(BATCH);
    expect(sum() + reservation()).not.toBeCloseTo(BATCH, 6);
  });

  it('2. Crown ON — the same transition, reservation retired', () => {
    reservedStarter();
    const line = addMain(SORBET_MAIN_IDS.strawberry, 300);
    useRecipeStore.getState().setMainIngredient(line.id);
    expect(st().items.find((item) => item.id === line.id)!.lock_type).toBe('main');
    expect(reservation()).toBe(0);
  });

  it('3. a NON-Main line never retires it', () => {
    // Cocoa carries no Main capability, so the required Main role is still
    // unresolved and the reservation must stand — GEL-P0-026 keeps holding.
    reservedStarter();
    const before = reservation();
    const cocoa = sorbetMapperIngredient('PI-ING-001249'); // CACAO
    useRecipeStore.getState().addIngredient(cocoa, 20);
    const cocoaSnapshots = productBehaviorTestSnapshots(buildRecipeInput(st()), []);
    for (const item of st().items) {
      const snapshot = cocoaSnapshots[item.id];
      if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
    }
    expect(reservation()).toBe(before);
    expect(reservation()).toBeGreaterThan(0);
  });

  it('4. a second valid Main does not resurrect it', () => {
    reservedStarter();
    addMain(SORBET_MAIN_IDS.strawberry, 300);
    expect(reservation()).toBe(0);
    const lime = addMain(SORBET_MAIN_IDS.lime, 100);
    expect(reservation()).toBe(0);
    // Canonical ratio metadata survives the transition.
    useRecipeStore.getState().setMainIngredient(lime.id);
    const mains = st().items.filter((item) => item.lock_type === 'main');
    expect(mains.length).toBeGreaterThanOrEqual(1);
    for (const main of mains) expect(main.main_ratio_weight).toBeGreaterThan(0);
  });

  it('4b. exactly one Main authority is live at a time — Crown OFF → ON → OFF', () => {
    /* Crown ON means the visible grams are NOT a target: the Main frontier
       maximizes. Leaving `user_intent_anchor_grams` set while crowned would
       assert the opposite, so the crown clears it. Turning the crown back OFF
       re-anchors on the grams the recipe actually has — which
       `setStandardIngredient` already did — so intent is never invented from a
       remembered older number, and no second field is needed. */
    reservedStarter();
    const line = addMain(SORBET_MAIN_IDS.strawberry, 300);

    // Crown OFF: the user's grams are the anchor.
    expect(st().items.find((item) => item.id === line.id)!.user_intent_anchor_grams).toBe(300);

    // Crown ON: no anchor competes with maximization.
    useRecipeStore.getState().setMainIngredient(line.id);
    const crowned = st().items.find((item) => item.id === line.id)!;
    expect(crowned.lock_type).toBe('main');
    expect(crowned.user_intent_anchor_grams).toBeUndefined();

    // Crown OFF again: the CURRENT grams become the new anchor.
    useRecipeStore.getState().setStandardIngredient(line.id);
    const released = st().items.find((item) => item.id === line.id)!;
    expect(released.lock_type).not.toBe('main');
    expect(released.user_intent_anchor_grams).toBe(released.planned_grams);
    // …and the reservation stays retired throughout.
    expect(reservation()).toBe(0);
  });

  it('5. persistence — a retired reservation never comes back', () => {
    reservedStarter();
    addMain(SORBET_MAIN_IDS.strawberry, 300);
    expect(reservation()).toBe(0);
    const persisted = recipePersistPartialize(st()) as unknown as Record<string, unknown>;
    expect(persisted.starterReservedMainGrams).toBe(0);
    useRecipeStore.setState({
      items: persisted.items as never,
      target_batch_grams: persisted.target_batch_grams as number,
      starterReservedMainGrams: persisted.starterReservedMainGrams as number,
    });
    expect(reservation()).toBe(0);
  });

  it('6. reload BEFORE the Main keeps the reservation, and it still retires after', () => {
    reservedStarter();
    const persisted = recipePersistPartialize(st()) as unknown as Record<string, unknown>;
    expect(persisted.starterReservedMainGrams).toBeGreaterThan(0);
    useRecipeStore.setState({
      items: persisted.items as never,
      target_batch_grams: persisted.target_batch_grams as number,
      starterReservedMainGrams: persisted.starterReservedMainGrams as number,
    });
    expect(reservation()).toBeGreaterThan(0);
    expect(sum() + reservation()).toBeCloseTo(BATCH, 6);
    addMain(SORBET_MAIN_IDS.strawberry, 300);
    expect(reservation()).toBe(0);
  });
});
