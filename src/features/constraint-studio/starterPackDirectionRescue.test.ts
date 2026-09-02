import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  buildDirectionFallbackCandidatePreview,
  buildOptimizePreview,
  buildStarterPackRescueSimulationInput,
  commitPreview,
} from './applyPipeline';
import { buildDirectionFallback } from './directionFallback';
import {
  STARTER_PACK_RESCUE_MAPPER_IDS,
  buildStarterPackDirectionRescue,
  shouldRunStarterPackDirectionRescue,
  starterPackRescueEligibility,
} from './starterPackDirectionRescue';

vi.setConfig({ testTimeout: 600_000 });

const AT = '2026-08-28T09:00:00.000Z';
const NONE = { byLineId: {} } as const;
const EXPECTED_IDS = [
  'PI-ING-000494',
  'PI-ING-000496',
  'PI-ING-000456',
  'PI-ING-001645',
  'PI-ING-000270',
  'PI-ING-000260',
  'PI-ING-002114',
] as const;

const source = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [header = [], ...records] = parseCsv(source);
const index = new Map(header.map((name, position) => [name, position]));
const numericFields = new Set([
  'data_confidence_percent',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'saturated_fat_percent',
  'milk_fat_percent',
  'non_fat_milk_solids_percent',
  'protein_percent',
  'aerating_protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'ash_percent',
  'acidity_percent',
  'brix',
  'dry_matter_percent',
  'pod_value',
  'pac_value',
  'de_value',
  'sweetness_factor',
  'freezing_factor',
  'stabilizer_activity',
  'recommended_dosage_percent_min',
  'recommended_dosage_percent_max',
  'kcal_per_100g',
  'cost_per_kg',
  'shelf_life_days',
]);

const mapperRow = (ingredientId: string): IngredientRow => {
  const record = records.find(
    (candidate) => candidate[index.get('ingredient_id')!] === ingredientId,
  );
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    header.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (numericFields.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      ) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  strawberry: 'PI-ING-001553',
  watermelon: 'PI-ING-000405',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  main = false,
): RecipeInput['items'][number] => ({
  id,
  ingredient: ingredientRowToEngineIngredient(mapperRow(ingredientId)),
  planned_grams: grams,
  actual_grams: null,
  lock_type: main ? 'main' : 'unlocked',
  ...(main ? { main_ratio_weight: 1 } : {}),
});

const ownerHardnessMinusTwo = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: -2, creaminess: 0, flavor: 0 },
  },
  items: [
    line('milk', IDS.milk, 300),
    line('cream', IDS.cream, 127),
    line('smp', IDS.smp, 62),
    line('sucrose', IDS.sucrose, 126),
    line('dextrose', IDS.dextrose, 7),
    line('tara', IDS.tara, 5),
    line('strawberry-main', IDS.strawberry, 187, true),
    line('watermelon-main', IDS.watermelon, 186, true),
  ],
});

