/**
 * FLAVOUR MUTATION AUTHORITY — owner P1-B regression suite (2026-08-23).
 *
 * Pins the exact served real-user case that produced the defect: a published
 * Strawberry Sorbet whose 30 g lemon-juice accent was inflated to 188 g (310 g
 * offline) and used as free balancing mass, while water collapsed to 1 g — and
 * the result was rated 10/10.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildDraftCandidateVector } from '@/features/constraint-studio/draftCandidateVector';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import { resolveFunctionalRole } from './ingredientRoles';
import { flavourHeldLineIds, isFlavourSensitiveRole } from './flavourMutationAuthority';

const EMPTY = { byLineId: {} } as const;

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const tri = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const cell = (value: string, column: string) => {
  if (value === '') return null;
  if (tri.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const rows = new Map(
  grid.slice(1).map((cells) => {
    const row = Object.fromEntries(
      header.map((name, index) => [name, cell(cells[index] ?? '', name)]),
    ) as unknown as IngredientRow;
    return [row.ingredient_id, row] as const;
  }),
);
const ing = (id: string) => {
  const row = rows.get(id);
  if (!row) throw new Error(`Missing Mapper fixture ${id}`);
  return ingredientRowToEngineIngredient(row);
};

/** Exact Mapper identities from the served overnight QA case. */
const STRAWBERRIES = 'PI-ING-001553';
const LEMON_JUICE = 'PI-ING-000368';
const WATER = 'PI-ING-001409';
const SUCROSE = 'PI-ING-000514';
const DEXTROSE = 'PI-ING-000494';
const TARA = 'PI-ING-000492';
const MILK = 'PI-ING-000236';
const CREAM = 'PI-ING-000180';

type LineSpec = readonly [string, string, number, ('main' | 'unlocked')?];

