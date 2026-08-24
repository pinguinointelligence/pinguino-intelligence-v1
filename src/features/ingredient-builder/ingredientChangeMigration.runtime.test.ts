// @vitest-environment jsdom
/**
 * §10-J — a deployment that changes the signature format must never light every
 * existing user's ingredients up.
 *
 * This exercises the REAL persisted store against a localStorage payload
 * written by the previous signature format (three-decimal grams), rather than
 * asserting on source text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'pinguino-ingredient-change-baseline';

/** Exactly what the pre-fix build persisted: unversioned, three-decimal grams. */
const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    baselineByLineId: {
      'line-1': 'PI-ING-000236|566.000|unlocked|standard|-|-|1.2000|mapper_reference',
      'line-2': 'PI-ING-000180|120.000|unlocked|standard|-|-|3.2000|mapper_reference',
    },
  },
  version: 0,
});

describe('persisted marker baseline migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('discards an incompatible legacy baseline instead of marking every line', async () => {
    localStorage.setItem(STORAGE_KEY, LEGACY_PAYLOAD);
    const { useIngredientChangeStore } = await import('./ingredientChangeStore');
    await useIngredientChangeStore.persist.rehydrate();

    const baseline = useIngredientChangeStore.getState().baselineByLineId;
    expect(baseline).toEqual({});

    // A cold baseline marks NOTHING — the honest answer, because the app no
    // longer knows what the accepted state was.
    const { changedIngredientLineIds } = await import('./ingredientChangeHighlight');
    const current = {
      'line-1': 'PI-ING-000236|566.0|unlocked',
      'line-2': 'PI-ING-000180|120.0|unlocked',
    };
    expect([...changedIngredientLineIds(current, baseline)]).toEqual([]);
  });

  it('keeps a baseline written by the CURRENT format', async () => {
    const current = { 'line-1': 'PI-ING-000236|566.0|unlocked' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { baselineByLineId: current }, version: 2 }),
    );
    const { useIngredientChangeStore } = await import('./ingredientChangeStore');
    await useIngredientChangeStore.persist.rehydrate();
    expect(useIngredientChangeStore.getState().baselineByLineId).toEqual(current);
  });
});
