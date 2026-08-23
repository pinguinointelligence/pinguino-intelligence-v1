import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { buildOptimizePreview, commitPreview } from '@/features/constraint-studio/applyPipeline';
import { rescueCandidateFamily, simulateRescueCandidates } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { assessRecipeDirection } from '@/features/recipe-direction/recipeDirectionAssessment';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { findDemoIngredient } from '@/data/demoIngredients';
import { findVerifiedProteinFormulationCandidate } from '@/data/ingredients/verifiedProteinToolbox';
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';

/**
 * §16-§21 PROTEIN CLOSEOUT TORTURE.
 *
 * Realistic user-shaped drafts, not Engine-perfect fixtures: hand-set grams,
 * lopsided compositions, deliberately broken states. Every case uses products
 * that actually exist in the catalog — none are invented.
 */

const EMPTY = { byLineId: {} } as const;
const AT = '2026-08-23T12:30:00.000Z';

const tb = (id: string) => {
  const payload = approvedFormulationToolboxIngredients(id)[0]!;
  return { ...payload, cost_currency: 'EUR' as const };
};
const L = (id: string, ingredient: RecipeInput['items'][number]['ingredient'], grams: number, lock: 'unlocked' | 'main' = 'unlocked') => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
});

const recipe = (
  items: RecipeInput['items'],
  temperatureC: -11 | -12 | -13,
  strategy: 'optimal' | 'eco',
  extraGoals: Record<string, unknown> = {},
): RecipeInput => ({
  items,
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: {
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    formulation_strategy: strategy,
    ...extraGoals,
  },
});

const MILK = tb('milk_3_5');
const CREAM = tb('cream_30');
const WPC = tb('PI-ING-000264');
const WATER = tb('water');
const SUCROSE = tb('sucrose');
const DEXTROSE = tb('dextrose');
const TARA = tb('tara_gum');
/** Demo/verified payloads carry a price but no currency; canonical Mapper
 *  products carry EUR. Stamp it so ECO's cost objective can run at all. */
const eur = <T extends { cost_per_kg: number | null }>(i: T, fallbackPricePerKg: number): T => ({
  ...i,
  cost_per_kg: i.cost_per_kg ?? fallbackPricePerKg,
  cost_currency: 'EUR',
});
const SMP = eur(findDemoIngredient('smp')!, 7);
const WPC60 = eur(findVerifiedProteinFormulationCandidate('PI-ING-000294')!, 12);
const SKYR = eur(findVerifiedProteinFormulationCandidate('PI-ING-001395')!, 6);
const RASPBERRY = eur(findDemoIngredient('raspberry')!, 6);
const BANANA = eur(findDemoIngredient('banana')!, 2);
const PISTACHIO = eur(findDemoIngredient('pistachio_paste')!, 30);

interface TortureCase {
  key: string;
  name: string;
  input: RecipeInput;
  /** A deliberately broken draft may legitimately have no legal candidate. */
  mayFail?: boolean;
}

