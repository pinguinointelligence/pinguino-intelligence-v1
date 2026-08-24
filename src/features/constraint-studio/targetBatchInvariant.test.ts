/**
 * GLOBAL TARGET-MASS INVARIANT (default suite).
 *
 * Discovered by the Vegan fuzz campaign (seed 454174848): a 951 g draft against a
 * 1000 g target came back as an `ok:true` Preview that changed NOTHING and still
 * summed to 951 g. The same draft with Direction inactive reconciled to 1000 g,
 * which is what exposed the bypass — the branch taken when the draft already
 * satisfies every band AND the active Direction preference made no solver move,
 * and nothing restored the batch.
 *
 * The contract is global, not Vegan-specific: for every profile, every mode and
 * every preference, a successful executable proposal must satisfy
 * `abs(sum - target_batch_grams) <= BATCH_SUM_TOLERANCE_G`.
 */
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeDirectionTarget, type RecipeInput } from '@/engine';
import { BATCH_SUM_TOLERANCE_G } from '@/features/recipe-constraints';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import type { VisibleProductType } from '@/features/studio/productType';
import { buildOptimizePreview, plannedSum } from './applyPipeline';
import {
  AT,
  EMPTY,
  OWNER_PRICES,
  buildVeganCampaignInput,
  toVeganInput,
} from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import { VEGAN_INTERNET_CORPUS } from '@/features/vegan-structure/__campaign__/veganInternetCorpus';

// Whole-recipe optimiser proofs: each case runs the real Engine across many
// candidate formulations, so single tests legitimately take tens of seconds
// where the repository default allows five. The timeout is raised for THIS FILE
// only — the default stays in place everywhere else, and no assertion, fixture
// or Engine behaviour is relaxed to fit inside it.
vi.setConfig({ testTimeout: 120_000 });

const FUZZ_SEED = 454174848;

/** Scale one unlocked line so the draft misses the target batch on purpose. */
const missTarget = (input: RecipeInput, factor: number): RecipeInput => {
  const line = input.items.find((i) => i.lock_type === 'unlocked');
  if (!line) throw new Error('no unlocked line to perturb');
  return {
    ...input,
    items: input.items.map((i) =>
      i.id === line.id
        ? { ...i, planned_grams: Math.max(1, Math.round(i.planned_grams * factor)) }
        : i,
    ),
  };
};

const preview = (input: RecipeInput) =>
  buildOptimizePreview(input, EMPTY, AT, { effectivePriceOverrides: OWNER_PRICES });

/** The whole contract, asserted in one place so every case checks the same thing. */
const assertInvariant = (input: RecipeInput, label: string) => {
  const built = preview(input);
  if (!built.ok) return built; // a truthful non-success is always allowed
  const proposed = built.preview.proposedInput;
  const sum = plannedSum(proposed);
  expect(
    Math.abs(sum - input.target_batch_grams),
    `${label}: sum ${sum} vs target`,
  ).toBeLessThanOrEqual(BATCH_SUM_TOLERANCE_G);
  expect(
    proposed.items.filter((i) => i.planned_grams === 0),
    `${label}: zero-gram rows`,
  ).toEqual([]);
  expect(
    proposed.items.filter((i) => i.planned_grams < 0),
    `${label}: negative grams`,
  ).toEqual([]);
  // Main lines must survive: reconciliation may never buy mass by dropping a Main.
  const mainsBefore = input.items.filter((i) => i.lock_type === 'main').length;
  const mainsAfter = proposed.items.filter((i) => i.lock_type === 'main').length;
  expect(mainsAfter, `${label}: Main count`).toBe(mainsBefore);
  expect(
    proposed.items.filter((i) => i.lock_type === 'main' && i.planned_grams <= 0),
    `${label}: zeroed Main`,
  ).toEqual([]);
  expect(
    Number.isFinite(calculateRecipe(proposed).pod_points ?? 0),
    `${label}: finite metrics`,
  ).toBe(true);
  return built;
};

