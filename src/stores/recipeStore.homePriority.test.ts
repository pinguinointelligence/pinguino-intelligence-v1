/**
 * PACKAGE 2A — HOME priority AUTO/MANUAL, closed on current staging (2026-09-11).
 *
 * Owner contract §3–§17. A HOME draft is born in AUTO: every user-added BASE line
 * holds the Main role, and none of it is shown as a crown. The customer's first HOME
 * crown switches the draft to MANUAL and releases every other automatic priority
 * without moving a gram. From then on only the customer's crowns are priority, a new
 * BASE line is ordinary, and PRO keeps its own Crown rules (#268, #276, #285).
 *
 * The HOME sequence mirrors `HomeCreatorPage.generateRecipe` and
 * `useHomeIntentIngredients.addByProductId`: a new starter draft, then
 * `setPriorityMode('AUTO')`, then each flavour added and offered the AUTOMATIC door.
 * HOME's Crown press is the exact call `CrownControl` makes, with its `isMain` read
 * from the crowns HOME shows.
 *
 * Unit/runtime tests over the real store. NOT E2E.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { effectivePriorityLineIds, visibleCrownLineIds } from '@/features/recipe-priority';
import {
  DEFAULT_NEW_RECIPE_SERVING_MODE,
  DEFAULT_NEW_RECIPE_STRATEGY,
} from '@/features/recipes/newRecipeStarter';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { mergePersistedRecipeState, recipePersistPartialize, useRecipeStore } from './recipeStore';

const BANANA = 'PI-ING-000345';
const CHOCOLATE = 'PI-ING-000087';
const STRAWBERRY = 'PI-ING-001553';
const CRANBERRY = 'PI-ING-001556';
/** WATERMELON · Fresh Fruit — the owner's own PRO reproducer (#268). */
const WATERMELON = 'PI-ING-000405';
const PROFILES = ['gelato', 'sorbet', 'vegan', 'protein'] as const;
type Profile = (typeof PROFILES)[number];

const st = () => useRecipeStore.getState();
const line = (id: string) => st().items.find((item) => item.id === id)!;
const grams = () => Object.fromEntries(st().items.map((item) => [item.id, item.planned_grams]));
/** What the Solver treats as priority — the Main role, in either mode. */
const priority = () => new Set(effectivePriorityLineIds(st().items));
/** What HOME shows as crowns. */
const visible = () => visibleCrownLineIds(st().items, st().priority_mode);

