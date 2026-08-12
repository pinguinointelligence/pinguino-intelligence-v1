import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type EngineIngredient, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET, DEMO_PRESETS } from '@/data/demoPresets';
import { findDemoIngredient } from '@/data/demoIngredients';
import { APPENDIX_A_ITEMS } from '@/engine/__fixtures__/golden/composition';
import { verifyEcoFlavourProtection } from '@/features/formulation-strategy/flavourFloor';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import { buildOptimizePreview, commitPreview } from './applyPipeline';

const NO = { byLineId: {} };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fromPreset = (id: string, category: RecipeInput['category'] = 'milk_gelato'): RecipeInput => {
  const preset = DEMO_PRESETS.find((entry) => entry.id === id)!;
  return {
    items: clone(preset.items),
    mode: 'classic',
    category,
    target_temperature_c: preset.target_temperature_c,
    target_batch_grams: preset.target_batch_grams,
    machine_capacity_grams: preset.machine_capacity_grams,
    goals: { formulation_strategy: 'optimal' },
  };
};

const pistachioInput = (): RecipeInput => {
  const input: RecipeInput = {
    items: clone(DEFAULT_PRESET.items), mode: 'classic', category: 'milk_gelato',
    target_temperature_c: -11, target_batch_grams: 1000, machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
  };
  input.items = [
    ...input.items.map((item) =>
      item.ingredient.id === 'milk_3_5' ? { ...item, planned_grams: item.planned_grams - 50 } : item,
    ),
    {
      id: 'pistachio-main', ingredient: findDemoIngredient('pistachio_paste')!,
      planned_grams: 50, actual_grams: null, lock_type: 'main',
    },
  ];
  return input;
};
const whiskyInput = (): RecipeInput => {
  const whisky: EngineIngredient = {
    id: 'PI-ING-000038', canonical_ingredient_id: 'PI-ING-000038', identity_provenance: 'mapper',
    name: 'WHISKY 40% · Spirit', category: 'alcohol',
    composition: {
      water_percent: 68.4, solids_percent: 0, fat_percent: 0, protein_percent: 0,
      carbohydrate_percent: 0, sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0,
      dextrose_percent: 0, fructose_percent: 0, lactose_percent: 0, polyol_percent: 0,
      fiber_percent: 0, salt_percent: 0, alcohol_percent: 31.6, kcal_per_100g: 250,
    },
    pod_value: 0, pac_value: 233.84, de_value: null, cost_per_kg: 12, cost_currency: 'EUR',
    confidence_score: 98, source_type: 'verified_db', is_verified: true,
  };
  return {
    items: [
      ...APPENDIX_A_ITEMS.map((item) => ({ ...item, ingredient: { ...item.ingredient } })),
      { id: 'whisky-main', ingredient: whisky, planned_grams: 20, actual_grams: null, lock_type: 'main' },
    ],
    mode: 'classic', category: 'milk_gelato', target_temperature_c: -11,
    target_batch_grams: 1000, machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
  };
};

const STRAWBERRY: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553', canonical_ingredient_id: 'PI-ING-001553', name: 'Strawberry',
};
const BANANA: EngineIngredient = {
  ...findDemoIngredient('banana')!,
  id: 'PI-ING-000345', canonical_ingredient_id: 'PI-ING-000345', name: 'Banana',
};
const strawberryInput = (): RecipeInput => {
  const input = fromPreset('raspberry-premium');
  return {
    ...input,
    items: input.items.map((item) =>
      item.lock_type === 'main' ? { ...item, ingredient: STRAWBERRY } : item,
    ),
  };
};
const mainLine = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id, ingredient, planned_grams: grams, actual_grams: null, lock_type: 'main' as const,
});
const multiMain = (ratio: '1:1' | '2:1'): RecipeInput => ({
  mode: 'classic', category: 'milk_gelato', target_temperature_c: -13,
  target_batch_grams: 1000, machine_capacity_grams: null,
  items: ratio === '1:1'
    ? [mainLine('banana', BANANA, 100), mainLine('strawberry', STRAWBERRY, 100)]
    : [mainLine('banana', BANANA, 200), mainLine('strawberry', STRAWBERRY, 100)],
  goals: { formulation_strategy: 'optimal' },
});

const mainTotal = (input: RecipeInput) =>
  input.items.filter((item) => item.lock_type === 'main').reduce((sum, item) => sum + item.planned_grams, 0);

function expectMaximized(input: RecipeInput) {
  const result = buildOptimizePreview(input, NO, '2026-08-11T12:00:00.000Z');
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return null;
  const proof = result.preview.mainObjective;
  expect(proof).toBeDefined();
  expect(proof!.startingMainGrams).toBeCloseTo(mainTotal(input), 8);
  expect(proof!.exactAcceptedMainGrams).toBeGreaterThanOrEqual(proof!.startingMainGrams);
  expect(proof!.executableMainGrams).toBeGreaterThanOrEqual(proof!.startingMainGrams - 0.05);
  expect(proof!.attempts).toBeGreaterThan(0);
  expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
  const committed = commitPreview(
    input, NO, result.preview, '2026-08-11T12:01:00.000Z', `main-${input.items[0]!.id}`,
  );
  expect(committed.ok, JSON.stringify(committed)).toBe(true);
  return result.preview;
}