describe('global target-batch invariant', () => {
  // The draft MUST be rebuilt the way the campaign built it. A hand-made 951 g
  // draft is a different state and reconciles even on the pre-fix code, so it
  // would pin nothing. Replaying the campaign's seeded LCG to iteration 212
  // reproduces the exact input that failed.
  const exactFuzzDraft = (): RecipeInput => {
    let seed = 20260823;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let n = 0; n < 520; n += 1) {
      const recipe = VEGAN_INTERNET_CORPUS[Math.floor(rnd() * VEGAN_INTERNET_CORPUS.length)]!;
      const temperature = ([-11, -12, -13] as const)[Math.floor(rnd() * 3)]!;
      const strategy = rnd() < 0.5 ? 'optimal' : 'eco';
      const sweetness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      const softness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      let input = toVeganInput(recipe, temperature, strategy, { sweetness, softness });
      const factor = 0.85 + rnd() * 0.45;
      const target = input.items[Math.floor(rnd() * input.items.length)]!;
      input = {
        ...input,
        items: input.items.map((i) =>
          i.id === target.id && i.lock_type === 'unlocked'
            ? { ...i, planned_grams: Math.max(1, Math.round(i.planned_grams * factor)) }
            : i,
        ),
      };
      if (seed === FUZZ_SEED) return input;
    }
    throw new Error(`fuzz seed ${FUZZ_SEED} never reached`);
  };

  it('the exact fuzz seed 454174848 case reconciles to the target batch', () => {
    const draft = exactFuzzDraft();
    expect(Math.round(plannedSum(draft))).toBe(951);
    expect(draft.target_batch_grams).toBe(1000);
    const built = assertInvariant(draft, 'fuzz seed 454174848');
    // It must be a real success, not a refusal — the mass is legally allocatable.
    expect(built.ok).toBe(true);
  });

  it('an underweight draft never returns a false already_clean', () => {
    const clean = buildVeganCampaignInput('R16', -11, 'optimal');
    const draft = missTarget(clean, 0.9);
    const built = preview(draft);
    // `already_clean` claims the draft is valid AS IS. It is not: it misses the batch.
    if (!built.ok) expect(built.code).not.toBe('already_clean');
  });

  it.each([
    ['underweight -10%', 0.9],
    ['underweight -5%', 0.95],
    ['over-target +8%', 1.08],
    ['over-target +20%', 1.2],
  ])('Vegan OPTIMAL, %s', (label, factor) => {
    assertInvariant(
      missTarget(buildVeganCampaignInput('R16', -11, 'optimal'), factor),
      `vegan ${label}`,
    );
  });

  it.each([
    ['Direction neutral', 0 as RecipeDirectionTarget, 0 as RecipeDirectionTarget],
    ['Sweetness negative', -2 as RecipeDirectionTarget, 0 as RecipeDirectionTarget],
    ['Sweetness positive', 2 as RecipeDirectionTarget, 0 as RecipeDirectionTarget],
    ['Hardness negative', 0 as RecipeDirectionTarget, -2 as RecipeDirectionTarget],
    ['combined preference', 1 as RecipeDirectionTarget, -2 as RecipeDirectionTarget],
  ])('Direction never bypasses the invariant: %s', (label, sweetness, softness) => {
    const clean = buildVeganCampaignInput('R16', -11, 'optimal', { sweetness, softness });
    assertInvariant(missTarget(clean, 0.93), `direction ${label}`);
  });

  it.each([
    ['OPTIMAL', 'optimal' as const],
    ['ECO', 'eco' as const],
  ])('%s honours the invariant on an underweight draft', (label, strategy) => {
    assertInvariant(
      missTarget(buildVeganCampaignInput('R16', -11, strategy), 0.92),
      `mode ${label}`,
    );
  });

  // The invariant is GLOBAL. Each profile's own canonical starter is driven off
  // target in BOTH directions — a Vegan-only fixture would not prove that.
  const starterDraft = (visibleProductType: VisibleProductType, factor: number): RecipeInput => {
    const scaffold = buildCanonicalNewRecipeStarter({
      visibleProductType,
      servingModeId: 'temp_minus_12',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_000,
    });
    // The starter is a scaffold, not a RecipeInput — assemble the executable draft
    // from its own canonical items, category and temperature.
    const input: RecipeInput = {
      mode: 'classic',
      category: scaffold.category,
      target_temperature_c: scaffold.targetTemperatureC,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      items: scaffold.items,
      goals: { formulation_strategy: 'optimal' },
    };
    return missTarget(input, factor);
  };

  const PROFILES: ReadonlyArray<[string, VisibleProductType]> = [
    ['gelato', 'gelato'],
    ['sorbet', 'sorbet'],
    ['vegan', 'vegan'],
    ['protein', 'protein'],
  ];

  it.each(PROFILES)('%s: an underweight starter draft lands on target', (label, type) => {
    assertInvariant(starterDraft(type, 0.9), `${label} underweight`);
  });

  it.each(PROFILES)('%s: an over-target starter draft lands on target', (label, type) => {
    assertInvariant(starterDraft(type, 1.15), `${label} over-target`);
  });
});