/** Lines the PI pass has resolved as Main-capable, kept across adds. */
const mainCapable: string[] = [];
const resolveProductBehavior = () => {
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

/** A new HOME draft, exactly as `generateRecipe` builds it before the chips land. */
const newHomeDraft = (profile: Profile) => {
  st().rebuildNewRecipeStarter({
    visibleProductType: profile,
    servingModeId: DEFAULT_NEW_RECIPE_SERVING_MODE,
    formulationStrategy: DEFAULT_NEW_RECIPE_STRATEGY,
    targetBatchGrams: 1000,
  });
  // `rebuildNewRecipeStarter` starts a NEW draft, so it is MANUAL until HOME says AUTO.
  expect(st().priority_mode).toBe('MANUAL');
  st().setPriorityMode('AUTO');
};

/** The PRO builder's add: a line, its PI pass, and no automatic anything. */
const proAdd = (pi: string, amount = 0): string => {
  const added = st().addIngredient(sorbetMapperIngredient(pi), amount);
  if (added.status !== 'added') throw new Error(`${pi}: ${added.status}`);
  mainCapable.push(added.lineId);
  resolveProductBehavior();
  return added.lineId;
};

/** One HOME flavour through `addByProductId`: the add, then the AUTOMATIC door. */
const homeAdd = (pi: string, amount = 0): string => {
  const lineId = proAdd(pi, amount);
  st().grantAutomaticPriority(lineId);
  return lineId;
};

/** HOME's Crown control. */
const homeCrown = (lineId: string) =>
  st().setLockType(lineId, visible().includes(lineId) ? 'unlocked' : 'main', 'home');

/** HOME's padlock. */
const homePadlock = (lineId: string) =>
  st().setLockType(lineId, line(lineId).lock_type === 'grams' ? 'unlocked' : 'grams', 'home');

beforeEach(() => {
  mainCapable.length = 0;
  useConstraintStudioStore.getState().resetForTests();
});

describe('§14 HOME multi-ingredient — Banana, Chocolate, Strawberry, Cranberry', () => {
  it('the owner sequence, step by step', () => {
    newHomeDraft('gelato');
    const [banana, chocolate, strawberry, cranberry] = [
      homeAdd(BANANA, 120),
      homeAdd(CHOCOLATE, 80),
      homeAdd(STRAWBERRY, 100),
      homeAdd(CRANBERRY, 60),
    ];

    // Before any manual Crown: AUTO, all four BASE priority, no visible crown.
    expect(st().priority_mode).toBe('AUTO');
    expect(priority()).toEqual(new Set([banana, chocolate, strawberry, cranberry]));
    expect(visible()).toEqual([]);
    const before = grams();

    // Crown Banana only.
    homeCrown(banana);
    expect(st().priority_mode).toBe('MANUAL');
    expect(priority()).toEqual(new Set([banana]));
    expect(visible()).toEqual([banana]);
    expect(grams()).toEqual(before);

    // Crown Strawberry too.
    homeCrown(strawberry);
    expect(priority()).toEqual(new Set([banana, strawberry]));
    expect(new Set(visible())).toEqual(new Set([banana, strawberry]));
    expect(grams()).toEqual(before);

    // Remove Banana's Crown.
    homeCrown(banana);
    expect(priority()).toEqual(new Set([strawberry]));
    expect(visible()).toEqual([strawberry]);
    expect(grams()).toEqual(before);
    expect(st().priority_mode).toBe('MANUAL');
  });

  it('from 0 g every Crown press is mass-neutral — the automatic gram becomes an ordinary amount', () => {
    // HOME adds a flavour at 0 g and the automatic door sizes it exactly as the
    // crown did on staging before this closure. Whether HOME may keep 0 g there is
    // the open owner decision recorded in reports/PACKAGE_2A_CLOSURE_2026-09-11.md;
    // what is asserted here is the part the owner fixed: a Crown PRESS moves no gram.
    newHomeDraft('gelato');
    const banana = homeAdd(BANANA);
    homeAdd(CHOCOLATE);
    const strawberry = homeAdd(STRAWBERRY);
    homeAdd(CRANBERRY);
    const before = grams();

    homeCrown(banana);
    expect(grams()).toEqual(before);
    expect(st().crownAutoSeededLineIds).toEqual([]);

    homeCrown(strawberry);
    expect(grams()).toEqual(before);

    homeCrown(banana); // removing a HOME crown keeps the gram it had
    expect(grams()).toEqual(before);
    expect(priority()).toEqual(new Set([strawberry]));
  });

  it('the first Crown ends AUTO wherever it lands — even on a line a lock took out of AUTO', () => {
    newHomeDraft('gelato');
    const [banana, chocolate, strawberry] = [
      homeAdd(BANANA, 100),
      homeAdd(CHOCOLATE, 100),
      homeAdd(STRAWBERRY, 100),
    ];
    homePadlock(chocolate);
    expect(st().priority_mode).toBe('AUTO');
    expect(priority()).toEqual(new Set([banana, strawberry]));

    homeCrown(chocolate);
    expect(st().priority_mode).toBe('MANUAL');
    expect(priority()).toEqual(new Set([chocolate]));
    expect(line(chocolate).planned_grams).toBe(100);
  });
});

describe('§11 TOPPING', () => {
  it('a topping is never a BASE priority and never ends AUTO', () => {
    newHomeDraft('gelato');
    const banana = homeAdd(BANANA, 100);
    const toppingsBefore = st().toppings.length;

    st().addTopping(sorbetMapperIngredient(CHOCOLATE) as never, 0);
    expect(st().toppings.length).toBe(toppingsBefore + 1);
    expect(st().items.some((item) => item.ingredient.id === CHOCOLATE)).toBe(false);
    expect(st().priority_mode).toBe('AUTO');
    expect(priority()).toEqual(new Set([banana]));

    homeCrown(banana);
    st().addTopping(sorbetMapperIngredient(CRANBERRY) as never, 0);
    expect(st().priority_mode).toBe('MANUAL');
    expect(priority()).toEqual(new Set([banana]));
  });
});

describe('§15 HOME 0 g', () => {
  it('Protein: Crown ON and OFF keep 0 g, and the grams stay editable', () => {
    newHomeDraft('protein');
    const melon = homeAdd(WATERMELON);
    expect(line(melon)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(visible()).toEqual([]);

    homeCrown(melon);
    expect(st().priority_mode).toBe('MANUAL');
    expect(line(melon)).toMatchObject({ planned_grams: 0, lock_type: 'main' });
    expect(visible()).toEqual([melon]);

    homeCrown(melon);
    expect(line(melon).planned_grams).toBe(0);
    expect(priority().has(melon)).toBe(false);

    st().setPlannedGrams(melon, 50);
    expect(line(melon).planned_grams).toBe(50);
  });
});

describe('§16 PRO, on a draft HOME started in AUTO', () => {
  it.each(PROFILES)(
    '%s — 0 g + Crown → 1 g Main; Crown OFF → Main removed, grams editable; + from 0 g → 1 g',
    (profile) => {
      newHomeDraft(profile);
      const melon = proAdd(WATERMELON);
      expect(line(melon).lock_type).not.toBe('main'); // PRO grants nothing automatically

      st().setMainIngredient(melon); // the PRO Crown — the store's default door
      expect(line(melon)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
      expect(st().priority_mode).toBe('MANUAL'); // a conscious PRO crown ends AUTO

      resolveProductBehavior(); // the pass that follows the role transition
      st().setStandardIngredient(melon);
      expect(line(melon)).toMatchObject({ planned_grams: 0, lock_type: 'unlocked' });
      expect(st().productBehaviorSnapshots[melon]).toBeDefined(); // #285

      st().setPlannedGrams(melon, 1);
      expect(line(melon).planned_grams).toBe(1);
    },
  );

  it('PRO never touches the mode of a draft that is already MANUAL', () => {
    st().startNewRecipe('gelato');
    const melon = proAdd(WATERMELON);
    st().setMainIngredient(melon);
    st().setStandardIngredient(melon);
    expect(st().priority_mode).toBe('MANUAL');
  });
});

describe('§13 separated by SURFACE, never by profile', () => {
  it.each(PROFILES)('%s — the same HOME rule for every profile', (profile) => {
    newHomeDraft(profile);
    const [banana, strawberry] = [homeAdd(BANANA, 100), homeAdd(STRAWBERRY, 100)];
    expect(priority()).toEqual(new Set([banana, strawberry]));
    const before = grams();

    homeCrown(banana);
    expect(st().priority_mode).toBe('MANUAL');
    expect(priority()).toEqual(new Set([banana]));
    expect(grams()).toEqual(before);
  });

  it("HOME's padlock never ends AUTO and never reveals a crown", () => {
    newHomeDraft('gelato');
    const strawberry = [homeAdd(BANANA, 100), homeAdd(STRAWBERRY, 100)][1]!;
    homePadlock(strawberry);
    expect(st().priority_mode).toBe('AUTO');
    expect(visible()).toEqual([]);
    homePadlock(strawberry);
    expect(st().priority_mode).toBe('AUTO');
  });

  it('the automatic door never changes the mode', () => {
    newHomeDraft('gelato');
    homeAdd(BANANA, 100);
    homeAdd(CHOCOLATE);
    expect(st().priority_mode).toBe('AUTO');
  });
});

describe('§17 AUTO→MANUAL persistence', () => {
  it('a BASE added after MANUAL does not regain AUTO priority', () => {
    newHomeDraft('gelato');
    const banana = homeAdd(BANANA, 100);
    homeAdd(CHOCOLATE, 100);
    homeCrown(banana);

    const cranberry = homeAdd(CRANBERRY, 80);
    expect(line(cranberry).lock_type).not.toBe('main');
    expect(priority()).toEqual(new Set([banana]));
    expect(st().priority_mode).toBe('MANUAL');
  });

  it('a recalculation keeps the mode and the crowns', () => {
    // A recalculation writes the recipe only through the Apply door,
    // `applyVerifiedRecipeInput`, which needs server-verified authority (served QA
    // exercises it). Neither that write nor the recalculation state knows the
    // mode, so a recalculation cannot change it.
    const store = readFileSync('src/stores/recipeStore.ts', 'utf8');
    const applyDoor = store.slice(
      store.indexOf(
        '      applyVerifiedRecipeInput: (input, productBehaviorSnapshots, options) => {',
      ),
      store.indexOf('      addIngredient: (ingredient, grams = 100) => {'),
    );
    expect(applyDoor.length).toBeGreaterThan(1000);
    expect(applyDoor).not.toContain('priority_mode');
    const studio = readFileSync('src/features/constraint-studio/constraintStudioStore.ts', 'utf8');
    expect(studio).not.toMatch(/priority_mode|setPriorityMode|grantAutomaticPriority/);

    // And the grams a recalculation produces arrive like any grams vector.
    newHomeDraft('gelato');
    const banana = homeAdd(BANANA, 100);
    const chocolate = homeAdd(CHOCOLATE, 100);
    st().setPlannedGramsVector({ [banana]: 140, [chocolate]: 60 });
    expect(st().priority_mode).toBe('AUTO');
    expect(visible()).toEqual([]);
    expect(priority()).toEqual(new Set([banana, chocolate]));

    homeCrown(banana);
    st().setPlannedGramsVector({ [banana]: 150, [chocolate]: 50 });
    expect(st().priority_mode).toBe('MANUAL');
    expect(priority()).toEqual(new Set([banana]));
  });

  it('a refresh keeps the mode; a draft persisted before Package 2A hydrates as MANUAL', () => {
    newHomeDraft('gelato');
    const banana = homeAdd(BANANA, 100);
    const persistedAuto = JSON.parse(JSON.stringify(recipePersistPartialize(st()))) as Record<
      string,
      unknown
    >;
    homeCrown(banana);
    const persistedManual = JSON.parse(JSON.stringify(recipePersistPartialize(st()))) as Record<
      string,
      unknown
    >;
    expect(persistedAuto.priority_mode).toBe('AUTO');
    expect(persistedManual.priority_mode).toBe('MANUAL');

    st().startNewRecipe('gelato'); // what a fresh session starts from
    expect(mergePersistedRecipeState(persistedAuto, st()).priority_mode).toBe('AUTO');
    expect(mergePersistedRecipeState(persistedManual, st()).priority_mode).toBe('MANUAL');
    const legacy = { ...persistedAuto };
    delete legacy.priority_mode;
    expect(mergePersistedRecipeState(legacy, st()).priority_mode).toBe('MANUAL');
  });

  it('every load path starts MANUAL — a reopened recipe shows its Main as the crown it is', () => {
    const autoDraft = () => {
      newHomeDraft('gelato');
      homeAdd(BANANA, 100);
      expect(st().priority_mode).toBe('AUTO');
    };

    autoDraft();
    st().loadRecipeInput(buildRecipeInput(st()));
    expect(st().priority_mode).toBe('MANUAL');
    expect(new Set(visible())).toEqual(priority());

    autoDraft();
    st().startNewRecipe('gelato');
    expect(st().priority_mode).toBe('MANUAL');

    autoDraft();
    st().loadPreset(DEFAULT_PRESET);
    expect(st().priority_mode).toBe('MANUAL');

    autoDraft();
    st().resetToDemo();
    expect(st().priority_mode).toBe('MANUAL');
  });
});
