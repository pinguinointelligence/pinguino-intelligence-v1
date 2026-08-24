/// <reference types="node" />
/**
 * PHASE 5 — Recipe Rescue torture set and deterministic fuzz campaign.
 *
 * Rescue is exercised against the internet corpus with Direction ACTIVE,
 * REACHED, DISABLED and BLOCKED, proving the decoupling holds: an unrelated
 * hard problem must still produce operational advice, and a healthy recipe must
 * produce none.
 *
 * The fuzz pass uses a seeded LCG so every state is reproducible from its seed.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { simulateRescueCandidates } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { VEGAN_VERIFIED_CANONICAL_IDS } from '@/data/ingredients/verifiedVeganToolbox';
import { VEGAN_INTERNET_CORPUS } from './veganInternetCorpus';
import {
  AT,
  byId,
  EMPTY,
  OWNER_PRICES,
  toVeganInput as toInput,
  writeCsv,
} from './veganCampaignInput';
const scale = (input: RecipeInput, match: RegExp, factor: number): RecipeInput => ({
  ...input,
  items: input.items.map((i) =>
    match.test(i.id)
      ? { ...i, planned_grams: Math.max(1, Math.round(i.planned_grams * factor)) }
      : i,
  ),
});
const drop = (input: RecipeInput, match: RegExp): RecipeInput => ({
  ...input,
  items: input.items.filter((i) => !match.test(i.id)),
});

interface Scenario {
  name: string;
  input: RecipeInput;
}
const SCENARIOS: Scenario[] = [
  { name: 'missing oat drink', input: drop(toInput(byId('R01'), -11, 'optimal'), /PI-ING-001565/) },
  { name: 'missing soy drink', input: drop(toInput(byId('R03'), -13, 'optimal'), /PI-ING-002109/) },
  { name: 'missing sucrose', input: drop(toInput(byId('R01'), -12, 'optimal'), /PI-ING-000514/) },
  { name: 'missing dextrose', input: drop(toInput(byId('R09'), -13, 'optimal'), /PI-ING-000494/) },
  {
    name: 'missing fat',
    input: drop(toInput(byId('R23'), -11, 'optimal'), /PI-ING-000163|PI-ING-000299/),
  },
  {
    name: 'missing stabilizer',
    input: drop(toInput(byId('R01'), -11, 'optimal'), /PI-ING-000492/),
  },
  { name: 'missing nut paste', input: drop(toInput(byId('R14'), -12, 'optimal'), /PI-ING-000413/) },
  { name: 'missing cocoa', input: drop(toInput(byId('R03'), -13, 'optimal'), /PI-ING-000717/) },
  {
    name: 'sugar excess',
    input: scale(toInput(byId('R01'), -11, 'optimal'), /PI-ING-000514/, 3.2),
  },
  {
    name: 'sugar shortage',
    input: scale(toInput(byId('R01'), -13, 'optimal'), /PI-ING-000514/, 0.15),
  },
  { name: 'fat excess', input: scale(toInput(byId('R19'), -11, 'optimal'), /PI-ING-000163/, 3.0) },
  {
    name: 'fat shortage',
    input: scale(toInput(byId('R19'), -13, 'optimal'), /PI-ING-000163/, 0.1),
  },
  {
    name: 'fruit excess',
    input: scale(toInput(byId('R05'), -11, 'optimal'), /PI-ING-000406/, 2.0),
  },
  { name: 'nut excess', input: scale(toInput(byId('R14'), -12, 'optimal'), /PI-ING-000413/, 2.6) },
  {
    name: 'cocoa excess',
    input: scale(toInput(byId('R03'), -13, 'optimal'), /PI-ING-000717/, 3.0),
  },
  {
    name: 'insufficient solids',
    input: scale(toInput(byId('R20'), -13, 'optimal'), /PI-ING-001409/, 2.4),
  },
  {
    name: 'water flood / dilution',
    input: scale(toInput(byId('R10'), -11, 'optimal'), /PI-ING-001409/, 1.5),
  },
  {
    name: 'flavour accent (lemon) excess',
    input: scale(toInput(byId('R10'), -12, 'optimal'), /PI-ING-000368/, 2.5),
  },
  {
    name: 'coffee accent excess',
    input: scale(toInput(byId('R11'), -11, 'optimal'), /PI-ING-000166/, 3.0),
  },
  {
    name: 'caramel accent excess',
    input: scale(toInput(byId('R12'), -13, 'optimal'), /PI-ING-000308/, 2.4),
  },
  {
    name: 'protein-bearing shortage',
    input: scale(toInput(byId('R21'), -13, 'optimal'), /PI-ING-000514/, 0.2),
  },
  {
    name: 'almond base dilution',
    input: scale(toInput(byId('R17'), -11, 'optimal'), /PI-ING-001409/, 3.0),
  },
];

describe('Vegan Recipe Rescue torture set', () => {
  it('runs >=20 operational scenarios and never leaves the Vegan family', () => {
    const rows: unknown[][] = [];
    let advised = 0;
    for (const s of SCENARIOS) {
      const before = calculateRecipe(s.input);
      const built = buildOptimizePreview(s.input, EMPTY, AT, {
        effectivePriceOverrides: OWNER_PRICES,
      });
      const report = simulateRescueCandidates({
        input: s.input,
        set: EMPTY,
        createdAt: AT,
        options: { effectivePriceOverrides: OWNER_PRICES },
        bestCurrent: built.ok ? built.preview : null,
      });
      // Vegan eligibility can never widen through rescue.
      for (const sim of report.simulations) {
        expect(
          VEGAN_VERIFIED_CANONICAL_IDS.has(sim.canonicalIngredientId),
          `${s.name}:${sim.canonicalIngredientId}`,
        ).toBe(true);
      }
      // The advisor never mutates the draft.
      expect(veganRecipeEligibilityIssues(s.input.items), s.name).toEqual([]);
      if (report.advice) advised += 1;
      rows.push([
        s.name,
        report.trigger ?? 'none',
        detectViolations(before).length,
        report.current?.hardMetricCount ?? '',
        report.advice ? report.advice.candidate.namePl : '',
        report.advice ? report.advice.rescue.hardMetricCount : '',
        report.advice ? report.advice.simulatedGrams : '',
        report.simulations.length,
        built.ok ? 'PREVIEW' : built.code,
      ]);
    }
    writeCsv(
      'VEGAN_RESCUE_MATRIX.csv',
      [
        'scenario',
        'trigger',
        'violations_before',
        'hard_before',
        'advice_candidate',
        'hard_after',
        'simulated_g',
        'candidates_simulated',
        'preview',
      ],
      rows,
    );
    console.log(`RESCUE_SCENARIOS ${rows.length} WITH_ADVICE ${advised}`);
    expect(rows.length).toBeGreaterThanOrEqual(20);
  }, 3_600_000);
});

describe('Vegan deterministic fuzz campaign', () => {
  it('runs >=500 seeded states without a structural failure', () => {
    let seed = 20260823;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const rows: unknown[][] = [];
    const defects: string[] = [];
    for (let n = 0; n < 520; n += 1) {
      const recipe = VEGAN_INTERNET_CORPUS[Math.floor(rnd() * VEGAN_INTERNET_CORPUS.length)]!;
      const temperature = ([-11, -12, -13] as const)[Math.floor(rnd() * 3)]!;
      const strategy = rnd() < 0.5 ? 'optimal' : 'eco';
      const sweetness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      const softness = (Math.floor(rnd() * 5) - 2) as RecipeDirectionTarget;
      let input = toInput(recipe, temperature, strategy, { sweetness, softness });
      // bounded realistic perturbation
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
      const seedUsed = seed;
      let outcome = 'ok';
      try {
        const built = buildOptimizePreview(input, EMPTY, AT, {
          effectivePriceOverrides: OWNER_PRICES,
        });
        const base = built.ok ? built.preview.proposedInput : input;
        const r = calculateRecipe(base);
        const metrics = [
          r.pod_points,
          r.npac_points,
          r.percentages.water_percent,
          r.percentages.solids_percent,
          r.percentages.fat_percent,
        ];
        if (metrics.some((m) => m !== null && !Number.isFinite(m))) {
          defects.push(`seed ${seedUsed}: non-finite metric`);
          outcome = 'non_finite';
        }
        if (base.items.some((i) => i.planned_grams < 0)) {
          defects.push(`seed ${seedUsed}: negative grams`);
          outcome = 'negative';
        }
        if (built.ok && base.items.some((i) => i.planned_grams === 0)) {
          defects.push(`seed ${seedUsed}: executable zero gram`);
          outcome = 'zero_gram';
        }
        const mains = base.items.filter((i) => i.lock_type === 'main');
        const originalMains = input.items.filter((i) => i.lock_type === 'main');
        if (mains.length !== originalMains.length) {
          defects.push(`seed ${seedUsed}: Main lost`);
          outcome = 'main_lost';
        }
        if (mains.some((m) => m.planned_grams <= 0)) {
          defects.push(`seed ${seedUsed}: Main zeroed`);
          outcome = 'main_zero';
        }
        if (built.ok && Math.abs(plannedSum(base) - 1000) > 1.5) {
          defects.push(`seed ${seedUsed}: batch drift ${plannedSum(base)}`);
          outcome = 'batch_drift';
        }
        if (veganRecipeEligibilityIssues(base.items).length > 0) {
          defects.push(`seed ${seedUsed}: non-vegan leak`);
          outcome = 'vegan_leak';
        }
        rows.push([
          n,
          seedUsed,
          recipe.id,
          temperature,
          strategy,
          sweetness,
          softness,
          built.ok ? 'PREVIEW' : built.code,
          outcome,
        ]);
      } catch (error) {
        defects.push(`seed ${seedUsed}: THREW ${(error as Error).message}`);
        rows.push([
          n,
          seedUsed,
          recipe.id,
          temperature,
          strategy,
          sweetness,
          softness,
          'THREW',
          'crash',
        ]);
      }
    }
    writeCsv(
      'VEGAN_FUZZ_MATRIX.csv',
      [
        'n',
        'seed',
        'recipe_id',
        'temperature',
        'mode',
        'sweetness',
        'hardness',
        'outcome',
        'defect_class',
      ],
      rows,
    );
    console.log(`FUZZ_STATES ${rows.length} DEFECTS ${defects.length}`);
    if (defects.length)
      console.log('FUZZ_DEFECTS ' + JSON.stringify(defects.slice(0, 20), null, 1));
    expect(rows.length).toBeGreaterThanOrEqual(500);
    expect(defects).toEqual([]);
  }, 3_600_000);
});
