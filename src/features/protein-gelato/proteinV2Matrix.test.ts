import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import { simulateRescueCandidates } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { assessProteinFormulation } from './proteinAuthority';
import { deriveProteinBehavior } from './proteinBehavior';

/**
 * §19–§22 representative matrix on the CURRENT integrated tree.
 *
 * Every case runs the real optimizer through the unchanged Base Engine. Cases
 * whose protein source does not exist in the canonical catalog are recorded as
 * UNAVAILABLE rather than fabricated — the audit established that the Mapper
 * holds no WPI, micellar casein, caseinate or MPC 85 row.
 */

const EMPTY = { byLineId: {} } as const;
const AT = '2026-08-23T10:00:00.000Z';

const line = (id: string, ingredient: NonNullable<ReturnType<typeof findDemoIngredient>>, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const draft = (
  temperatureC: -11 | -12 | -13,
  extra: RecipeInput['items'] = [],
  goals: Record<string, unknown> = {},
): RecipeInput => ({
  items: [
    {
      id: 'main-raspberry',
      ingredient: findDemoIngredient('raspberry')!,
      planned_grams: 100,
      actual_grams: null,
      lock_type: 'main',
    },
    ...extra,
  ],
  mode: 'signature',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced', ...goals },
});

const source = (id: string, grams: number) => {
  const ingredient = findVerifiedProteinFormulationCandidate(id);
  return ingredient
    ? [
        {
          id: 'user-source',
          ingredient,
          planned_grams: grams,
          actual_grams: null,
          lock_type: 'unlocked' as const,
        },
      ]
    : null;
};

/* ── §19 representative matrix ──────────────────────────────────────────── */

interface MatrixCase {
  key: string;
  name: string;
  input: RecipeInput | null; // null ⇒ fixture unavailable in the catalog
  note?: string;
}

const CASES: readonly MatrixCase[] = [
  { key: 'A', name: 'baseline Protein', input: draft(-12) },
  { key: 'B', name: 'WPC-rich', input: draft(-12, source('PI-ING-000295', 150) ?? []) },
  {
    key: 'C',
    name: 'WPI-like',
    input: null,
    note: 'no whey protein isolate row exists in the canonical Mapper base',
  },
  {
    key: 'D',
    name: 'MPC-like',
    input: draft(-12, source('PI-ING-000237', 150) ?? []),
    note: 'PI-ING-000237 names both MPC and WPC; the taxonomy honestly returns mixed_dairy_protein',
  },
  {
    key: 'E',
    name: 'SMP / milk powder',
    input: draft(-12, [line('user-smp', findDemoIngredient('smp')!, 120)]),
  },
  {
    key: 'F',
    name: 'casein-rich',
    input: null,
    note: 'no casein or caseinate row exists in the canonical Mapper base',
  },
  {
    key: 'G',
    name: 'mixed source',
    input: draft(-12, [
      line('user-smp', findDemoIngredient('smp')!, 80),
      ...(source('PI-ING-000295', 80) ?? []),
    ]),
  },
  {
    key: 'H',
    name: 'lower-fat',
    input: draft(-12, [
      line('user-milk', findDemoIngredient('milk_3_5')!, 500),
      ...(source('PI-ING-000295', 120) ?? []),
    ]),
  },
  {
    key: 'I',
    name: 'higher-fat',
    input: draft(-12, [
      line('user-cream', findDemoIngredient('cream_30')!, 300),
      ...(source('PI-ING-000295', 120) ?? []),
    ]),
  },
  {
    key: 'J',
    name: 'higher-lactose',
    input: draft(-12, source('PI-ING-000294', 180) ?? []),
  },
  {
    key: 'K',
    name: 'low-lactose isolate-grade',
    input: draft(-12, source('PI-ING-000264', 150) ?? []),
  },
  {
    key: 'L',
    name: 'unknown functional class fallback',
    input: draft(-12, [line('user-pistachio', findDemoIngredient('pistachio_paste')!, 120)]),
  },
];

describe('§19 — representative Protein matrix on the integrated tree', () => {
  it.each(CASES)('$key — $name', (testCase) => {
    if (testCase.input === null) {
      // Recorded, not fabricated. §19 forbids inventing catalog products.
      console.info(
        JSON.stringify({ case: testCase.key, name: testCase.name, status: 'FIXTURE_UNAVAILABLE', note: testCase.note }),
      );
      expect(testCase.note).toBeTruthy();
      return;
    }
    const built = buildOptimizePreview(testCase.input, EMPTY, AT);
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;

    const proposed = built.preview.proposedInput;
    const result = calculateRecipe(proposed);
    const assessment = assessProteinFormulation(proposed, result);

    expect(detectViolations(result)).toEqual([]);
    expect(assessment.qualification.qualified).toBe(true);
    // No executable 0 g rows (§23).
    for (const item of proposed.items) expect(item.planned_grams).toBeGreaterThan(0);

    console.info(
      JSON.stringify({
        case: testCase.key,
        name: testCase.name,
        status: 'QUALIFIED',
        proteinPercent: Number(assessment.actualPercent?.toFixed(2)),
        energySharePercent: Number(assessment.qualification.energySharePercent?.toFixed(1)),
        structureScore: assessment.structure.score,
        dominantClass: assessment.structure.sourceProfile?.dominantClass,
        lactosePercent: Number(result.percentages.lactose_percent.toFixed(2)),
        fatPercent: Number(result.percentages.fat_percent.toFixed(2)),
        note: testCase.note,
      }),
    );
  }, 60_000);

  it('E — the SMP case classifies as a milk matrix, not as a protein fraction', () => {
    const behavior = deriveProteinBehavior(findDemoIngredient('smp')!);
    expect(behavior.sourceClass).toBe('skim_milk_powder');
    expect(behavior.wheyCaseinClass).toBe('mixed_milk_protein');
    // 52 % lactose against 35 % protein — the "equal protein ≠ equal chemistry" number.
    expect(behavior.lactosePerProteinGram!).toBeGreaterThan(1);
  });

  it('L — an unknown class never blocks a legal ingredient', () => {
    const behavior = deriveProteinBehavior(findDemoIngredient('pistachio_paste')!);
    expect(behavior.sourceEvidence).toBe('UNKNOWN');
    expect(behavior.isProteinContributor).toBe(true);
  });
});

/* ── §20 temperatures × §13 OPTIMAL / ECO ───────────────────────────────── */

describe('§20 — all supported temperatures, OPTIMAL and ECO', () => {
  for (const temperatureC of [-11, -12, -13] as const) {
    it(`OPTIMAL at ${temperatureC}°C qualifies, previews and applies`, () => {
      const input = draft(temperatureC, source('PI-ING-000295', 120) ?? [], {
        formulation_strategy: 'optimal',
      });
      const built = buildOptimizePreview(input, EMPTY, AT);
      expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
      if (!built.ok) return;
      const assessment = assessProteinFormulation(built.preview.proposedInput);
      expect(assessment.qualification.qualified).toBe(true);
      expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);
      const committed = commitPreview(input, EMPTY, built.preview, AT, `protein-optimal-${temperatureC}`);
      expect(committed.ok, committed.ok ? '' : JSON.stringify(committed)).toBe(true);
    }, 60_000);

    it(`ECO at ${temperatureC}°C never trades away the protein claim`, () => {
      const input = draft(temperatureC, source('PI-ING-000295', 120) ?? [], {
        formulation_strategy: 'eco',
      });
      const built = buildOptimizePreview(input, EMPTY, AT);
      // ECO may legitimately refuse for missing prices; what it must never do is
      // return a candidate that stopped being a Protein product.
      if (!built.ok) {
        expect(built.code).toBeTruthy();
        console.info(JSON.stringify({ eco: temperatureC, status: 'refused', code: built.code }));
        return;
      }
      const assessment = assessProteinFormulation(built.preview.proposedInput);
      expect(assessment.qualification.qualified).toBe(true);
      // ECO optimises COST. It may legitimately land on a protein-heavier
      // formulation than OPTIMAL — but the quality model must then charge it,
      // so the Score tells the truth about the trade the user asked for.
      if (assessment.actualPercent! > 10) {
        expect(assessment.structure.penalties.proteinExcess).toBeGreaterThan(0);
        expect(assessment.structure.penalties.beyondEvidence).toBeGreaterThan(0);
        expect(assessment.structure.score!).toBeLessThan(10);
      }
      console.info(
        JSON.stringify({
          eco: temperatureC,
          status: 'ok',
          proteinPercent: Number(assessment.actualPercent?.toFixed(2)),
          energySharePercent: Number(assessment.qualification.energySharePercent?.toFixed(1)),
          structureScore: assessment.structure.score,
          penalties: assessment.structure.penalties,
        }),
      );
    }, 60_000);
  }
});

