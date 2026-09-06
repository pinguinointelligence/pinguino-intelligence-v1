import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from './constraintStudioStore';
import {
  buildOptimizePreview,
  buildSuggestedFixPreview,
  commitPreview,
  MAIN_TECHNICAL_PROBE_BUDGET,
  workingStateFingerprint,
} from './applyPipeline';
import { mainObjectiveSummaryPl } from './mainObjectivePresentation';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import {
  MAIN_TECHNICAL_INTEGER_NODE_BUDGET,
  mainTechnicalLinearUpperBound,
} from './mainTechnicalLinearBound';

// Whole-recipe optimiser proofs: each case runs the real Engine across many
// candidate formulations, so single tests legitimately take tens of seconds
// where the repository default allows five. The timeout is raised for THIS FILE
// only — the default stays in place everywhere else, and no assertion, fixture
// or Engine behaviour is relaxed to fit inside it.
vi.setConfig({ testTimeout: 30_000 });

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC_FIELDS = new Set([
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
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  const values = Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC_FIELDS.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      ) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') {
        return [field, raw || null];
      }
      return [field, raw];
    }),
  );
  return values as unknown as IngredientRow;
};

const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  // Strategy/cost ranking is not under test. Keep ECO fully priced so it reaches
  // the same technical Main objective as OPTIMAL.
  cost_per_kg: 1,
  cost_currency: 'EUR',
});

const IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  inulin: 'PI-ING-000455',
  watermelon: 'PI-ING-000405',
  strawberry: 'PI-ING-001553',
  banana: 'PI-ING-000345',
  kiwi: 'PI-ING-000366',
  coffee: 'PI-ING-000166',
  water: 'PI-ING-001409',
  hazelnut: 'PI-ING-000419',
} as const;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
  mainRatioWeight?: number,
): RecipeInput['items'][number] =>
  ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lockType,
    ...(mainRatioWeight === undefined ? {} : { main_ratio_weight: mainRatioWeight }),
  }) as RecipeInput['items'][number];

const structuralLines = () => [
  line('milk', IDS.milk, 670),
  line('cream', IDS.cream, 130),
  line('smp', IDS.smp, 35),
  line('sucrose', IDS.sucrose, 130),
  line('dextrose', IDS.dextrose, 30),
  line('tara', IDS.tara, 5),
  line('inulin', IDS.inulin, 5),
];

const watermelonFixture = (
  grams: number,
  strategy: 'eco' | 'optimal' = 'eco',
  role: 'main' | 'unlocked' = 'main',
): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: strategy },
  items: [...structuralLines(), line('watermelon', IDS.watermelon, grams, role)],
});

/**
 * The published Main envelope for the fixture's Watermelon.
 *
 * It is CATEGORY-AWARE on purpose. Staging publishes one policy per profile
 * (`product_behavior_policy_versions`), and the sorbet fruit policy is 60/60/60
 * where the dairy-gelato one is 20/35/45. Handing a SORBET recipe the dairy
 * ceiling made the fixture claim a 60 % Main was over its hard limit — an
 * artefact of the fixture, not of the recipe, and it fired the moment the
 * Crown-OFF safety backstop started reading this envelope on the uncrowned
 * path. See `mainSafetyProfileMatrix` for the published numbers.
 */
const snapshotsWithApprovedEnvelope = (input: RecipeInput) => {
  const snapshots = productBehaviorTestSnapshots(input);
  const sorbet = input.category === 'sorbet';
  if (snapshots.watermelon)
    snapshots.watermelon = {
      ...snapshots.watermelon!,
      productId: 'e3264816-1050-d2a6-cc55-149e0d363bbf',
      productVersionId: '009d5b8a-f0bd-4c19-958b-3feec2f045f9',
      mapperIngredientId: IDS.watermelon,
      verificationState: 'estimated',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainPolicyId: sorbet ? 'main-sorbet-fruit-fresh' : 'main-fruit-fresh-dairy',
      mainPolicyVersion: sorbet ? 'v1' : 'v2',
      ecoFloorPercent: sorbet ? 60 : 20,
      optimalCeilingPercent: sorbet ? 60 : 35,
      hardLimitPercent: sorbet ? 60 : 45,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
    };
  return snapshots;
};

const technicalOnlyMainLineIds = (input: RecipeInput) =>
  input.items.filter((item) => item.lock_type === 'main').map((item) => item.id);