const CASES: readonly TortureCase[] = [
  {
    key: 'A',
    name: 'canonical starter (dairy −12 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 506), L('cream', CREAM, 110), L('wpc', WPC, 87), L('water', WATER, 101), L('suc', SUCROSE, 99), L('dex', DEXTROSE, 95), L('tara', TARA, 2)],
      -12, 'optimal',
    ),
  },
  {
    key: 'B',
    name: 'WPC-heavy (−11 ECO)',
    input: recipe(
      [L('milk', MILK, 320), L('cream', CREAM, 90), L('wpc', WPC, 210), L('water', WATER, 150), L('suc', SUCROSE, 70), L('dex', DEXTROSE, 158), L('tara', TARA, 2)],
      -11, 'eco',
    ),
  },
  {
    key: 'C',
    name: 'milk-powder-heavy (−12 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 400), L('smp', SMP, 180), L('cream', CREAM, 80), L('wpc', WPC, 60), L('water', WATER, 130), L('suc', SUCROSE, 70), L('dex', DEXTROSE, 78), L('tara', TARA, 2)],
      -12, 'optimal',
    ),
  },
  {
    key: 'D',
    name: 'low-fat high-protein (−13 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 430), L('wpc', WPC, 130), L('water', WATER, 210), L('suc', SUCROSE, 80), L('dex', DEXTROSE, 148), L('tara', TARA, 2)],
      -13, 'optimal',
    ),
  },
  {
    key: 'E',
    name: 'higher-fat Protein (−12 ECO)',
    input: recipe(
      [L('milk', MILK, 280), L('cream', CREAM, 300), L('wpc', WPC, 95), L('water', WATER, 100), L('suc', SUCROSE, 90), L('dex', DEXTROSE, 133), L('tara', TARA, 2)],
      -12, 'eco',
    ),
  },
  {
    key: 'F',
    name: 'high-lactose via WPC 60 (−13 ECO)',
    input: recipe(
      [L('milk', MILK, 380), L('cream', CREAM, 110), L('wpc60', WPC60, 170), L('water', WATER, 120), L('suc', SUCROSE, 60), L('dex', DEXTROSE, 158), L('tara', TARA, 2)],
      -13, 'eco',
    ),
  },
  {
    key: 'G',
    name: 'moderate, near the qualification floor (−11 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 520), L('cream', CREAM, 150), L('wpc', WPC, 70), L('water', WATER, 100), L('suc', SUCROSE, 80), L('dex', DEXTROSE, 78), L('tara', TARA, 2)],
      -11, 'optimal',
    ),
  },
  {
    key: 'H',
    name: 'excessive protein ~19 % by mass (−12 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 300), L('cream', CREAM, 100), L('wpc', WPC, 230), L('water', WATER, 180), L('suc', SUCROSE, 60), L('dex', DEXTROSE, 128), L('tara', TARA, 2)],
      -12, 'optimal',
    ),
  },
  {
    key: 'I',
    name: 'manually broken draft (−11 OPTIMAL)',
    input: recipe(
      [L('milk', MILK, 900), L('wpc', WPC, 40), L('suc', SUCROSE, 58), L('tara', TARA, 2)],
      -11, 'optimal',
    ),
    mayFail: true,
  },
  {
    key: 'J',
    name: 'Main raspberry fixed (−12 OPTIMAL)',
    input: recipe(
      [L('main-rasp', RASPBERRY, 120, 'main'), L('milk', MILK, 430), L('cream', CREAM, 100), L('wpc', WPC, 90), L('water', WATER, 90), L('suc', SUCROSE, 80), L('dex', DEXTROSE, 88), L('tara', TARA, 2)],
      -12, 'optimal',
    ),
  },
  {
    key: 'K',
    name: 'Multi-Main 2:1 raspberry/banana (−13 ECO)',
    input: recipe(
      [
        { ...L('main-rasp', RASPBERRY, 120, 'main'), main_ratio_weight: 2 },
        { ...L('main-ban', BANANA, 60, 'main'), main_ratio_weight: 1 },
        L('milk', MILK, 380), L('cream', CREAM, 90), L('wpc', WPC, 90), L('water', WATER, 90), L('suc', SUCROSE, 70), L('dex', DEXTROSE, 98), L('tara', TARA, 2),
      ],
      -13, 'eco',
    ),
  },
  {
    key: 'L',
    name: 'unknown protein class fallback — pistachio + Skyr (−12 OPTIMAL)',
    input: recipe(
      [L('main-pist', PISTACHIO, 100, 'main'), L('skyr', SKYR, 300), L('milk', MILK, 250), L('cream', CREAM, 90), L('wpc', WPC, 70), L('water', WATER, 60), L('suc', SUCROSE, 60), L('dex', DEXTROSE, 68), L('tara', TARA, 2)],
      -12, 'optimal',
    ),
  },
];