describe('Starter Pack Direction Rescue V1 gates', () => {
  it('uses the exact closed seven-item owner allowlist in stable order', () => {
    expect(STARTER_PACK_RESCUE_MAPPER_IDS).toEqual(EXPECTED_IDS);
    expect(new Set(STARTER_PACK_RESCUE_MAPPER_IDS).size).toBe(7);
    expect(STARTER_PACK_RESCUE_MAPPER_IDS).not.toContain('PI-ING-000492');
  });

  it('triggers only after a supported active target remains unreached and normal search is exhausted', () => {
    const input = ownerHardnessMinusTwo();
    expect(shouldRunStarterPackDirectionRescue(input, { ok: false, code: 'no_proposal' })).toBe(
      true,
    );
    expect(
      shouldRunStarterPackDirectionRescue(
        { ...input, goals: undefined },
        { ok: false, code: 'no_proposal' },
      ),
    ).toBe(false);
    expect(shouldRunStarterPackDirectionRescue(input, { ok: false, code: 'blocked_science' })).toBe(
      false,
    );
  });

  it('filters dairy/egg from Sorbet, non-vegan products from Vegan, and all rescue from blocked Protein Direction', () => {
    expect(starterPackRescueEligibility('PI-ING-001645', 'sorbet')).toMatchObject({
      eligible: false,
    });
    expect(starterPackRescueEligibility('PI-ING-000270', 'sorbet')).toMatchObject({
      eligible: false,
    });
    expect(starterPackRescueEligibility('PI-ING-000260', 'sorbet')).toMatchObject({
      eligible: false,
    });
    expect(starterPackRescueEligibility('PI-ING-001645', 'vegan_gelato')).toMatchObject({
      eligible: false,
    });
    expect(starterPackRescueEligibility('PI-ING-000270', 'vegan_gelato')).toMatchObject({
      eligible: false,
    });
    expect(starterPackRescueEligibility('PI-ING-000496', 'vegan_gelato')).toMatchObject({
      eligible: true,
    });
    expect(starterPackRescueEligibility('PI-ING-002114', 'vegan_gelato')).toMatchObject({
      eligible: true,
    });
    expect(starterPackRescueEligibility('PI-ING-000496', 'protein_gelato')).toMatchObject({
      eligible: false,
    });
  });

  it('evaluates exactly one absent Starter Pack product at a time without mutating the draft', () => {
    const input = ownerHardnessMinusTwo();
    const before = structuredClone(input);
    const seen: string[][] = [];
    const report = buildStarterPackDirectionRescue({
      input,
      set: NONE,
      createdAt: AT,
      normalResult: { ok: false, code: 'no_proposal' },
      options: { productBehaviorSnapshots: productBehaviorTestSnapshots(input) },
      evaluateCandidate: ({ simulatedInput, candidate }) => {
        const additions = simulatedInput.items
          .filter((item) => !input.items.some((existing) => existing.id === item.id))
          .map((item) => item.ingredient.canonical_ingredient_id ?? item.ingredient.id);
        seen.push(additions);
        expect(additions).toEqual([candidate.mapperId]);
        return { ok: false, code: 'no_proposal' };
      },
    });
    expect(input).toEqual(before);
    expect(report.records).toHaveLength(7);
    expect(report.best).toBeNull();
    expect(seen.every((ids) => ids.length === 1)).toBe(true);
    expect(
      seen.flat().every((id) => EXPECTED_IDS.includes(id as (typeof EXPECTED_IDS)[number])),
    ).toBe(true);
  });

  it('holds only the probe internally while preserving locks, target batch and the complete Multi-Main set', () => {
    const input = ownerHardnessMinusTwo();
    input.items = input.items.map((item) =>
      item.id === 'sucrose'
        ? { ...item, lock_type: 'grams' as const }
        : item.id === 'cream'
          ? { ...item, lock_type: 'percent' as const }
          : item,
    );
    const set = {
      byLineId: {
        sucrose: { mode: 'locked' as const, grams: 126 },
        cream: { mode: 'percent' as const, percent: 12.7 },
      },
    };
    const simulated = buildStarterPackRescueSimulationInput(input, set, 'PI-ING-000496', 20);
    expect(simulated).not.toBeNull();
    expect(simulated?.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(
      1_000,
      9,
    );
    expect(simulated?.items.find((item) => item.id === 'sucrose')).toMatchObject({
      planned_grams: 126,
      lock_type: 'grams',
    });
    expect(simulated?.items.find((item) => item.id === 'cream')).toMatchObject({
      planned_grams: 127,
      lock_type: 'percent',
    });
    expect(simulated?.items.find((item) => item.id === 'strawberry-main')).toMatchObject({
      planned_grams: 187,
      lock_type: 'main',
    });
    expect(simulated?.items.find((item) => item.id === 'watermelon-main')).toMatchObject({
      planned_grams: 186,
      lock_type: 'main',
    });
    expect(
      simulated?.items.find((item) => item.id === 'starter-pack-rescue:PI-ING-000496'),
    ).toMatchObject({
      planned_grams: 20,
      lock_type: 'grams',
      actual_grams: null,
    });
  });

  it('scales the exact Gellatti Stabilizer profile dose with a non-1000 g target batch', () => {
    const input = ownerHardnessMinusTwo();
    input.target_batch_grams = 500;
    input.items = input.items.map((item) => ({ ...item, planned_grams: item.planned_grams / 2 }));
    const simulated = buildStarterPackRescueSimulationInput(input, NONE, 'PI-ING-002114', 1.15);
    expect(simulated).not.toBeNull();
    expect(simulated?.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(500, 9);
    expect(
      simulated?.items.find((item) => item.id === 'starter-pack-rescue:PI-ING-002114'),
    ).toMatchObject({
      planned_grams: 1.15,
      lock_type: 'grams',
      actual_grams: null,
    });
  });

  it('runs the exact owner Hardness -2 fixture through the real bounded Engine search', () => {
    const input = ownerHardnessMinusTwo();
    const before = structuredClone(input);
    const normalStarted = performance.now();
    const normalResult = buildOptimizePreview(input, NONE, AT);
    const normalRuntimeMs = performance.now() - normalStarted;
    expect(normalResult).toMatchObject({ ok: false, code: 'no_proposal' });
    const report = buildStarterPackDirectionRescue({
      input,
      set: NONE,
      createdAt: AT,
      normalResult,
    });
    console.log('STARTER_PACK_NORMAL_SOLVER_MS', normalRuntimeMs);
    console.log('STARTER_PACK_RESCUE_TOTAL_MS', report.totalRuntimeMs);
    console.log(
      'STARTER_PACK_OWNER_MATRIX',
      JSON.stringify(
        report.records.map((record) => ({
          id: record.mapperId,
          eligible: record.eligible,
          reason: record.reason,
          grams: record.bestGramsTested,
          reached: record.targetReached,
          npac: record.npac,
          pod: record.pod,
          score: record.score,
          distance: record.bandDistance,
          movement: record.totalRecipeMovement,
          hard: record.hardGates,
          main: record.mainPreserved,
          ms: record.runtimeMs,
        })),
      ),
    );
    expect(input).toEqual(before);
    expect(report.records).toHaveLength(7);
    expect(
      report.records
        .filter((record) => record.reason === 'already_present')
        .map((record) => record.mapperId),
    ).toEqual(['PI-ING-000494', 'PI-ING-000270']);
  });

  it('runs the exact owner Hardness -2 fixture through fast adjacent Direction before optional ingredients', () => {
    const input = ownerHardnessMinusTwo();
    const before = structuredClone(input);
    const exactStarted = performance.now();
    const normalResult = buildOptimizePreview(input, NONE, AT, {
      directionFallbackPass: true,
      skipRescueAssessment: true,
    });
    const exactRuntimeMs = performance.now() - exactStarted;
    const report = buildDirectionFallback({
      input,
      set: NONE,
      createdAt: AT,
      normalResult,
      evaluateCandidate: ({ targets, attemptIndex }) =>
        buildDirectionFallbackCandidatePreview(input, NONE, targets, attemptIndex, AT, {
          directionFallbackPass: true,
          skipRescueAssessment: true,
        }),
    });
    console.log(
      'DIRECTION_FALLBACK_OWNER_MATRIX',
      JSON.stringify({
        exactRuntimeMs,
        exactReached: normalResult.ok && normalResult.preview.directionAssessment?.reached === true,
        attempts: report.attempts.map((attempt) => ({
          hardness: attempt.targets.softness,
          reached: attempt.targetReached,
          runtimeMs: attempt.runtimeMs,
          score: attempt.preview?.directionAssessment?.score ?? null,
          npac: attempt.preview ? calculateRecipe(attempt.preview.proposedInput).npac_points : null,
          pod: attempt.preview ? calculateRecipe(attempt.preview.proposedInput).pod_points : null,
        })),
        totalRuntimeMs: report.totalRuntimeMs,
      }),
    );
    expect(input).toEqual(before);
    expect(normalResult).toMatchObject({ ok: false, code: 'no_proposal' });
    expect(report.attempts).toHaveLength(1);
    expect(report.best?.targets.softness).toBe(-1);
    expect(report.best?.targetReached).toBe(true);
    expect(report.best?.preview?.directionAssessment?.score).toBe(10);
    expect(exactRuntimeMs + report.totalRuntimeMs).toBeLessThan(15_000);
    const applied = commitPreview(
      input,
      NONE,
      report.best!.preview!,
      AT,
      'owner-direction-fallback-apply',
    );
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.verified.input.goals?.direction_targets?.softness).toBe(-1);
      expect(applied.verified.input.items).toEqual(report.best!.preview!.proposedInput.items);
    }
  });
});