const build = (
  input: RecipeInput,
  byLineId: Record<string, { mode: 'locked'; grams: number }> = {},
) => {
  const result = buildOptimizePreview(input, { byLineId }, '2026-08-16T12:00:00.000Z', {
    productBehaviorSnapshots: snapshotsWithApprovedEnvelope(input),
    technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.preview;
};

const mainLines = (input: RecipeInput) => input.items.filter((item) => item.lock_type === 'main');
const mainTotal = (input: RecipeInput) =>
  mainLines(input).reduce((sum, item) => sum + item.planned_grams, 0);

const singleMainFixture = (ingredientId: string, grams = 80): RecipeInput => ({
  ...watermelonFixture(0, 'optimal'),
  items: [...structuralLines(), line('single-main', ingredientId, grams, 'main')],
});

const expectExactApplyUndo = (
  input: RecipeInput,
  constraints: { byLineId: Record<string, { mode: 'locked'; grams: number }> },
): void => {
  const priorRecipe = useRecipeStore.getState();
  const priorStudio = useConstraintStudioStore.getState();
  try {
    const snapshots = snapshotsWithApprovedEnvelope(input);
    useRecipeStore.getState().loadRecipeInput(input);
    useRecipeStore.setState({
      productBehaviorSnapshots: structuredClone(snapshots),
      ownerReviewGate: {
        status: 'OWNER_REVIEW_EDITABLE',
        productionStatus: 'PRODUCTION_BLOCKED',
        labelStatus: 'LABEL_BLOCKED',
        omittedToppingLineIds: [],
        technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
      },
    });
    useConstraintStudioStore.getState().resetForTests();
    const before = structuredClone(buildRecipeInput(useRecipeStore.getState()));
    const built = buildOptimizePreview(before, constraints, '2026-08-16T12:00:00.000Z', {
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
    });
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    useConstraintStudioStore.setState({
      preview: built.preview,
      constraints,
      history: [],
      blocked: null,
    });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(1);
    useConstraintStudioStore.getState().undoLastApply();
    expect(buildRecipeInput(useRecipeStore.getState())).toEqual(before);
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
  } finally {
    useRecipeStore.setState(priorRecipe, true);
    useConstraintStudioStore.setState(priorStudio, true);
  }
};

/**
 * Solver-heavy proofs. `MAX_SOLVER_ROUNDS` went 12 → 18 (staging c9e9560), which pushed several of
 * these cases from ~2.5 s to over vitest's 5 s default — they then time out under the serial
 * whole-suite run (`fileParallelism: false`) while passing comfortably in isolation. The work still
 * has to FINISH, so the budget is raised explicitly here rather than the cases being skipped or the
 * global default being weakened for every other test.
 */
const SOLVER_PROOF_TIMEOUT_MS = 30_000;

describe(
  'Main technical maximum — exact Watermelon authority',
  { timeout: SOLVER_PROOF_TIMEOUT_MS },
  () => {
    it('certifies the exact whole-gram upper bound independently of the starting grams', () => {
      const input = watermelonFixture(300, 'optimal');
      const bound = mainTechnicalLinearUpperBound({
        recipe: input,
        constraints: { byLineId: { tara: { mode: 'locked', grams: 5 } } },
        snapshots: snapshotsWithApprovedEnvelope(input),
      });
      expect(bound).toMatchObject({
        status: 'certified',
        wholeGramUpperBound: 639,
        integerSolutionCertified: true,
      });
      expect(bound.integerSearchNodes).toBeGreaterThan(0);
      expect(bound.integerSearchNodes).toBeLessThanOrEqual(MAIN_TECHNICAL_INTEGER_NODE_BUDGET);
      expect(bound.certificate).not.toContain('alcohol_min');
      expect(bound.certificate.some((rule) => /_(?:min|max)$/.test(rule))).toBe(true);
      expect(bound.continuousUpperBoundGrams).toBeGreaterThan(639);
      const certifiedInput: RecipeInput = {
        ...input,
        items: input.items.map((item, index) => ({
          ...item,
          planned_grams: bound.continuousSolutionGrams![index]!,
        })),
      };
      expect(certifiedInput.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(1000);
      expect(detectViolations(calculateRecipe(certifiedInput))).toEqual([]);
    });
    it('converges from every required starting point to one proven whole-gram maximum', () => {
      const outcomes = [1, 80, 300, 600, 700, 900, 1200].map((start) => {
        const input = watermelonFixture(start);
        const preview = build(input);
        const watermelon = preview.proposedInput.items.find((item) => item.id === 'watermelon')!;
        expect(preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
          1000,
        );
        expect(Number.isInteger(watermelon.planned_grams)).toBe(true);
        expect(watermelon.lock_type).toBe('main');
        expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
        expect(preview.mainObjective, JSON.stringify(preview.mainObjective)).toMatchObject({
          status: 'maximized',
          executableMainGrams: watermelon.planned_grams,
          firstHigherRejectedGrams: watermelon.planned_grams + 1,
        });
        expect(
          (preview.mainObjective?.limitingTechnicalRules ?? []).some((rule) =>
            /_(?:min|max)$/.test(rule),
          ),
        ).toBe(true);
        expect(preview.mainObjective?.limitingTechnicalRules).toEqual([
          'integer_linear_relaxation',
          'exact_batch',
          'exact_lock:tara',
          'pod_max',
          'npac_min',
          'lactose_min',
          'fat_min',
          'total_solids_min',
        ]);
        return watermelon.planned_grams;
      });
      expect(new Set(outcomes).size).toBe(1);
      expect(outcomes[0]).toBe(639);
      expect(outcomes[0]).toBeGreaterThan(0);
    });

    it('searches down from every required Kiwi start to one deterministic result', () => {
      const proofs = [1, 80, 300, 700, 1000, 1200, 8000].map((start) => {
        const input = singleMainFixture(IDS.kiwi, start);
        const preview = build(input);
        const kiwi = preview.proposedInput.items.find((item) => item.id === 'single-main')!;
        expect(preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
          1000,
        );
        expect(Number.isInteger(kiwi.planned_grams)).toBe(true);
        expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
        expect(preview.mainObjective).toMatchObject({
          status: 'maximized',
          executableMainGrams: kiwi.planned_grams,
          firstHigherRejectedGrams: kiwi.planned_grams + 1,
          provenMaximum: true,
        });
        return {
          grams: kiwi.planned_grams,
          rules: preview.mainObjective?.limitingTechnicalRules ?? [],
        };
      });
      expect(new Set(proofs.map((proof) => proof.grams)).size).toBe(1);
      expect(proofs[0]!.grams).toBe(706);
      expect(proofs[0]!.rules).toEqual([
        'integer_linear_relaxation',
        'exact_batch',
        'exact_lock:tara',
        'lactose_min',
        'fat_min',
        'total_solids_min',
      ]);
    });

    it('certifies the practical Kiwi frontier from an 8000 g request without scanning from 8000', () => {
      const input = singleMainFixture(IDS.kiwi, 8000);
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-19T00:00:00.000Z', {
        productBehaviorSnapshots: snapshotsWithApprovedEnvelope(input),
        technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
        requirePracticalPreview: true,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const kiwi = result.preview.proposedInput.items.find((item) => item.id === 'single-main')!;
      expect(kiwi.planned_grams).toBe(706);
      expect(
        result.preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0),
      ).toBe(1000);
      expect(result.preview.mainObjective).toMatchObject({
        status: 'maximized',
        executableMainGrams: 706,
        firstHigherRejectedGrams: 707,
        provenMaximum: true,
      });
      expect(result.preview.mainObjective).toMatchObject({
        attempts: 1,
        searchUpperBoundGrams: 706,
        certifiedUpperBoundGrams: 706,
        proofKind: 'linear_relaxation',
      });
      expect(result.preview.mainObjective?.attempts).toBeLessThanOrEqual(
        MAIN_TECHNICAL_PROBE_BUDGET,
      );
    });

    it('keeps the Engine-only Owner Review frontier independent of the sensory Main envelope', () => {
      const eco = build(watermelonFixture(300, 'eco'));
      const optimal = build(watermelonFixture(300, 'optimal'));
      expect(mainTotal(eco.proposedInput)).toBe(mainTotal(optimal.proposedInput));
      expect(mainTotal(eco.proposedInput)).toBeGreaterThan(450);
    });

    // GEL-P0-027: Crown is an explicit MAX objective, so BOTH strategies search
    // to the approved hard safety limit. `optimalCeilingPercent` is the OPTIMAL
    // preference target and no longer caps a maximisation, so OPTIMAL now
    // reaches the same 370 g as ECO and is limited by the same real technical
    // rule (the approved liquid dairy carrier minimum), not by `main_policy_ceiling`.
    it('caps normal Preview at the approved HARD limit in both strategies', () => {
      const evaluate = (strategy: 'eco' | 'optimal') => {
        const input = watermelonFixture(300, strategy);
        const snapshots = snapshotsWithApprovedEnvelope(input);
        snapshots.watermelon = {
          ...snapshots.watermelon!,
          requiresLiquidDairyCarrier: true,
          liquidDairyCarrierFloorPercent: 30,
        };
        snapshots.milk = {
          ...snapshots.milk!,
          approvedLiquidDairyCarrier: true,
        };
        const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-19T00:00:00.000Z', {
          productBehaviorSnapshots: snapshots,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (!result.ok) throw new Error(JSON.stringify(result));
        return result.preview;
      };
      const optimal = evaluate('optimal');
      const eco = evaluate('eco');
      expect(optimal.mainObjective).toMatchObject({
        executableMainGrams: 370,
        certifiedUpperBoundGrams: 370,
        provenMaximum: true,
      });
      expect(eco.mainObjective).toMatchObject({
        executableMainGrams: 370,
        certifiedUpperBoundGrams: 370,
        provenMaximum: true,
      });
      // The preference target is no longer a limiting rule; the real technical
      // boundary is, and it is the same one in both strategies.
      expect(optimal.mainObjective?.limitingTechnicalRules).toContain('liquid_dairy_carrier_min');
      expect(optimal.mainObjective?.limitingTechnicalRules).not.toContain('main_policy_ceiling');
      expect(eco.mainObjective?.limitingTechnicalRules).toContain('liquid_dairy_carrier_min');
      // Both stay at or below the approved hard limit (45% of 1000 g).
      expect(optimal.mainObjective?.executableMainGrams).toBeLessThanOrEqual(450);
    });

    // Direction-driven Main-envelope searches run the full local-correction
    // sweep, which at MAX_SOLVER_ROUNDS=18 exceeds the 5s per-test default on a
    // loaded machine (measured worst case 8.7s). The budget below is a timeout,
    // not a relaxed assertion — every expectation is unchanged.
    it.each([
      [-2, -2],
      [-2, 2],
      [2, -2],
      [2, 2],
    ] as const)(
      'keeps a 45 percent fruit Main inside the approved envelope under Direction %i/%i',
      (sweetness, softness) => {
        const seedInput = watermelonFixture(300, 'eco');
        const snapshots = snapshotsWithApprovedEnvelope(seedInput);
        const seeded = buildOptimizePreview(
          seedInput,
          { byLineId: {} },
          '2026-08-20T00:00:00.000Z',
          {
            productBehaviorSnapshots: snapshots,
          },
        );
        expect(seeded.ok, JSON.stringify(seeded)).toBe(true);
        if (!seeded.ok) return;
        expect(mainTotal(seeded.preview.proposedInput)).toBe(450);

        const input: RecipeInput = {
          ...seeded.preview.proposedInput,
          goals: {
            ...seeded.preview.proposedInput.goals,
            formulation_strategy: 'eco',
            direction_targets_active: true,
            direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
          },
        };
        const beforeDirection = recipeDirectionViolations(input);
        const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-20T00:01:00.000Z', {
          productBehaviorSnapshots: snapshots,
        });
        if (!result.ok) {
          if (result.code === 'already_clean') expect(beforeDirection).toEqual([]);
          else if (result.code === 'no_proposal' && beforeDirection.length > 0) {
            expect(result.directionTargetUnreached).toBe(true);
            expect(result.solverInvocations ?? 0).toBeGreaterThan(0);
          } else {
            throw new Error(JSON.stringify(result));
          }
          return;
        }

        const after = result.preview.proposedInput;
        expect(detectViolations(calculateRecipe(after))).toEqual([]);
        expect(mainTotal(after)).toBeGreaterThanOrEqual(200);
        expect(mainTotal(after)).toBeLessThanOrEqual(450);
        expect(after.goals?.direction_targets).toEqual(input.goals?.direction_targets);
      },
      20_000,
    );

    it('trustlessly applies a sweetness target with the served Hazelnut Crown vector', () => {
      const input: RecipeInput = {
        mode: 'classic',
        category: 'milk_gelato',
        target_temperature_c: -11,
        target_batch_grams: 1000,
        machine_capacity_grams: null,
        goals: {
          formulation_strategy: 'eco',
          direction_targets_active: true,
          direction_targets: { sweetness: 1, softness: 0, creaminess: 0, flavor: 0 },
        },
        items: [
          line('milk', IDS.milk, 480),
          line('cream', IDS.cream, 214),
          line('smp', IDS.smp, 48),
          line('sucrose', IDS.sucrose, 109),
          line('dextrose', IDS.dextrose, 46),
          line('tara', IDS.tara, 3),
          line('hazelnut', IDS.hazelnut, 100, 'main'),
        ],
      };
      const snapshots = snapshotsWithApprovedEnvelope(input);
      snapshots.hazelnut = {
        ...snapshots.hazelnut!,
        mainClassification: 'MAIN_BLOCKED_POLICY',
        behaviorRole: 'MAIN_ALLOWED',
        mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
        mainAuthority: 'USER_HELD',
        mainCalibrationLevel: 'NONE',
        mainPolicyId: null,
        mainPolicyVersion: null,
        ecoFloorPercent: null,
        optimalCeilingPercent: null,
        hardLimitPercent: null,
        mainEquivalentFactor: null,
        mainBasis: null,
        moduleEligibility: {
          ...snapshots.hazelnut!.moduleEligibility,
          MAIN: 'eligible',
        },
      };
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-25T03:40:00.000Z', {
        productBehaviorSnapshots: snapshots,
        technicalOnlyMainLineIds: [],
        requirePracticalPreview: true,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(result.preview.mainObjective).toBeDefined();
      expect(mainTotal(result.preview.proposedInput)).toBeGreaterThanOrEqual(100);

      const committed = commitPreview(
        input,
        { byLineId: {} },
        result.preview,
        '2026-08-25T03:40:01.000Z',
        'served-hazelnut-crown-direction',
        [],
        undefined,
        null,
        null,
        null,
        null,
        snapshots,
        [],
      );
      expect(committed.ok, JSON.stringify(committed)).toBe(true);
    }, 30_000);

    // Full Direction sweep at 18 solver rounds — timeout budget only (see above).
    it('does not cross the 20% ECO Main floor to chase an extreme Direction target', () => {
      // 60 s, measured not guessed: this case runs ~17 s in isolation because the
      // shared Direction NEAREST search adds probe solves to every
      // Direction-active Preview, and it is the heaviest such case in the suite.
      // The work is real, not a hang; the assertions are unchanged.
      // Budget raised deliberately: the shared Direction NEAREST search adds up
      // to DIRECTION_NEAREST_MAX_PROBES extra solves per Direction-active
      // Preview, and this case builds many of them. The work is real, not a
      // hang — the assertions themselves are unchanged.
      const seedInput = watermelonFixture(300, 'eco');
      const snapshots = snapshotsWithApprovedEnvelope(seedInput);
      const seeded = buildOptimizePreview(seedInput, { byLineId: {} }, '2026-08-20T00:02:00.000Z', {
        productBehaviorSnapshots: snapshots,
      });
      expect(seeded.ok, JSON.stringify(seeded)).toBe(true);
      if (!seeded.ok) return;
      const atFloor: RecipeInput = {
        ...seeded.preview.proposedInput,
        items: seeded.preview.proposedInput.items.map((item) =>
          item.id === 'watermelon'
            ? { ...item, planned_grams: 200 }
            : item.id === 'milk'
              ? { ...item, planned_grams: item.planned_grams + 250 }
              : item,
        ),
        goals: {
          ...seeded.preview.proposedInput.goals,
          formulation_strategy: 'eco',
          direction_targets_active: true,
          direction_targets: { sweetness: -2, softness: -2, creaminess: 0, flavor: 0 },
        },
      };
      const result = buildOptimizePreview(atFloor, { byLineId: {} }, '2026-08-20T00:03:00.000Z', {
        productBehaviorSnapshots: snapshots,
      });
      if (!result.ok) {
        expect(['no_proposal', 'already_clean', 'unsafe_proposal']).toContain(result.code);
        if (result.code === 'no_proposal') expect(result.directionTargetUnreached).toBe(true);
        // The manually constructed floor fixture may itself be physically
        // invalid. Safety rejection is preferable to a Direction-driven Preview.
        if (result.code === 'unsafe_proposal') {
          expect(detectViolations(calculateRecipe(atFloor)).length).toBeGreaterThan(0);
        }
        return;
      }
      expect(mainTotal(result.preview.proposedInput)).toBeGreaterThanOrEqual(200);
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
    }, 60_000);
    it('keeps Standard unlocked as a soft anchor instead of activating Main maximization', () => {
      const main = build(watermelonFixture(300));
      const standard = build(watermelonFixture(300, 'optimal', 'unlocked'));
      expect(standard.mainObjective).toBeUndefined();
      expect(
        standard.proposedInput.items.find((item) => item.id === 'watermelon')!.planned_grams,
      ).toBeLessThan(mainTotal(main.proposedInput));
    });

    it.each([
      ['Watermelon', IDS.watermelon],
      ['Kiwi', IDS.kiwi],
    ] as const)(
      'never treats correction-inulin-0 as ProductBehavior identity for Standard %s 700 g',
      (_name, mainIngredientId) => {
        const input: RecipeInput = {
          ...singleMainFixture(mainIngredientId, 700),
          items: singleMainFixture(mainIngredientId, 700).items.map((item) =>
            item.id === 'single-main'
              ? {
                  ...item,
                  lock_type: 'unlocked',
                  user_intent_anchor_grams: 700,
                }
              : item,
          ),
        };
        const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-18T10:00:00Z', {
          productBehaviorSnapshots: productBehaviorTestSnapshots(input),
        });
        expect(JSON.stringify(result)).not.toContain(
          'Brak zatwierdzonego uprawnienia OPTIMAL dla: correction-inulin-0',
        );
        if (!result.ok) {
          expect(result.code).not.toBe('product_behavior_invalid');
          return;
        }
        const canonicalInulin = result.preview.proposedInput.items.filter(
          (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === IDS.inulin,
        );
        expect(canonicalInulin).toHaveLength(1);
        expect(canonicalInulin[0]?.id).toBe('inulin');
      },
    );

    it('does not silently add absent canonical Inulin and recommends explicit selection', () => {
      const input: RecipeInput = {
        ...watermelonFixture(700, 'optimal', 'unlocked'),
        items: watermelonFixture(700, 'optimal', 'unlocked')
          .items.filter((item) => item.id !== 'inulin')
          .map((item) =>
            item.id === 'watermelon' ? { ...item, user_intent_anchor_grams: 700 } : item,
          ),
      };
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-18T10:00:00Z', {
        productBehaviorSnapshots: productBehaviorTestSnapshots(input),
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(
        result.preview.proposedInput.items.some(
          (item) =>
            (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'PI-ING-000456',
        ),
      ).toBe(false);
    });

    it('keeps Standard locked exact without activating Main maximization', () => {
      const standard = watermelonFixture(300, 'optimal', 'unlocked');
      const preview = build(standard, { watermelon: { mode: 'locked', grams: 300 } });
      expect(preview.mainObjective).toBeUndefined();
      expect(preview.proposedInput.items.find((item) => item.id === 'watermelon')).toMatchObject({
        planned_grams: 300,
        lock_type: 'unlocked',
      });
    });

    it('accepts the served Sorbet vector when composition-sensitive ice is inside its native band', () => {
      const input: RecipeInput = {
        mode: 'classic',
        category: 'sorbet',
        target_temperature_c: -11,
        target_batch_grams: 1000,
        machine_capacity_grams: null,
        goals: { formulation_strategy: 'eco' },
        items: [
          line('water', IDS.water, 181),
          line('sucrose', IDS.sucrose, 104),
          line('dextrose', IDS.dextrose, 59),
          line('inulin', IDS.inulin, 55),
          line('tara', IDS.tara, 2),
          {
            ...line('watermelon', IDS.watermelon, 600),
            user_intent_anchor_grams: 600,
          },
        ],
      };
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-18T10:00:00Z', {
        productBehaviorSnapshots: snapshotsWithApprovedEnvelope(input),
        technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(result.preview).toMatchObject({
        diagnosticOnly: false,
        violationsBefore: 0,
        violationsAfter: 0,
        hardResidualMetrics: [],
      });
      const diagnostic = result.preview.residualMetricDiagnostics?.find(
        (metric) => metric.metric === 'ice_fraction',
      );
      expect(diagnostic).toBeUndefined();
      const calculated = calculateRecipe(result.preview.proposedInput);
      expect(calculated.ice_fraction_percent).toBeGreaterThanOrEqual(51);
      expect(calculated.ice_fraction_percent).toBeLessThanOrEqual(59);
    });

    it('keeps a Main gram lock exact and trustlessly applies the unlocked maximum', () => {
      const lockedInput = watermelonFixture(200, 'optimal');
      const locked = build(lockedInput, { watermelon: { mode: 'locked', grams: 200 } });
      expect(
        locked.proposedInput.items.find((item) => item.id === 'watermelon')!.planned_grams,
      ).toBe(200);

      const input = watermelonFixture(300, 'optimal');
      const preview = build(input);
      const committed = commitPreview(
        input,
        { byLineId: {} },
        preview,
        '2026-08-16T12:01:00.000Z',
        'watermelon-main-maximum',
        [],
        undefined,
        null,
        null,
        null,
        null,
        snapshotsWithApprovedEnvelope(input),
        technicalOnlyMainLineIds(input),
      );
      expect(committed.ok, JSON.stringify(committed)).toBe(true);
    });

    it('names an impossible locked Main amount and the nearest technical correction', () => {
      const input = watermelonFixture(900, 'optimal');
      const result = buildOptimizePreview(
        input,
        { byLineId: { watermelon: { mode: 'locked', grams: 900 } } },
        '2026-08-16T12:00:00.000Z',
        {
          productBehaviorSnapshots: snapshotsWithApprovedEnvelope(input),
          technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
        },
      );
      expect(result.ok, JSON.stringify(result)).toBe(false);
      if (result.ok) return;
      expect(result).toMatchObject({
        code: 'impossible_under_constraints',
        conflict: {
          lineId: 'watermelon',
          ingredientName: expect.stringContaining('WATERMELON'),
          grams: 900,
        },
      });
      if (result.code === 'impossible_under_constraints') {
        expect(result.nearestFeasibleGrams).toBe(639);
        expect(
          [...result.hardViolatedMetrics, ...result.residualViolatedMetrics].length,
        ).toBeGreaterThan(0);
      }
    });

    it('stages and explicitly applies the Engine-verified correction for a hard-invalid Main lock', () => {
      const priorRecipe = useRecipeStore.getState();
      const priorStudio = useConstraintStudioStore.getState();
      try {
        const input = watermelonFixture(600, 'optimal');
        input.items = input.items
          .filter((item) => item.id !== 'inulin')
          .map((item) => ({
            ...item,
            planned_grams:
              {
                milk: 70,
                cream: 130,
                smp: 35,
                sucrose: 130,
                dextrose: 30,
                tara: 5,
                watermelon: 600,
              }[item.id] ?? item.planned_grams,
          }));
        const snapshots = snapshotsWithApprovedEnvelope(input);
        useRecipeStore.getState().loadRecipeInput(input);
        useRecipeStore.setState({
          productBehaviorSnapshots: structuredClone(snapshots),
          ownerReviewGate: {
            status: 'OWNER_REVIEW_EDITABLE',
            productionStatus: 'PRODUCTION_BLOCKED',
            labelStatus: 'LABEL_BLOCKED',
            omittedToppingLineIds: [],
            technicalOnlyMainLineIds: [],
          },
        });
        useConstraintStudioStore.getState().resetForTests();
        useConstraintStudioStore.getState().toggleLock('watermelon');

        const constraints = useConstraintStudioStore.getState().constraints;
        const impossible = buildOptimizePreview(input, constraints, '2026-08-16T12:00:00.000Z', {
          productBehaviorSnapshots: snapshots,
          technicalOnlyMainLineIds: [],
        });
        expect(impossible).toMatchObject({ ok: false, code: 'impossible_under_constraints' });
        if (impossible.ok || impossible.code !== 'impossible_under_constraints') return;
        expect(impossible.nearestFeasibleGrams).not.toBeNull();
        const recovered = buildSuggestedFixPreview(
          input,
          constraints,
          {
            type: 'set_max',
            lineId: 'watermelon',
            grams: impossible.nearestFeasibleGrams!,
          },
          '2026-08-16T12:00:00.000Z',
        );
        expect(recovered.ok, JSON.stringify(recovered)).toBe(true);
        if (!recovered.ok) return;
        const proposalSnapshots = snapshotsWithApprovedEnvelope(recovered.preview.proposedInput);

        useConstraintStudioStore.getState().createOptimizePreview(proposalSnapshots);
        const staged = useConstraintStudioStore.getState();
        expect(staged.previewIssue).toBeNull();
        expect(staged.recalculationTerminal).toEqual({ state: 'PREVIEW_READY' });
        expect(staged.preview?.kind).toBe('suggested_fix');
        expect(staged.preview?.safetyLockConflict).toMatchObject({
          lineId: 'watermelon',
          beforeGrams: 600,
          boundary: 'maximum',
          reason: 'constraint_feasibility',
        });
        const requiredGrams = staged.preview!.safetyLockConflict!.requiredGrams;
        expect(requiredGrams).toBeGreaterThan(0);
        expect(requiredGrams).toBeLessThan(600);

        useConstraintStudioStore.getState().applyPreview();
        expect(useConstraintStudioStore.getState().blocked).toBeNull();
        expect(useConstraintStudioStore.getState().history).toHaveLength(1);
        expect(
          useRecipeStore.getState().items.find((item) => item.id === 'watermelon')?.planned_grams,
        ).toBe(requiredGrams);
        expect(useConstraintStudioStore.getState().constraints.byLineId.watermelon).toEqual({
          mode: 'locked',
          grams: requiredGrams,
        });
      } finally {
        useRecipeStore.setState(priorRecipe, true);
        useConstraintStudioStore.setState(priorStudio, true);
      }
    });

    it('fails closed when a locked 1200 g Main line exceeds the 1000 g batch', () => {
      const input = watermelonFixture(1200, 'optimal');
      const result = buildOptimizePreview(
        input,
        { byLineId: { watermelon: { mode: 'locked', grams: 1200 } } },
        '2026-08-16T12:00:00.000Z',
        {
          productBehaviorSnapshots: snapshotsWithApprovedEnvelope(input),
          technicalOnlyMainLineIds: technicalOnlyMainLineIds(input),
        },
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'main_ratio_conflict',
        lineIds: ['watermelon'],
        ingredientNames: [expect.stringContaining('WATERMELON')],
      });
      if (!result.ok && result.code === 'main_ratio_conflict') {
        expect(result.messagePl).toContain('1200.0 g');
        expect(result.messagePl).toContain('1000.0 g');
        expect(result.messagePl).toContain('nie zmieniło ich ilości');
      }
    });

    it('shows exact increase and automatic-reduction copy without a flavour ceiling', () => {
      const increased = build(watermelonFixture(80, 'optimal'));
      const reduced = build(watermelonFixture(900, 'optimal'));
      expect(mainObjectiveSummaryPl(increased)).toBe(
        'Maksymalizacja składnika głównego: Gellatti zmienia grupę główną z 80 g na 639 g i ponownie bilansuje całą recepturę.',
      );
      expect(mainObjectiveSummaryPl(reduced)).toBe(
        'Automatyczna korekta składnika głównego: Gellatti zmienia grupę główną z 900 g na 639 g, czyli najwyższą wykonalną ilość, i ponownie bilansuje całą recepturę.',
      );
      expect(`${mainObjectiveSummaryPl(increased)} ${mainObjectiveSummaryPl(reduced)}`).not.toMatch(
        /flavour|limit procent/i,
      );

      const boundedBest = structuredClone(increased);
      boundedBest.mainObjective = {
        ...boundedBest.mainObjective!,
        status: 'best_achievable',
        provenMaximum: false,
        executableMainGrams: 600,
        exactAcceptedMainGrams: 600,
        certifiedUpperBoundGrams: 639,
      };
      expect(mainObjectiveSummaryPl(boundedBest)).toBe(
        'Najlepszy osiągalny wynik: Gellatti zmienia grupę główną z 80 g na 600 g i ponownie bilansuje całą recepturę. To nie jest udowodnione maksimum. Certyfikowana górna granica: 639 g.',
      );
    });

    it('rejects a forged maximum proof and a ratio changed after Preview', () => {
      const input = watermelonFixture(300, 'optimal');
      const preview = build(input);
      const forged = structuredClone(preview);
      if (!forged.mainObjective) throw new Error('missing Main proof');
      forged.mainObjective.provenMaximum = false;
      const forgedResult = commitPreview(
        input,
        { byLineId: {} },
        forged,
        '2026-08-16T12:02:00.000Z',
        'forged',
        [],
        undefined,
        null,
        null,
        null,
        null,
        snapshotsWithApprovedEnvelope(input),
        technicalOnlyMainLineIds(input),
      );
      expect(forgedResult).toMatchObject({ ok: false, code: 'main_identity_violated' });

      const multi = fixtureForRatioChange();
      const multiPreview = build(multi);
      const changedRatio: RecipeInput = {
        ...multi,
        items: multi.items.map((item) =>
          item.id === 'main-0' ? { ...item, main_ratio_weight: 2 } : item,
        ),
      };
      const stale = commitPreview(
        changedRatio,
        { byLineId: {} },
        multiPreview,
        '2026-08-16T12:03:00.000Z',
        'stale-ratio',
        [],
      );
      expect(stale).toMatchObject({ ok: false, code: 'stale_preview' });
    });

    it('requires the rebuilt maximum proof even when Main already starts at X', () => {
      const input = watermelonFixture(639, 'optimal');
      const preview = build(input);
      expect(preview.mainObjective).toMatchObject({
        status: 'maximized',
        executableMainGrams: 639,
        provenMaximum: true,
      });
      const forged = structuredClone(preview);
      delete forged.mainObjective;
      const result = commitPreview(
        input,
        { byLineId: {} },
        forged,
        '2026-08-16T12:02:30.000Z',
        'forged-proof-at-x',
        [],
        undefined,
        null,
        null,
        null,
        null,
        snapshotsWithApprovedEnvelope(input),
        technicalOnlyMainLineIds(input),
      );
      expect(result).toMatchObject({ ok: false, code: 'main_identity_violated' });
    });

    it('keeps every Required line exact in the bound and executable candidate', () => {
      const input = watermelonFixture(300, 'optimal');
      input.items = input.items.map((item) =>
        item.id === 'inulin'
          ? {
              ...item,
              lock_type: 'required' as const,
              grams_constraint: { grams: item.planned_grams },
            }
          : item,
      );
      const bound = mainTechnicalLinearUpperBound({
        recipe: input,
        constraints: { byLineId: {} },
        snapshots: snapshotsWithApprovedEnvelope(input),
      });
      const inulinIndex = input.items.findIndex((item) => item.id === 'inulin');
      expect(bound.continuousSolutionGrams?.[inulinIndex]).toBe(5);
      const preview = build(input);
      expect(preview.proposedInput.items.find((item) => item.id === 'inulin')).toMatchObject({
        planned_grams: 5,
        lock_type: 'required',
      });
    });

    it('keeps the same liquid-dairy carrier floor in every candidate and the final Preview', () => {
      const input = watermelonFixture(300, 'optimal');
      const snapshots = snapshotsWithApprovedEnvelope(input);
      snapshots.watermelon = {
        ...snapshots.watermelon!,
        requiresLiquidDairyCarrier: true,
        liquidDairyCarrierFloorPercent: 30,
      };
      snapshots.milk = {
        ...snapshots.milk!,
        approvedLiquidDairyCarrier: true,
      };
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-16T12:00:00.000Z', {
        productBehaviorSnapshots: snapshots,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(
        result.preview.proposedInput.items.find((item) => item.id === 'milk')!.planned_grams,
      ).toBeGreaterThanOrEqual(300);
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
      expect(result.preview.mainObjective?.executableMainGrams).toBeGreaterThan(0);
    });

    it('is deterministic within the bounded proof budget', () => {
      expect(Number.isFinite(MAIN_TECHNICAL_PROBE_BUDGET)).toBe(true);
      expect(MAIN_TECHNICAL_PROBE_BUDGET).toBeGreaterThanOrEqual(1200);
      const input = watermelonFixture(300, 'optimal');
      const first = build(input);
      const second = build(input);
      expect(second.proposedInput.items.map((item) => [item.id, item.planned_grams])).toEqual(
        first.proposedInput.items.map((item) => [item.id, item.planned_grams]),
      );
      expect(second.mainObjective).toEqual(first.mainObjective);
      expect(second.baseFingerprint).toBe(first.baseFingerprint);
      expect(workingStateFingerprint(second.proposedInput, second.nextConstraints)).toBe(
        workingStateFingerprint(first.proposedInput, first.nextConstraints),
      );
      expect(first.mainObjective?.attempts).toBeLessThanOrEqual(MAIN_TECHNICAL_PROBE_BUDGET);
    });

    it.each([
      ['Banana Fresh Fruit', IDS.banana],
      ['Kiwi Fresh Fruit', IDS.kiwi],
      ['Coffee with complete composition', IDS.coffee],
    ] as const)('maximizes another complete single-Main fixture: %s', (_name, ingredientId) => {
      const input = singleMainFixture(ingredientId);
      const preview = build(input);
      expect(['maximized', 'best_achievable']).toContain(preview.mainObjective?.status);
      expect(mainTotal(preview.proposedInput)).toBeGreaterThan(0);
      expect(preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
        1000,
      );
      expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
    });

    it('keeps Estimated, Verified and customer/manual provenance informational', () => {
      const outcomes = ['estimated', 'verified', 'customer_added', 'manual_unverified'] as const;
      const maxima = outcomes.map((verificationState) => {
        const input = watermelonFixture(300, 'optimal');
        const snapshots = snapshotsWithApprovedEnvelope(input);
        snapshots.watermelon = { ...snapshots.watermelon!, verificationState };
        const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-16T12:00:00.000Z', {
          productBehaviorSnapshots: snapshots,
        });
        expect(result.ok, `${verificationState}: ${JSON.stringify(result)}`).toBe(true);
        if (!result.ok) return null;
        return result.preview.mainObjective?.executableMainGrams ?? null;
      });
      // GEL-P0-027: the Crown frontier is the approved hard limit (45% of
      // 1000 g), identical for every provenance state.
      expect(maxima).toEqual([450, 450, 450, 450]);
    });

    it('maximizes a customer/manual product with complete technical composition', () => {
      const productId = 'customer-watermelon-complete';
      const input = watermelonFixture(300, 'optimal');
      input.items = input.items.map((item) =>
        item.id === 'watermelon'
          ? {
              ...item,
              ingredient: {
                ...item.ingredient,
                id: 'customer-watermelon',
                canonical_ingredient_id: undefined,
                identity_provenance: 'private_product',
                private_product_id: productId,
              },
            }
          : item,
      );
      const snapshots = snapshotsWithApprovedEnvelope(input);
      snapshots.watermelon = {
        ...snapshots.watermelon!,
        productId,
        productVersionId: 'customer-watermelon-version-1',
        source: 'manual',
        verificationState: 'customer_added',
        mapperIngredientId: null,
        technicalAuthority: 'approved_pi_calculation',
      };
      const result = buildOptimizePreview(input, { byLineId: {} }, '2026-08-16T12:00:00.000Z', {
        productBehaviorSnapshots: snapshots,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      // GEL-P0-027: bounded by the approved hard limit (45% of 1000 g), not by
      // the OPTIMAL preference target.
      expect(result.preview.mainObjective?.executableMainGrams).toBe(450);
      expect(detectViolations(calculateRecipe(result.preview.proposedInput))).toEqual([]);
    });

    it.each([
      ['Watermelon 300 g', 300, false],
      ['Watermelon 500 g', 500, false],
      ['locked Watermelon 200 g', 200, true],
    ] as const)('Apply then Undo restores the exact %s draft', (_name, grams, locked) => {
      expectExactApplyUndo(watermelonFixture(grams, 'optimal'), {
        byLineId: locked ? { watermelon: { mode: 'locked', grams } } : {},
      });
    });

    it('Apply then Undo restores the exact Kiwi 1200 g draft', () => {
      expectExactApplyUndo(singleMainFixture(IDS.kiwi, 1200), { byLineId: {} });
    });
  },
);