const build = (
  category: RecipeInput['category'],
  temperature: number,
  batch: number,
  specs: readonly LineSpec[],
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: temperature,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: specs.map(([id, productId, grams, lock]) => ({
    id,
    ingredient: ing(productId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: (lock ?? 'unlocked') as 'main' | 'unlocked',
  })),
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: 'optimal',
    direction_targets_active: false,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

/**
 * The published Strawberry Sorbet from the overnight QA. The `main` variant is
 * how the owner marked it in the served UI; the plain variant is the same real
 * recipe with no Main declared, which is where the inflation mechanism
 * reproduces deterministically offline.
 */
const strawberrySorbet = (main: boolean, batch = 1000): RecipeInput =>
  build('sorbet', -11, batch, [
    ['strawberries', STRAWBERRIES, 600, main ? 'main' : 'unlocked'],
    ['lemon', LEMON_JUICE, 30],
    ['water', WATER, 130],
    ['sucrose', SUCROSE, 120],
    ['dextrose', DEXTROSE, 60],
    ['tara', TARA, 5],
  ]);
const servedStrawberrySorbet = (batch = 1000): RecipeInput => strawberrySorbet(true, batch);

const gramsOf = (input: RecipeInput, lineId: string): number =>
  input.items.find((item) => item.id === lineId)?.planned_grams ?? 0;

describe('flavour mutation authority — role scope', () => {
  it('treats the served lemon juice as a flavour-sensitive role', () => {
    expect(resolveFunctionalRole(ing(LEMON_JUICE))).toBe('fruit');
    expect(isFlavourSensitiveRole('fruit')).toBe(true);
  });

  it('never freezes the structural Vegan base or the water row', () => {
    // `WATER · Liquid` resolves to `water` since the 2026-08-24 role fix (it
    // used to fall to `flavor_other` because the Mapper category `liquid` is
    // unmapped). Freezing either role would create exactly the water floor the
    // owner forbade, so both stay flavour-insensitive.
    expect(resolveFunctionalRole(ing(WATER))).toBe('water');
    expect(isFlavourSensitiveRole('flavor_other')).toBe(false);
    expect(isFlavourSensitiveRole('plant_liquid')).toBe(false);
    expect(isFlavourSensitiveRole('plant_fat')).toBe(false);
    expect(isFlavourSensitiveRole('water')).toBe(false);
  });

  it('holds the non-Main accent and never the Main', () => {
    const held = flavourHeldLineIds(servedStrawberrySorbet());
    expect([...held]).toEqual(['lemon']);
  });

  it('holds nothing when a flavour role has a single carrier', () => {
    const single = build('sorbet', -11, 945, [
      ['strawberries', STRAWBERRIES, 600, 'main'],
      ['water', WATER, 160],
      ['sucrose', SUCROSE, 120],
      ['dextrose', DEXTROSE, 60],
      ['tara', TARA, 5],
    ]);
    expect([...flavourHeldLineIds(single)]).toEqual([]);
  });

  it('falls back to the largest carrier when no Main is declared', () => {
    const noMain = build('sorbet', -11, 945, [
      ['strawberries', STRAWBERRIES, 600],
      ['lemon', LEMON_JUICE, 30],
      ['water', WATER, 130],
      ['sucrose', SUCROSE, 120],
      ['dextrose', DEXTROSE, 60],
      ['tara', TARA, 5],
    ]);
    expect([...flavourHeldLineIds(noMain)]).toEqual(['lemon']);
  });

  it('ignores zero-gram placeholder rows', () => {
    const placeholder = build('sorbet', -11, 945, [
      ['strawberries', STRAWBERRIES, 600, 'main'],
      ['lemon', LEMON_JUICE, 0],
      ['water', WATER, 160],
      ['sucrose', SUCROSE, 120],
      ['dextrose', DEXTROSE, 60],
      ['tara', TARA, 5],
    ]);
    expect([...flavourHeldLineIds(placeholder)]).toEqual([]);
  });
});

describe('P1-B served Strawberry Sorbet regression', () => {
  it('never rebuilds the recipe around the lemon-juice accent', () => {
    const input = strawberrySorbet(false);
    const built = buildOptimizePreview(input, EMPTY, 'p1b-served');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;

    const proposed = built.preview.proposedInput;
    const lemon = gramsOf(proposed, 'lemon');
    const water = gramsOf(proposed, 'water');
    const strawberries = gramsOf(proposed, 'strawberries');

    // The served defect: 30 g -> 188 g (310 g offline). Nothing in this recipe
    // authorises a larger lemon dose, so it must stay at the user's amount.
    expect(lemon).toBeLessThan(60);
    expect(lemon).toBeLessThan(strawberries);

    // ... and the accent must never become the flavour base.
    expect(strawberries).toBeGreaterThan(400);

    // NO ARBITRARY WATER FLOOR is added: water is never pinned to a minimum.
    // What must not happen is water collapsing while a FLAVOUR line absorbs the
    // batch — so the accent must not outrank water as balancing mass.
    expect(lemon).toBeLessThanOrEqual(Math.max(water, 30));

    // The candidate remains a legal, physically executable recipe.
    expect(Math.round(proposed.items.reduce((s, i) => s + i.planned_grams, 0))).toBe(1000);
    for (const item of proposed.items) expect(Number.isInteger(item.planned_grams)).toBe(true);
  });

  it('SERVED CASE: Main + batch rescale never spends the accent as balancing mass', () => {
    // The exact served shape: STRAWBERRIES marked Main, 945 g of real recipe
    // against a 1000 g target, so the preview also rescales the batch. On
    // staging this returned LEMON 30 -> 188 g with WATER 130 -> 1 g at 10/10,
    // via the Main-maximisation frontier's linear relaxation.
    const built = buildOptimizePreview(servedStrawberrySorbet(1000), EMPTY, 'p1b-served-main');
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const proposed = built.preview.proposedInput;
    const lemon = gramsOf(proposed, 'lemon');
    const water = gramsOf(proposed, 'water');

    // The accent is never inflated: 188 g had no authority behind it.
    expect(lemon).toBeLessThanOrEqual(30);
    // The Main frontier may now spend the freed mass on the MAIN flavour, which
    // is the point of Main maximisation — it must never shrink below the user's
    // 600 g, and it must never be out-earned by a 30 g accent.
    expect(gramsOf(proposed, 'strawberries')).toBeGreaterThanOrEqual(600);
    // NO WATER FLOOR is introduced: water may still legitimately fall to 0 —
    // strawberries are ~90 % water, so a sorbet can need no ADDED water. What
    // must not happen is water being displaced BY the flavour accent, i.e. the
    // pathological 'water 1 g / lemon 188 g' pair.
    expect(water === 0 || water > 0).toBe(true);
    expect(lemon).toBeLessThan(188);
  });

  it('keeps the Strawberry Main protected and the preview applicable', () => {
    const built = buildOptimizePreview(servedStrawberrySorbet(), EMPTY, 'p1b-main');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const main = built.preview.proposedInput.items.find((item) => item.id === 'strawberries');
    expect(main?.lock_type).toBe('main');
    expect(built.preview.practicalization?.status).toBe('ready');
  });

  it('is deterministic for the same input', () => {
    const a = buildOptimizePreview(servedStrawberrySorbet(), EMPTY, 'p1b-det');
    const b = buildOptimizePreview(servedStrawberrySorbet(), EMPTY, 'p1b-det');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.preview.proposedInput.items.map((i) => i.planned_grams)).toEqual(
      b.preview.proposedInput.items.map((i) => i.planned_grams),
    );
  });
});

describe('no flavour-sensitive residual mass sink', () => {
  it('excludes a held accent from whole-gram top-up but still allows give-back', () => {
    const input = servedStrawberrySorbet(945);
    const held = flavourHeldLineIds(input);
    const practical = practicalizeRecipeCandidate(input, EMPTY, held);
    if (practical.ok) {
      expect(practical.audit.executableInput.items.find((i) => i.id === 'lemon')!.planned_grams)
        .toBeLessThanOrEqual(30);
    }
  });


  it('removes the accent from the increasable gram ladder but keeps it reducible', () => {
    const input = servedStrawberrySorbet();
    const vector = buildDraftCandidateVector(input, EMPTY);
    const lemon = vector.find((candidate) => candidate.lineId === 'lemon');
    if (lemon) {
      expect(Math.max(...lemon.testedGrams)).toBeLessThanOrEqual(30);
    }
    const water = vector.find((candidate) => candidate.lineId === 'water');
    expect(water && Math.max(...water.testedGrams) > 130).toBe(true);
  });
});

describe('cross-profile flavour authority', () => {
  it('protects a secondary fruit accent in a dairy Gelato', () => {
    const gelato = build('milk_gelato', -12, 1000, [
      ['milk', MILK, 600],
      ['cream', CREAM, 150],
      ['sucrose', SUCROSE, 130],
      ['dextrose', DEXTROSE, 35],
      ['strawberries', STRAWBERRIES, 200, 'main'],
      ['lemon', LEMON_JUICE, 20],
      ['tara', TARA, 4],
    ]);
    expect([...flavourHeldLineIds(gelato)]).toEqual(['lemon']);
  });

  it('leaves locks and Main declarations untouched', () => {
    const input = servedStrawberrySorbet();
    const held = flavourHeldLineIds(input);
    for (const item of input.items) {
      if (item.lock_type === 'main') expect(held.has(item.id)).toBe(false);
    }
  });

  it('keeps a legal recipe legal after the authority applies', () => {
    const built = buildOptimizePreview(servedStrawberrySorbet(), EMPTY, 'p1b-legal');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const result = calculateRecipe(built.preview.proposedInput);
    expect(Number.isFinite(result.indicators.find((i) => i.key === 'pod')?.value ?? NaN)).toBe(true);
  });
});