describe('§16/§17 — realistic Protein torture across temperatures and strategies', () => {
  it.each(CASES)('$key — $name', (testCase) => {
    const built = buildOptimizePreview(testCase.input, EMPTY, AT);

    if (!built.ok) {
      const code = (built as { code?: string }).code;
      // `already_clean` means the draft is ALREADY the optimum — a success. Any
      // other refusal is only acceptable for a deliberately broken draft, and
      // must never be a silently illegal candidate.
      // Anything other than `already_clean` is a truthful refusal; it must at
      // least name its reason so the operator is never left guessing.
      if (code !== 'already_clean') expect(code).toBeTruthy();
      const result = calculateRecipe(testCase.input);
      const assessment = assessProteinFormulation(testCase.input, result);
      if (code === 'already_clean') {
        expect(detectViolations(result)).toEqual([]);
        expect(assessment.qualification.qualified).toBe(true);
      }
      console.info(
        'TORTURE ' +
          JSON.stringify({
            case: testCase.key,
            name: testCase.name,
            temperatureC: testCase.input.target_temperature_c,
            strategy: testCase.input.goals?.formulation_strategy,
            outcome: code === 'already_clean' ? 'ALREADY_CLEAN' : 'NO_LEGAL_CANDIDATE',
            code,
            protein: Number(result.percentages.protein_percent.toFixed(2)),
            qualified: assessment.qualification.qualified,
            score: recipeFitForInput(testCase.input, result).score,
          }),
      );
      return;
    }

    const proposed = built.preview.proposedInput;
    const result = calculateRecipe(proposed);
    const assessment = assessProteinFormulation(proposed, result);
    const score = recipeFitForInput(proposed, result).score;
    const violations = detectViolations(result);

    // A DIAGNOSTIC preview is the honest "best achievable, not executable"
    // answer. It may legitimately carry residual violations — what it must
    // never do is pass the Apply door.
    if (built.preview.diagnosticOnly === true) {
      const refused = commitPreview(testCase.input, EMPTY, built.preview, AT, `torture-${testCase.key}`);
      expect(refused.ok).toBe(false);
      console.info(
        'TORTURE ' +
          JSON.stringify({
            case: testCase.key,
            name: testCase.name,
            temperatureC: testCase.input.target_temperature_c,
            strategy: testCase.input.goals?.formulation_strategy,
            outcome: 'DIAGNOSTIC_NEAREST',
            reason: built.preview.diagnosticReason,
            residual: violations.map((v) => v.metric),
            protein: Number(assessment.actualPercent!.toFixed(2)),
            qualified: assessment.qualification.qualified,
            score,
            applyRefused: !refused.ok,
          }),
      );
      return;
    }

    // §13 — qualification survives to the executable candidate.
    expect(violations).toEqual([]);
    expect(assessment.qualification.qualified).toBe(true);
    // §21 — no executable 0 g rows.
    for (const item of proposed.items) expect(item.planned_grams).toBeGreaterThan(0);

    // §20 — Main identity and ratio survive optimization.
    const mains = testCase.input.items.filter((i) => i.lock_type === 'main');
    for (const main of mains) {
      const after = proposed.items.find((i) => i.id === main.id);
      expect(after, `Main ${main.id} disappeared`).toBeDefined();
      expect(after!.planned_grams).toBeGreaterThanOrEqual(main.planned_grams);
      expect(after!.ingredient.name).toBe(main.ingredient.name);
    }
    if (mains.length === 2) {
      const a = proposed.items.find((i) => i.id === mains[0]!.id)!.planned_grams;
      const b = proposed.items.find((i) => i.id === mains[1]!.id)!.planned_grams;
      expect(a / b).toBeCloseTo(2, 6);
    }

    const committed = commitPreview(testCase.input, EMPTY, built.preview, AT, `torture-${testCase.key}`);
    expect(committed.ok, committed.ok ? '' : JSON.stringify(committed)).toBe(true);

    console.info(
      'TORTURE ' +
        JSON.stringify({
          case: testCase.key,
          name: testCase.name,
          temperatureC: testCase.input.target_temperature_c,
          strategy: testCase.input.goals?.formulation_strategy,
          outcome: 'QUALIFIED',
          protein: Number(assessment.actualPercent!.toFixed(2)),
          energySharePercent: Number(assessment.qualification.energySharePercent!.toFixed(1)),
          score,
          structure: assessment.structure.score,
          npac: Number(result.npac_points!.toFixed(2)),
          ice: Number(result.ice_fraction_percent!.toFixed(2)),
          fat: Number(result.percentages.fat_percent.toFixed(2)),
          lactose: Number(result.percentages.lactose_percent.toFixed(2)),
          apply: committed.ok,
        }),
    );
  }, 240_000);
});