describe('Multi-Main ratio contract', { timeout: SOLVER_PROOF_TIMEOUT_MS }, () => {
  const fixture = (
    starts: readonly number[],
    ingredientIds: readonly string[],
    explicitWeights?: readonly number[],
  ): RecipeInput => ({
    ...watermelonFixture(0, 'optimal'),
    items: [
      ...structuralLines(),
      ...ingredientIds.map((ingredientId, index) =>
        line(`main-${index}`, ingredientId, starts[index]!, 'main', explicitWeights?.[index]),
      ),
    ],
  });

  it('defaults two unlocked Main products to 50/50 independent of input grams', () => {
    const first = build(fixture([10, 100], [IDS.strawberry, IDS.banana]));
    const second = build(fixture([300, 1], [IDS.strawberry, IDS.banana]));
    for (const preview of [first, second]) {
      const grams = mainLines(preview.proposedInput).map((item) => item.planned_grams);
      expect(Math.abs(grams[0]! - grams[1]!)).toBeLessThanOrEqual(1);
    }
    expect(mainTotal(first.proposedInput)).toBe(mainTotal(second.proposedInput));
  });

  it('preserves an explicit 2:1 ratio and equal thirds after whole-gram reconciliation', () => {
    const twoToOne = build(fixture([10, 100], [IDS.strawberry, IDS.banana], [2, 1]));
    const pair = mainLines(twoToOne.proposedInput).map((item) => item.planned_grams);
    expect(Math.abs(pair[0]! - pair[1]! * 2)).toBeLessThanOrEqual(1);

    const thirds = build(fixture([10, 100, 300], [IDS.strawberry, IDS.banana, IDS.kiwi]));
    const grams = mainLines(thirds.proposedInput).map((item) => item.planned_grams);
    expect(Math.max(...grams) - Math.min(...grams)).toBeLessThanOrEqual(1);
    expect(grams).toEqual([237, 236, 236]);
    expect(thirds.mainObjective).toMatchObject({
      status: 'maximized',
      executableMainGrams: 709,
      certifiedUpperBoundGrams: 709,
      firstHigherRejectedGrams: 710,
      provenMaximum: true,
    });
  });

  it('keeps one locked Main exact and maximizes the remaining unlocked portion', () => {
    const input = fixture([200, 10], [IDS.strawberry, IDS.banana]);
    const preview = build(input, { 'main-0': { mode: 'locked', grams: 200 } });
    expect(preview.proposedInput.items.find((item) => item.id === 'main-0')!.planned_grams).toBe(
      200,
    );
    expect(preview.proposedInput.items.find((item) => item.id === 'main-1')!.planned_grams).toBe(
      541,
    );
    expect(preview.mainObjective).toMatchObject({
      status: 'maximized',
      executableMainGrams: 741,
      certifiedUpperBoundGrams: 741,
      provenMaximum: true,
    });
    expect(mainObjectiveSummaryPl(preview)).toContain('Blokada Main zmienia proporcję grupy:');
    expect(mainObjectiveSummaryPl(preview)).toContain('200 g / 541 g');
    expect(mainObjectiveSummaryPl(preview)).toContain('proporcji 1:1');
  });

  it.each([
    ['120/180/240', [120, 180, 240]],
    ['100/100/100', [100, 100, 100]],
  ] as const)(
    'keeps the demoted Banana visibly present for the %s served fixture',
    (_name, starts) => {
      const input = fixture(starts, [IDS.strawberry, IDS.banana, IDS.kiwi]);
      const beforeTotal = input.items.reduce((sum, item) => sum + item.planned_grams, 0);
      const demoted: RecipeInput = {
        ...input,
        items: input.items.map((item) =>
          item.id === 'main-1'
            ? {
                ...item,
                lock_type: 'unlocked',
                user_intent_anchor_grams: item.planned_grams,
                main_ratio_weight: undefined,
              }
            : item,
        ),
      };
      expect(demoted.items.find((item) => item.id === 'main-1')).toMatchObject({
        planned_grams: starts[1],
        lock_type: 'unlocked',
        user_intent_anchor_grams: starts[1],
      });
      expect(demoted.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(beforeTotal);

      const preview = build(demoted);
      const banana = preview.proposedInput.items.find((item) => item.id === 'main-1')!;
      expect(banana.lock_type).toBe('unlocked');
      expect(banana.planned_grams).toBeGreaterThanOrEqual(1);
      expect(banana.user_intent_anchor_grams).toBe(starts[1]);
      expect(preview.proposedInput.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
        1000,
      );
      expect(detectViolations(calculateRecipe(preview.proposedInput))).toEqual([]);
    },
  );

  it('Apply then Undo restores the exact 10/100 Multi-Main draft', () => {
    expectExactApplyUndo(fixture([10, 100], [IDS.strawberry, IDS.banana]), { byLineId: {} });
  });

  it('Apply then Undo restores one locked Main and one unlocked Main', () => {
    expectExactApplyUndo(fixture([200, 10], [IDS.strawberry, IDS.banana]), {
      byLineId: { 'main-0': { mode: 'locked', grams: 200 } },
    });
  });

  it('Apply then Undo restores three equal-ratio Main lines', () => {
    expectExactApplyUndo(fixture([10, 100, 300], [IDS.strawberry, IDS.banana, IDS.kiwi]), {
      byLineId: {},
    });
  });

  // Full Direction sweep at 18 solver rounds — timeout budget only (see above).
  it('Apply then Undo restores a positive demoted Standard line', () => {
    const input = fixture([120, 180, 240], [IDS.strawberry, IDS.banana, IDS.kiwi]);
    const demoted: RecipeInput = {
      ...input,
      items: input.items.map((item) =>
        item.id === 'main-1'
          ? {
              ...item,
              lock_type: 'unlocked',
              main_ratio_weight: undefined,
              user_intent_anchor_grams: item.planned_grams,
            }
          : item,
      ),
    };
    expectExactApplyUndo(demoted, { byLineId: {} });
  }, 20_000);
});

function fixtureForRatioChange(): RecipeInput {
  return {
    ...watermelonFixture(0, 'optimal'),
    items: [
      ...structuralLines(),
      line('main-0', IDS.strawberry, 10, 'main'),
      line('main-1', IDS.banana, 100, 'main'),
    ],
  };
}