describe('Main flavour priority lexicographic objective', () => {
  it.each([
    ['Strawberry', strawberryInput, 677, 678],
    ['Whisky', whiskyInput, 49, 50],
    ['Pistachio', pistachioInput, 140, 141],
  ] as const)('reports and trustlessly applies the maximum accepted %s carrier', (_name, fixture, maximum, firstRejected) => {
    const preview = expectMaximized(fixture());
    if (!preview) return;
    expect(preview.mainObjective).toMatchObject({
      status: expect.stringMatching(/maximized|held_by_contract|no_admissible_increase/),
      technicalScore: expect.any(Number),
    });
    expect(preview.mainObjective!.executableMainGrams).toBe(maximum);
    expect(preview.mainObjective!.firstHigherRejectedGrams).toBe(firstRejected);
    if (preview.mainObjective!.firstHigherRejectedGrams !== null) {
      expect(preview.mainObjective!.firstHigherRejectedGrams).toBeGreaterThan(
        preview.mainObjective!.executableMainGrams,
      );
      expect(preview.mainObjective!.firstHigherRejectedReason).not.toBeNull();
    }
  });

  it('proves the mandatory Pistachio whole-gram frontier and names the first rejected quantum', () => {
    const input = pistachioInput();
    const preview = expectMaximized(input);
    if (!preview) return;
    const pistachio = preview.proposedInput.items.find((item) => item.id === 'pistachio-main')!;
    expect(preview.mainObjective!.executableMainGrams).toBe(140);
    expect(pistachio.planned_grams).toBe(140);
    expect(preview.mainObjective!.firstHigherRejectedGrams).toBe(141);
    expect(preview.mainObjective!.firstHigherRejectedReason).toBe('hard_gate');
  });

  it('trustless Apply rejects a self-consistent but non-maximal Main proof', () => {
    const input = pistachioInput();
    const built = buildOptimizePreview(input, NO, '2026-08-11T12:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok || built.preview.practicalization?.status !== 'ready') return;
    const forged = clone(built.preview);
    const pistachio = forged.proposedInput.items.find((item) => item.id === 'pistachio-main')!;
    const donor = forged.proposedInput.items.find((item) => item.ingredient.id === 'milk_3_5')!;
    const maximum = built.preview.mainObjective!.executableMainGrams;
    const underMax: RecipeInput = {
      ...forged.proposedInput,
      items: forged.proposedInput.items.map((item) =>
        item.id === pistachio.id
          ? { ...item, planned_grams: maximum - 1 }
          : item.id === donor.id
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };
    const practical = practicalizeRecipeCandidate(underMax, NO);
    expect(practical.ok).toBe(true);
    if (!practical.ok) return;
    forged.proposedInput = practical.audit.executableInput;
    forged.practicalization = { status: 'ready', audit: practical.audit };
    forged.mainObjective = {
      ...forged.mainObjective!,
      exactAcceptedMainGrams: maximum - 1,
      executableMainGrams: maximum - 1,
      firstHigherRejectedGrams: maximum,
      firstHigherRejectedReason: 'hard_gate',
      technicalScore: 10,
    };
    const committed = commitPreview(
      input,
      NO,
      forged,
      '2026-08-11T12:01:00.000Z',
      'forged-under-max',
    );
    expect(committed).toMatchObject({ ok: false, code: 'main_identity_violated' });
    if (!committed.ok) expect(committed.messagePl).toMatch(/maksymalnym wykonalnym/i);
  });

  it.each([
    ['1:1', 1, 670, 672],
    ['2:1', 2, 687, 690],
  ] as const)('maximizes Multi-Main %s as one group without changing the ratio', (ratio, expected, maximum, firstRejected) => {
    const preview = expectMaximized(multiMain(ratio));
    if (!preview) return;
    const [banana, strawberry] = preview.proposedInput.items.filter((item) => item.lock_type === 'main');
    expect(banana!.planned_grams / strawberry!.planned_grams).toBeCloseTo(expected, 7);
    expect(preview.mainObjective!.executableMainGrams).toBe(maximum);
    expect(preview.mainObjective!.firstHigherRejectedGrams).toBe(firstRejected);
  });

  it('lets Main flavour priority override ECO pressure while ECO may settle the other lines', () => {
    const input = pistachioInput();
    input.goals = { ...input.goals, formulation_strategy: 'eco' };
    const preview = expectMaximized(input);
    if (!preview) return;
    expect(mainTotal(preview.proposedInput)).toBeGreaterThanOrEqual(mainTotal(input) - 0.05);
    expect(verifyEcoFlavourProtection(input, preview.proposedInput).ok).toBe(true);
  });
});
