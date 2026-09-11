/**
 * OWNER REGRESSION 2026-09-11 — PRO CROWN 0 g -> 1 g, and HOME kept separate.
 *
 * Known good (served 1022df98): PRO 0 g + Crown ON -> 1 g for every profile.
 * Broken (served 2774715a, via 6e9a99bc): Protein 0 g + Crown ON -> 0 g, and
 * Przelicz stopped at "Podaj gramaturę dla: WATERMELON · Fresh Fruit.
 * Minimalna ilość to 1 g." — the rule was scoped by PROFILE inside the shared
 * store, so a HOME rule reached PRO.
 *
 * PRO and HOME are proven INDEPENDENTLY here: every PRO assertion uses the
 * store's default door (what every PRO control calls), every HOME assertion
 * names the HOME surface explicitly. No HOME case touches a PRO expectation.
 *
 * Unit/runtime tests over the real store and the real Przelicz preflight.
 * NOT E2E.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import {
  missingProductDosePreviewIssue,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from './recipeStore';

/** WATERMELON · Fresh Fruit — the identity from the owner's own reproducer. */
const WATERMELON = 'PI-ING-000405';
const PROFILES = ['gelato', 'sorbet', 'vegan', 'protein'] as const;
type Profile = (typeof PROFILES)[number];

const st = () => useRecipeStore.getState();
const line = (id: string) => st().items.find((item) => item.id === id)!;
const batch = () => st().items.reduce((sum, item) => sum + item.planned_grams, 0);

/** The PI pass the app runs after every role transition. */
const resolveProductBehavior = (mainCapable: readonly string[]) => {
  const snapshots = productBehaviorTestSnapshots(buildRecipeInput(st()));
  for (const id of mainCapable) {
    snapshots[id] = {
      ...snapshots[id]!,
      mainClassification: 'MAIN_ALLOWED',
      mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
    };
  }
  st().syncProductBehaviorSnapshots(snapshots);
};

/** PRO „Nowa receptura" for one profile, then WATERMELON added at `grams`. */
const openWithWatermelon = (profile: Profile, grams = 0): string => {
  st().startNewRecipe(profile);
  const added = st().addIngredient(sorbetMapperIngredient(WATERMELON), grams);
  if (added.status !== 'added') throw new Error(`add failed: ${added.status}`);
  resolveProductBehavior([added.lineId]);
  return added.lineId;
};

/** The exact gate that produced the owner's refusal (Przelicz wrapper, first check). */
const przeliczPreflight = () => missingProductDosePreviewIssue(buildRecipeInput(st()));

beforeEach(() => {
  useConstraintStudioStore.getState().resetForTests();
});

describe('PRO TEST 1 — 0 g + Crown ON -> 1 g, Main active, for EVERY profile', () => {
  it.each(PROFILES)('%s — the PRO row Crown (setMainIngredient)', (profile) => {
    const id = openWithWatermelon(profile);
    expect(line(id).planned_grams).toBe(0);

    st().setMainIngredient(id);

    expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
    expect(st().crownAutoSeededLineIds).toContain(id);
  });

  it.each(PROFILES)('%s — the lower-level role write (setLockType main)', (profile) => {
    const id = openWithWatermelon(profile);
    st().setLockType(id, 'main');
    expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
  });
});