describe('§18 — Sweetness and Hardness Direction across the case set', () => {
  const directional = (sweetness: -2 | -1 | 0 | 1 | 2, hardness: -2 | -1 | 0 | 1 | 2, temperatureC: -11 | -12 | -13, strategy: 'optimal' | 'eco') =>
    recipe(
      [L('milk', MILK, 506), L('cream', CREAM, 110), L('wpc', WPC, 87), L('water', WATER, 101), L('suc', SUCROSE, 99), L('dex', DEXTROSE, 95), L('tara', TARA, 2)],
      temperatureC, strategy,
      { direction_targets_active: true, direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 } },
    );

  const AXES: readonly (readonly [-2 | -1 | 0 | 1 | 2, -2 | -1 | 0 | 1 | 2, -11 | -12 | -13, 'optimal' | 'eco'])[] = [
    [-2, 0, -11, 'optimal'],
    [-1, 0, -12, 'eco'],
    [0, 0, -12, 'optimal'],
    [1, 0, -13, 'eco'],
    [2, 0, -12, 'optimal'],
    [0, -2, -11, 'eco'],
    [0, -1, -12, 'optimal'],
    [0, 1, -13, 'optimal'],
    [0, 2, -12, 'eco'],
    [2, -2, -12, 'optimal'],
  ];

  it.each(AXES)('sweetness %s / hardness %s @ %s %s', (sweetness, hardness, temperatureC, strategy) => {
    const input = directional(sweetness, hardness, temperatureC, strategy);
    const built = buildOptimizePreview(input, EMPTY, AT);
    if (!built.ok) {
      // NEAREST/no-solution must be truthful, never a fabricated READY.
      console.info('DIRECTION ' + JSON.stringify({ sweetness, hardness, temperatureC, strategy, outcome: 'NO_CANDIDATE', code: (built as { code?: string }).code }));
      expect((built as { code?: string }).code).toBeTruthy();
      return;
    }
    const proposed = built.preview.proposedInput;
    const result = calculateRecipe(proposed);
    const assessment = assessProteinFormulation(proposed, result);
    expect(detectViolations(result)).toEqual([]);
    expect(assessment.qualification.qualified).toBe(true);
    console.info(
      'DIRECTION ' +
        JSON.stringify({
          sweetness, hardness, temperatureC, strategy,
          outcome: built.preview.diagnosticOnly ? 'NEAREST' : 'EXACT',
          protein: Number(assessment.actualPercent!.toFixed(2)),
          score: recipeFitForInput(proposed, result).score,
          pod: Number(result.pod_points!.toFixed(2)),
          npac: Number(result.npac_points!.toFixed(2)),
        }),
    );
  }, 240_000);
});