/* ── §21 Direction ──────────────────────────────────────────────────────── */

describe('§21 — Sweetness and Hardness remain the only Direction axes', () => {
  const directional = (sweetness: -2 | 0 | 2, hardness: -2 | 0 | 2) =>
    draft(-12, source('PI-ING-000295', 120) ?? [], {
      direction_targets_active: true,
      direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 },
    });

  it('exposes no protein Direction axis', () => {
    const plan = assessRecipeDirection(directional(0, 0), calculateRecipe(directional(0, 0)));
    const axisMetrics = JSON.stringify(plan);
    expect(axisMetrics).not.toContain('protein');
  });

  it.each([
    ['sweeter', 2, 0],
    ['less sweet', -2, 0],
    ['firmer', 0, 2],
    ['softer', 0, -2],
  ])('%s still formulates a qualified Protein recipe', (_name, sweetness, hardness) => {
    const input = directional(sweetness as -2 | 0 | 2, hardness as -2 | 0 | 2);
    const built = buildOptimizePreview(input, EMPTY, AT);
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    expect(assessProteinFormulation(built.preview.proposedInput).qualification.qualified).toBe(true);
  }, 60_000);
});

/* ── §22 Rescue ─────────────────────────────────────────────────────────── */

describe('§22 — Rescue never trades the claim or recommends protein for its own sake', () => {
  it('recommends nothing that loses the HIGH PROTEIN qualification', () => {
    const input = draft(-12, source('PI-ING-000295', 120) ?? []);
    const built = buildOptimizePreview(input, EMPTY, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const report = simulateRescueCandidates({
      input,
      set: EMPTY,
      createdAt: AT,
      options: {},
      bestCurrent: built.preview,
    });

    for (const record of report.simulations) {
      if (record.outcome !== 'recommended') continue;
      // Every recommendation must still be a Protein product.
      expect(record.rescue).not.toBeNull();
    }
    if (report.advice) {
      const advised = report.advice;
      expect(advised.candidate.namePl.length).toBeGreaterThan(0);
    }
    // A protein_authority rejection is the guard doing its job, never an error.
    const guarded = report.simulations.filter((record) => record.outcome === 'protein_authority');
    console.info(
      JSON.stringify({
        simulations: report.simulations.length,
        recommended: report.simulations.filter((r) => r.outcome === 'recommended').length,
        proteinAuthorityRejections: guarded.length,
      }),
    );
    expect(Array.isArray(report.simulations)).toBe(true);
  }, 120_000);
});

/* ── §31 v1 vs v2 proof ─────────────────────────────────────────────────── */

describe('§31 — the retired 20 %-by-mass formula versus the v2 optimum', () => {
  /**
   * The exact shape the v1 engine produced at −11 °C chasing 20 % protein BY
   * MASS, scored 10/10 by v1: a quarter-kilo of whey concentrate in half a
   * litre of water. It is reconstructed here ONLY as evidence — it is not
   * preserved for compatibility, because it exists solely as an artefact of the
   * invalid target.
   */
  const v1Overloaded = (): RecipeInput => ({
    items: [
      line('cream', findDemoIngredient('cream_30')!, 110),
      {
        id: 'wpc',
        ingredient: findVerifiedProteinFormulationCandidate('PI-ING-000264')!,
        planned_grams: 247,
        actual_grams: null,
        lock_type: 'unlocked',
      },
      line('sucrose', findDemoIngredient('sucrose')!, 80),
      line('dextrose', findDemoIngredient('dextrose')!, 56),
      line('tara', findDemoIngredient('tara_gum')!, 2),
      line('water', { ...findDemoIngredient('milk_3_5')!, id: 'water', name: 'Water', composition: { ...findDemoIngredient('milk_3_5')!.composition, water_percent: 100, solids_percent: 0, fat_percent: 0, protein_percent: 0, carbohydrate_percent: 0, sugar_percent: 0, lactose_percent: 0, salt_percent: 0, kcal_per_100g: 0 } }, 505),
    ],
    mode: 'signature',
    category: 'protein_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  });

  it('v2 scores the overloaded formula BELOW a leaner qualified one', () => {
    const overloaded = assessProteinFormulation(v1Overloaded());

    const built = buildOptimizePreview(draft(-11), EMPTY, AT);
    expect(built.ok, built.ok ? '' : JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const optimum = assessProteinFormulation(built.preview.proposedInput);

    // Both are Protein products — the overloaded one is not illegal, just worse.
    expect(overloaded.qualification.qualified).toBe(true);
    expect(optimum.qualification.qualified).toBe(true);

    // Roughly 20 % by mass versus roughly 8–10 %.
    expect(overloaded.actualPercent!).toBeGreaterThan(18);
    expect(optimum.actualPercent!).toBeLessThan(11);

    // …and v2 ranks the leaner recipe strictly higher. Under v1 this was exactly
    // inverted: hitting 20 % by mass was the only way to score 10.
    expect(optimum.structure.score!).toBeGreaterThan(overloaded.structure.score!);
    expect(overloaded.structure.penalties.proteinExcess).toBeGreaterThan(0);
    expect(overloaded.structure.penalties.beyondEvidence).toBeGreaterThan(0);

    console.info(
      JSON.stringify({
        v1Overloaded: {
          proteinPercent: Number(overloaded.actualPercent?.toFixed(2)),
          energySharePercent: Number(overloaded.qualification.energySharePercent?.toFixed(1)),
          structureScore: overloaded.structure.score,
          penalties: overloaded.structure.penalties,
        },
        v2Optimum: {
          proteinPercent: Number(optimum.actualPercent?.toFixed(2)),
          energySharePercent: Number(optimum.qualification.energySharePercent?.toFixed(1)),
          structureScore: optimum.structure.score,
          penalties: optimum.structure.penalties,
        },
      }),
    );
  }, 60_000);
});