describe('PRO TEST 2 — a 1 g auto-seeded Main does not stop Przelicz at the 1 g refusal', () => {
  it.each(PROFILES)('%s — the Przelicz preflight passes', (profile) => {
    const id = openWithWatermelon(profile);
    st().setMainIngredient(id);
    expect(przeliczPreflight()).toBeNull();
  });

  it.each(PROFILES)('%s — the recalculation runs past the gate', (profile) => {
    const id = openWithWatermelon(profile);
    st().setMainIngredient(id);
    resolveProductBehavior([id]); // the PI pass that follows the role transition

    useConstraintStudioStore.getState().createOptimizePreview();

    const { previewIssue, recalculationTerminal } = useConstraintStudioStore.getState();
    const doseRefusal =
      previewIssue !== null &&
      previewIssue.code === 'missing_required_role' &&
      'role' in previewIssue &&
      previewIssue.role === 'product_dose';
    expect(doseRefusal, JSON.stringify(previewIssue)).toBe(false);
    expect(recalculationTerminal?.state).not.toBe('PRODUCT_GRAMS_REQUIRED');
  });

  it('the assertion is not vacuous — a 0 g Main DOES hit the exact owner refusal', () => {
    const id = openWithWatermelon('protein');
    st().setMainIngredient(id, 'home'); // HOME keeps Protein mass-neutral
    expect(line(id).planned_grams).toBe(0);
    expect(przeliczPreflight()?.messagePl.replace(/\n+/g, ' ')).toBe(
      'Podaj gramaturę dla: WATERMELON · Fresh Fruit. Minimalna ilość to 1 g.',
    );
  });
});

describe('PRO TEST 3 — positive grams + Crown ON -> grams unchanged', () => {
  it.each(PROFILES)('%s', (profile) => {
    const id = openWithWatermelon(profile, 170);
    st().setMainIngredient(id);
    expect(line(id)).toMatchObject({ planned_grams: 170, lock_type: 'main' });
    expect(st().crownAutoSeededLineIds).not.toContain(id);
  });
});

describe('PRO TEST 4 — the rest of the accepted PRO Main lifecycle is unchanged', () => {
  it.each(PROFILES)('%s — Crown OFF returns an untouched seed to 0 g', (profile) => {
    const id = openWithWatermelon(profile);
    st().setMainIngredient(id);
    st().setStandardIngredient(id);
    expect(line(id)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
    expect(st().crownAutoSeededLineIds).not.toContain(id);
  });

  it.each(PROFILES)('%s — an amount typed after the seed survives Crown OFF', (profile) => {
    const id = openWithWatermelon(profile);
    st().setMainIngredient(id);
    resolveProductBehavior([id]);
    st().setPlannedGrams(id, 50);
    st().setStandardIngredient(id);
    expect(line(id).planned_grams).toBe(50);
  });

  it.each(PROFILES)(
    '%s — the seeded gram is a real Engine input, never an intent anchor',
    (profile) => {
      const id = openWithWatermelon(profile);
      st().setMainIngredient(id);
      const engineLine = buildRecipeInput(st()).items.find((item) => item.id === id)!;
      expect(engineLine.planned_grams).toBe(1);
      expect(engineLine.user_intent_anchor_grams).toBeUndefined();
    },
  );
});

describe('HOME TEST — HOME keeps its own Crown rule, on the HOME surface only', () => {
  it('HOME Protein Crown stays mass-neutral: 0 g stays 0 g and the batch does not grow', () => {
    const id = openWithWatermelon('protein');
    const before = batch();
    st().setMainIngredient(id, 'home');
    expect(line(id)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(batch()).toBe(before);
    expect(st().crownAutoSeededLineIds).not.toContain(id);

    st().setStandardIngredient(id);
    st().setLockType(id, 'main', 'home');
    expect(line(id)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(batch()).toBe(before);
  });

  it.each(['gelato', 'sorbet', 'vegan'] as const)(
    'HOME %s keeps the behaviour it has on staging today (seed 1 g)',
    (profile) => {
      const id = openWithWatermelon(profile);
      st().setMainIngredient(id, 'home');
      expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
    },
  );

  it('the same Protein line behaves per SURFACE — HOME 0 g, PRO 1 g — with no leak between them', () => {
    const home = openWithWatermelon('protein');
    st().setMainIngredient(home, 'home');
    expect(line(home).planned_grams).toBe(0);

    const pro = openWithWatermelon('protein');
    st().setMainIngredient(pro);
    expect(line(pro).planned_grams).toBe(1);
  });
});