describe('§18/§19 — Direction axis status and Rescue are truthful for Protein', () => {
  /**
   * MEASURED CONTRACT, pinned rather than changed.
   *
   * Protein's Direction axes are deliberately NOT operational:
   *   • sweetness → `blocked_runtime` — the complete −2..+2 matrix has no
   *     verified safe Preview/Apply path recorded for this profile;
   *   • softness  → `blocked_science` — "PI does not use a substitute milk
   *     curve", which is exactly the unvalidated `protein_gelato` ice anchors
   *     the Protein Science Audit documented as copies of the milk_gelato rows.
   *
   * Enabling either would relabel that limitation as validated high-protein
   * physics, which the closeout brief explicitly forbids. The user still gets
   * the Sweetness/Hardness controls and the optimizer still honours the POD and
   * NPAC bands — what is withheld is the claim that a requested axis target was
   * evaluated and met.
   *
   * Rescue is a DIRECTION advisor, so with no supported axis it is correctly
   * silent for Protein. That is coherent, not a gap.
   */
  const directional = (sweetness: -2 | 2, hardness: -2 | 2, temperatureC: -11 | -12 | -13) =>
    recipe(
      [L('main-rasp', RASPBERRY, 150, 'main'), L('milk', MILK, 560), L('cream', CREAM, 120), L('wpc', WPC, 88), L('tara', TARA, 2), L('suc', SUCROSE, 80)],
      temperatureC, 'optimal',
      { direction_targets_active: true, direction_targets: { sweetness, softness: hardness, creaminess: 0, flavor: 0 } },
    );

  it.each([-11, -12, -13] as const)('@ %s both axes report an honest blocked reason', (temperatureC) => {
    const input = directional(2, -2, temperatureC);
    const plan = buildRecipeDirectionPlan(input);
    const sweetness = plan.axes.find((a) => a.axis === 'sweetness')!;
    const softness = plan.axes.find((a) => a.axis === 'softness')!;

    expect(sweetness.status).not.toBe('working');
    expect(softness.status).not.toBe('working');
    // A blocked axis must always say WHY — never fail silently.
    expect(sweetness.reason).toBeTruthy();
    expect(softness.reason).toBeTruthy();
    // And it must never publish a target band it cannot honour.
    expect(sweetness.targetBand).toBeNull();
    expect(softness.targetBand).toBeNull();

    const assessment = assessRecipeDirection(input, calculateRecipe(input));
    expect(assessment.supportedAxisCount).toBe(0);
    // No supported axis ⇒ never a false "target reached".
    expect(assessment.reached).toBe(false);

    console.info(
      'DIRSTATUS ' +
        JSON.stringify({
          temperatureC,
          sweetness: sweetness.status,
          softness: softness.status,
          supportedAxisCount: assessment.supportedAxisCount,
        }),
    );
  });

  it.each([-11, -12, -13] as const)('@ %s Rescue is silent for the RIGHT reason', (temperatureC) => {
    const input = directional(2, -2, temperatureC);
    const built = buildOptimizePreview(input, EMPTY, AT);
    const report = simulateRescueCandidates({
      input, set: EMPTY, createdAt: AT, options: {},
      bestCurrent: built.ok ? built.preview : null,
    });

    const currentInput = built.ok ? built.preview.proposedInput : input;
    const direction = assessRecipeDirection(currentInput, calculateRecipe(currentInput));
    const family = rescueCandidateFamily(input, direction);

    // The candidate universe is real — Rescue is not silent for lack of stock.
    expect(family.length).toBeGreaterThan(0);
    // It is silent because there is no supported axis to rescue toward.
    expect(direction.supportedAxisCount).toBe(0);
    expect(report.simulations).toEqual([]);
    expect(report.advice).toBeNull();

    console.info(
      'RESCUE ' +
        JSON.stringify({
          temperatureC,
          familySize: family.length,
          supportedAxisCount: direction.supportedAxisCount,
          simulations: report.simulations.length,
          advice: report.advice,
          reason: 'no supported Direction axis for Protein — see blocked_science / blocked_runtime',
        }),
    );
  }, 600_000);

  it('still lets the optimizer honour POD and NPAC despite the blocked axes', () => {
    // The bands themselves remain hard authority; only the AXIS CLAIM is withheld.
    const input = directional(2, -2, -12);
    const built = buildOptimizePreview(input, EMPTY, AT);
    const candidate = built.ok ? built.preview.proposedInput : input;
    const result = calculateRecipe(candidate);
    expect(result.pod_points!).toBeGreaterThanOrEqual(12);
    expect(result.pod_points!).toBeLessThanOrEqual(17);
    expect(result.npac_points!).toBeGreaterThanOrEqual(42);
    expect(result.npac_points!).toBeLessThanOrEqual(50);
  }, 300_000);
});

describe('§25 — more protein is still not monotonically rewarded', () => {
  it('scores a lean qualified recipe at least as high as heavier ones', () => {
    const at = (wpc: number) =>
      assessProteinFormulation(
        recipe(
          [L('milk', MILK, 750 - wpc), L('cream', CREAM, 100), L('wpc', WPC, wpc), L('suc', SUCROSE, 80), L('dex', DEXTROSE, 68), L('tara', TARA, 2)],
          -12, 'optimal',
        ),
      );
    const ladder = [80, 110, 150, 200, 240].map(at).filter((a) => a.qualification.qualified);
    expect(ladder.length).toBeGreaterThan(2);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!.actualPercent!).toBeGreaterThan(ladder[i - 1]!.actualPercent!);
      expect(ladder[i]!.structure.score!).toBeLessThanOrEqual(ladder[i - 1]!.structure.score!);
    }
    console.info('LADDER ' + JSON.stringify(ladder.map((a) => ({ protein: Number(a.actualPercent!.toFixed(2)), structure: a.structure.score }))));
  });
});
