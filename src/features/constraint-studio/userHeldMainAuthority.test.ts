/**
 * GLOBAL MAIN AUTHORITY — Crown priority through the real Preview pipeline.
 *
 * §6  Main identity is protected while grams remain available to the safe
 *     Main-priority objective.
 * §16 Sorbet no longer depends on the exact three-id whitelist.
 * §19 The owner decides the Multi-Main combination.
 * §20 The ratio (1:1, 2:1, reverse order) survives optimisation.
 * §22 A technical failure is reported as a technical failure, never as
 *     "this ingredient cannot be Main".
 * §34 A positive Main never reaches 0 g.
 *
 * The scaffold is the owner's served Sorbet: the canonical Sorbet starter with
 * WATER 143 / SUCROSE 78 / DEXTROSE 125 / INULIN 50 / TARA 4 and the owner's
 * Main group — the same base the Main-constrained NEAREST suite uses, so any
 * failure here is about Crown authority, not about an invented recipe. The
 * serving temperature is stated per case because Banana and Strawberry do not
 * reach the same bands, which is precisely the §22 distinction under test.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput, type RecipeItem } from '@/engine';
import {
  productBehaviorSnapshotFingerprint,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { flavourHeldLineIds } from '@/features/formulation/flavourMutationAuthority';
import { practicalizeRecipeCandidate } from '@/features/practical-recipe/practicalRecipe';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from './applyPipeline';
import { uncorrectableMultiMainAuthorityViolation } from './constraintStudioStore';

const AT = '2026-08-23T12:00:00.000Z';
const NONE = { byLineId: {} } as const;
const OWNER_GRAMS = { water: 143, sucrose: 78, dextrose: 125, inulin: 50, tara: 4 } as const;

const MAPPER = {
  strawberry: 'PI-ING-001553',
  banana: 'PI-ING-000345',
  raspberry: 'PI-ING-000394',
  lime: 'PI-ING-000369',
  bananaPuree: 'PI-ING-001589',
  cranberry: 'PI-ING-001556',
} as const;

type Main = { id: string; mapperId: string; grams: number; weight?: number };

const ownerSorbet = (mains: readonly Main[], temperature: -11 | -12 | -13 = -11): RecipeInput => {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId:
      temperature === -11
        ? 'temp_minus_11'
        : temperature === -12
          ? 'temp_minus_12'
          : 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  const items = scaffold.items
    .map((item) => {
      const key = (Object.keys(OWNER_GRAMS) as Array<keyof typeof OWNER_GRAMS>).find((candidate) =>
        item.id.includes(candidate),
      );
      return {
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
        planned_grams: key ? OWNER_GRAMS[key] : item.planned_grams,
      };
    })
    .filter((item) => item.planned_grams > 0);
  const mainItems = mains.map(
    (main) =>
      ({
        id: main.id,
        ingredient: sorbetMapperIngredient(main.mapperId),
        planned_grams: main.grams,
        actual_grams: null,
        lock_type: 'main',
        ...(main.weight === undefined ? {} : { main_ratio_weight: main.weight }),
      }) as RecipeItem,
  );
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: temperature,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [...items, ...mainItems],
    goals: { formulation_strategy: 'optimal' },
  } as RecipeInput;
};

/**
 * The server answer for a semantically valid flavour carrier with no approved
 * envelope for this profile — Banana or Raspberry in Sorbet.
 */
const USER_HELD: Partial<ProductBehaviorSnapshot> = {
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
  mainAuthority: 'USER_HELD',
  mainCalibrationLevel: 'NONE',
  mainPolicyId: null,
  mainPolicyVersion: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: null,
  mainBasis: null,
};

/** The exact calibrated Sorbet 60 % authority is preserved unchanged (§7, §25). */
const CALIBRATED: Partial<ProductBehaviorSnapshot> = {
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'EXACT_PRODUCT',
};

const INCOMPATIBLE_NUT_CALIBRATED: Partial<ProductBehaviorSnapshot> = {
  ...CALIBRATED,
  familyId: 'nut',
  subfamilyId: null,
  formId: 'pure_nut_paste',
  mainPolicyId: 'main-incompatible-nut-test',
  mainPolicyVersion: '1',
  ecoFloorPercent: 8,
  optimalCeilingPercent: 15,
  hardLimitPercent: 15,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: 1,
  mainBasis: 'NUT_EQUIVALENT',
};

const snapshotsWith = (
  input: RecipeInput,
  overrides: Record<string, Partial<ProductBehaviorSnapshot>>,
): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = sorbetAuthoritySnapshots(input);
  for (const [lineId, patch] of Object.entries(overrides)) {
    const current = snapshots[lineId];
    if (!current) throw new Error(`fixture has no snapshot for ${lineId}`);
    snapshots[lineId] = { ...current, ...patch } as ProductBehaviorSnapshot;
  }
  return snapshots;
};

const preview = (
  input: RecipeInput,
  overrides: Record<string, Partial<ProductBehaviorSnapshot>>,
  constraints: {
    byLineId: Record<string, { mode: 'locked'; grams: number }>;
  } = NONE,
) =>
  buildOptimizePreview(input, constraints, AT, {
    productBehaviorSnapshots: snapshotsWith(input, overrides),
  });

const gramsOf = (input: RecipeInput, lineId: string): number => {
  const item = input.items.find((candidate) => candidate.id === lineId);
  if (!item) throw new Error(`proposal has no line ${lineId}`);
  return item.planned_grams;
};

const roleOf = (input: RecipeInput, lineId: string) =>
  input.items.find((candidate) => candidate.id === lineId)?.lock_type;

const campaignGelatoSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  const banana = snapshots['main-banana'];
  if (!banana) throw new Error('fixture has no Banana snapshot');
  snapshots['main-banana'] = {
    ...banana,
    familyId: 'fruit',
    subfamilyId: 'banana',
    formId: 'fresh',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainCapability: 'MAIN_CAPABLE',
    mainAuthority: 'CALIBRATED',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainPolicyId: 'main-banana-fresh-dairy',
    mainPolicyVersion: '2',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 20,
    hardLimitPercent: 30,
    multiMainHardLimitPercent: null,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30,
    moduleEligibility: { ...banana.moduleEligibility, MAIN: 'eligible' },
  };
  for (const item of input.items) {
    if (/milk|cream/.test(item.id) && snapshots[item.id]) {
      snapshots[item.id] = { ...snapshots[item.id]!, approvedLiquidDairyCarrier: true };
    }
  }
  return snapshots;
};

const campaignVeganSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  for (const [lineId, subfamilyId, formId] of [
    ['main-strawberry', 'berry', 'fresh'],
    ['main-banana-puree', 'banana', 'puree'],
  ] as const) {
    const current = snapshots[lineId];
    if (!current) throw new Error(`fixture has no Vegan snapshot for ${lineId}`);
    snapshots[lineId] = {
      ...current,
      familyId: 'fruit',
      subfamilyId,
      formId,
      behaviorRole: 'MAIN_PROFILE_SPECIFIC',
      mainClassification: 'MAIN_PROFILE_SPECIFIC',
      mainCapability: 'MAIN_CAPABLE',
      mainAuthority: 'CALIBRATED',
      mainCalibrationLevel: 'EXACT_PRODUCT',
      mainPolicyId: 'main-vegan-fruit-combination-v2',
      mainPolicyVersion: '2',
      ecoFloorPercent: 30,
      optimalCeilingPercent: 87.6,
      hardLimitPercent: 87.6,
      multiMainHardLimitPercent: 82.5,
      mainEquivalentFactor: 1,
      mainBasis: 'FRUIT_EQUIVALENT',
      moduleEligibility: { ...current.moduleEligibility, MAIN: 'eligible' },
    };
  }
  const cranberry = snapshots['main-cranberry'];
  if (!cranberry) throw new Error('fixture has no Cranberry snapshot');
  snapshots['main-cranberry'] = {
    ...cranberry,
    ...USER_HELD,
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    mainClassification: 'MAIN_CAPABLE_UNCALIBRATED',
    moduleEligibility: { ...cranberry.moduleEligibility, MAIN: 'eligible' },
  } as ProductBehaviorSnapshot;
  return snapshots;
};

describe('single Crown is a safe Main priority, not a gram lock (§6, §16, §34)', () => {
  it('Apply rebuilds the bound Gelato proposal from current authority, not proposal authority', () => {
    const starter = buildCanonicalNewRecipeStarter({
      visibleProductType: 'gelato',
      servingModeId: 'temp_minus_12',
      formulationStrategy: 'eco',
      targetBatchGrams: 500,
    });
    const input: RecipeInput = {
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: starter.targetTemperatureC,
      target_batch_grams: 500,
      machine_capacity_grams: null,
      items: [
        ...starter.items,
        {
          id: 'main-banana',
          ingredient: sorbetMapperIngredient(MAPPER.banana),
          planned_grams: 1,
          actual_grams: null,
          lock_type: 'main',
          main_ratio_weight: 1,
          user_intent_anchor_grams: 1,
        },
      ],
      goals: {
        formulation_strategy: 'eco',
        direction_targets_active: true,
        direction_targets: { sweetness: -2, softness: -2, creaminess: 0, flavor: 0 },
      },
    };
    const baseSnapshots = campaignGelatoSnapshots(input);
    const raw = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: baseSnapshots,
      technicalOnlyMainLineIds: [],
      requirePracticalPreview: true,
    });
    expect(raw.ok, JSON.stringify(raw).slice(0, 1_200)).toBe(true);
    if (!raw.ok) return;
    const proposalSnapshots = campaignGelatoSnapshots(raw.preview.proposedInput);
    const built = bindProductBehaviorToPreview(raw, proposalSnapshots, baseSnapshots, []);
    expect(built.ok, JSON.stringify(built).slice(0, 1_200)).toBe(true);
    if (!built.ok) return;
    const proposedFingerprint = workingStateFingerprint(
      built.preview.proposedInput,
      built.preview.nextConstraints,
    );
    const committed = commitPreview(
      input,
      NONE,
      built.preview,
      '2026-08-23T12:00:01.000Z',
      'gelato-current-authority-rebuild',
      [],
      undefined,
      null,
      null,
      {
        baseFingerprint: built.preview.baseFingerprint,
        targetFingerprint: directionTargetFingerprint(input),
        candidateFingerprint: proposedFingerprint,
      },
      null,
      baseSnapshots,
      [],
      {
        baseFingerprint: built.preview.baseFingerprint,
        proposedFingerprint,
        baseProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(baseSnapshots),
        proposedProductBehaviorFingerprint: productBehaviorSnapshotFingerprint(proposalSnapshots),
        snapshots: structuredClone(proposalSnapshots),
      },
      null,
      { requirePracticalPreview: true },
    );
    expect(committed, JSON.stringify(committed)).toMatchObject({ ok: true });
  });

  it('OWNER REPRODUCER: an uncalibrated Banana Crown may move while its Main role survives', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 480 }]);
    const result = preview(input, { 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).not.toBe(480);
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBeGreaterThan(0);
    expect(roleOf(result.preview.proposedInput, 'main-banana')).toBe('main');
  });

  it('runs the Main frontier instead of reporting an unrequested exact-gram hold', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 480 }]);
    const result = preview(input, { 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).not.toBe(480);
    const proof = result.preview.mainObjective;
    if (proof) {
      expect(proof.status).not.toBe('held_by_contract');
      expect(proof.executableMainGrams).not.toBe(480);
    }
  });

  it('Raspberry — a fruit with no exact Sorbet policy — is usable as Main (§16)', () => {
    const input = ownerSorbet([{ id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 600 }]);
    const result = preview(input, { 'main-raspberry': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-raspberry')).toBeGreaterThan(0);
    expect(roleOf(result.preview.proposedInput, 'main-raspberry')).toBe('main');
  });

  it('the approved Strawberry 60 % calibration still governs its own Main (§7, §25)', () => {
    const input = ownerSorbet(
      [{ id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 600 }],
      -13,
    );
    const result = preview(input, { 'main-strawberry': CALIBRATED });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const grams = gramsOf(result.preview.proposedInput, 'main-strawberry');
    // 60/60/60 envelope: the calibrated path holds the approved point exactly.
    expect(grams).toBe(600);
    expect(roleOf(result.preview.proposedInput, 'main-strawberry')).toBe('main');
  });
});

describe('Multi-Main protects the group ratio, not absolute grams (§19, §20, §21)', () => {
  it('truthfully refuses an unchanged no-increase proof while preserving the Vegan Main group', () => {
    const starter = buildCanonicalNewRecipeStarter({
      visibleProductType: 'vegan',
      servingModeId: 'temp_minus_11',
      formulationStrategy: 'optimal',
      targetBatchGrams: 1_000,
    });
    let current: RecipeInput = {
      mode: 'classic',
      category: 'vegan_gelato',
      target_temperature_c: starter.targetTemperatureC,
      target_batch_grams: 1_000,
      machine_capacity_grams: null,
      items: [
        ...starter.items,
        {
          id: 'main-strawberry',
          ingredient: sorbetMapperIngredient(MAPPER.strawberry),
          planned_grams: 100,
          actual_grams: null,
          lock_type: 'main',
          main_ratio_weight: 100,
          user_intent_anchor_grams: 100,
        },
        {
          id: 'main-banana-puree',
          ingredient: sorbetMapperIngredient(MAPPER.bananaPuree),
          planned_grams: 200,
          actual_grams: null,
          lock_type: 'main',
          main_ratio_weight: 200,
          user_intent_anchor_grams: 200,
        },
        {
          id: 'main-cranberry',
          ingredient: sorbetMapperIngredient(MAPPER.cranberry),
          planned_grams: 300,
          actual_grams: null,
          lock_type: 'main',
          main_ratio_weight: 300,
          user_intent_anchor_grams: 300,
        },
      ],
      goals: { formulation_strategy: 'optimal' },
    };
    const support = current.items.find((item) => item.lock_type !== 'main')!;
    const constraints = {
      byLineId: { [support.id]: { mode: 'locked' as const, grams: support.planned_grams } },
    };
    for (const [sweetness, softness] of [
      [0, 0],
      [2, 0],
    ] as const) {
      current = {
        ...current,
        goals: {
          formulation_strategy: 'optimal',
          direction_targets_active: true,
          direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
        },
      };
      const baseSnapshots = campaignVeganSnapshots(current);
      const raw = buildOptimizePreview(current, constraints, AT, {
        productBehaviorSnapshots: baseSnapshots,
        technicalOnlyMainLineIds: [],
        requirePracticalPreview: true,
      });
      expect(raw.ok, JSON.stringify(raw).slice(0, 1_200)).toBe(true);
      if (!raw.ok) return;
      const proposalSnapshots = campaignVeganSnapshots(raw.preview.proposedInput);
      const built = bindProductBehaviorToPreview(raw, proposalSnapshots, baseSnapshots, []);
      expect(built.ok, JSON.stringify(built).slice(0, 1_200)).toBe(true);
      if (!built.ok) return;
      current = built.preview.proposedInput;
    }
    const requested: RecipeInput = {
      ...current,
      goals: {
        formulation_strategy: 'optimal',
        direction_targets_active: true,
        direction_targets: { sweetness: 2, softness: -2, creaminess: 0, flavor: 0 },
      },
    };
    const refused = buildOptimizePreview(requested, constraints, AT, {
      productBehaviorSnapshots: campaignVeganSnapshots(requested),
      technicalOnlyMainLineIds: [],
      requirePracticalPreview: true,
    });
    expect(refused).toMatchObject({
      ok: false,
      code: 'no_proposal',
      directionTargetUnreached: true,
    });
    const mains = current.items.filter((item) => item.lock_type === 'main');
    expect(mains.map((item) => item.id)).toEqual([
      'main-strawberry',
      'main-banana-puree',
      'main-cranberry',
    ]);
    expect(mains.map((item) => item.main_ratio_weight)).toEqual([100, 200, 300]);
    expect(mains[1]!.planned_grams / mains[0]!.planned_grams).toBeCloseTo(2, 1);
    expect(mains[2]!.planned_grams / mains[0]!.planned_grams).toBeCloseTo(3, 1);
    expect(mains.every((item) => item.planned_grams > 1)).toBe(true);
  });

  it('applies the hard-safe Sorbet 1:1 candidate reproduced by the stress campaign', () => {
    const source = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 150, weight: 150 },
      { id: 'main-lime', mapperId: MAPPER.lime, grams: 150, weight: 150 },
    ]);
    const input: RecipeInput = {
      ...source,
      goals: {
        formulation_strategy: 'optimal',
        direction_targets_active: true,
        direction_targets: { sweetness: -2, softness: -2, creaminess: 0, flavor: 0 },
      },
    };
    const snapshots = snapshotsWith(input, {
      'main-strawberry': CALIBRATED,
      'main-lime': CALIBRATED,
    });
    const built = buildOptimizePreview(input, NONE, AT, {
      productBehaviorSnapshots: snapshots,
      technicalOnlyMainLineIds: [],
      requirePracticalPreview: true,
    });
    expect(built.ok, JSON.stringify(built).slice(0, 800)).toBe(true);
    if (!built.ok) return;
    expect([
      gramsOf(built.preview.proposedInput, 'main-strawberry'),
      gramsOf(built.preview.proposedInput, 'main-lime'),
    ]).toEqual([300, 300]);
    expect(built.preview.practicalization?.status).toBe('ready');
    if (built.preview.practicalization?.status !== 'ready') return;
    const audit = built.preview.practicalization.audit;
    const roundTrip = practicalizeRecipeCandidate(
      audit.exactInput,
      built.preview.nextConstraints,
      flavourHeldLineIds(audit.exactInput),
    );
    expect(roundTrip.ok, JSON.stringify(roundTrip)).toBe(true);
    if (!roundTrip.ok) return;
    expect(roundTrip.audit.executableInput).toEqual(built.preview.proposedInput);
    const exactScore = recipeFitForInput(audit.exactInput, calculateRecipe(audit.exactInput)).score;
    expect(
      built.preview.mainObjective?.technicalScore,
      JSON.stringify({ proof: built.preview.mainObjective, exactScore }),
    ).toBe(exactScore);

    const committed = commitPreview(
      input,
      NONE,
      built.preview,
      '2026-08-23T12:00:01.000Z',
      'sorbet-stress-1-to-1',
      [],
      undefined,
      null,
      null,
      {
        baseFingerprint: built.preview.baseFingerprint,
        targetFingerprint: directionTargetFingerprint(input),
        candidateFingerprint: workingStateFingerprint(
          built.preview.proposedInput,
          built.preview.nextConstraints,
        ),
      },
      null,
      snapshots,
      [],
      null,
      null,
      { requirePracticalPreview: true },
    );
    expect(committed, JSON.stringify(committed)).toMatchObject({ ok: true });
  }, 120_000);

  it('two Crowns at 1:1 move together and preserve the owner ratio', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 240, weight: 1 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 240, weight: 1 },
    ]);
    const result = preview(input, { 'main-strawberry': CALIBRATED, 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const strawberry = gramsOf(result.preview.proposedInput, 'main-strawberry');
    const banana = gramsOf(result.preview.proposedInput, 'main-banana');
    expect(strawberry).toBeGreaterThan(0);
    expect(banana).toBeGreaterThan(0);
    expect(strawberry + banana).not.toBe(480);
    expect(Math.abs(strawberry - banana)).toBeLessThanOrEqual(1);
  });

  it('two Crowns at 2:1 may move while preserving the 2:1 ratio', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 320, weight: 2 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 160, weight: 1 },
    ]);
    const result = preview(input, { 'main-strawberry': CALIBRATED, 'main-banana': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const strawberry = gramsOf(result.preview.proposedInput, 'main-strawberry');
    const banana = gramsOf(result.preview.proposedInput, 'main-banana');
    expect(strawberry + banana).not.toBe(480);
    expect(Math.abs(strawberry - banana * 2)).toBeLessThanOrEqual(1);
  });

  it('banana + raspberry — two uncalibrated Mains — need no pre-listed SQL group (§19)', () => {
    const input = ownerSorbet([
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 240, weight: 1 },
      { id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 240, weight: 1 },
    ]);
    const result = preview(input, { 'main-banana': USER_HELD, 'main-raspberry': USER_HELD });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const banana = gramsOf(result.preview.proposedInput, 'main-banana');
    const raspberry = gramsOf(result.preview.proposedInput, 'main-raspberry');
    expect(banana + raspberry).not.toBe(480);
    expect(Math.abs(banana - raspberry)).toBeLessThanOrEqual(1);
  });

  it('three Crowns move as one positive 1:2:3 group', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 80, weight: 1 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 160, weight: 2 },
      { id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 240, weight: 3 },
    ]);
    const result = preview(input, {
      'main-strawberry': CALIBRATED,
      'main-banana': USER_HELD,
      'main-raspberry': USER_HELD,
    });
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    const grams = ['main-strawberry', 'main-banana', 'main-raspberry'].map((lineId) =>
      gramsOf(result.preview.proposedInput, lineId),
    );
    expect(grams.every((value) => value > 0)).toBe(true);
    expect(grams.reduce((sum, value) => sum + value, 0)).not.toBe(480);
    expect(Math.abs(grams[1]! - grams[0]! * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(grams[2]! - grams[0]! * 3)).toBeLessThanOrEqual(2);
  });

  it('reverse assignment order gives the identical held result (§30)', () => {
    const mains: Main[] = [
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 200, weight: 1 },
      { id: 'main-raspberry', mapperId: MAPPER.raspberry, grams: 400, weight: 2 },
    ];
    const overrides = { 'main-banana': USER_HELD, 'main-raspberry': USER_HELD };
    const forward = preview(ownerSorbet(mains), overrides);
    const reverse = preview(ownerSorbet([...mains].reverse()), overrides);
    expect(forward.ok && reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(gramsOf(forward.preview.proposedInput, 'main-banana')).toBe(
      gramsOf(reverse.preview.proposedInput, 'main-banana'),
    );
    expect(gramsOf(forward.preview.proposedInput, 'main-raspberry')).toBe(
      gramsOf(reverse.preview.proposedInput, 'main-raspberry'),
    );
  });
});

describe('Crown and real gram-lock authority remain independent', () => {
  it('a real gram lock on a Crown remains absolute', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 480 }]);
    const result = preview(
      input,
      { 'main-banana': USER_HELD },
      { byLineId: { 'main-banana': { mode: 'locked', grams: 480 } } },
    );
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBe(480);
    expect(roleOf(result.preview.proposedInput, 'main-banana')).toBe('main');
  });

  it('a Crown may move while a separate real gram lock stays exact', () => {
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 480 }]);
    const lockedLine = input.items.find((item) => item.id.includes('water'))!;
    const result = preview(
      input,
      { 'main-banana': USER_HELD },
      { byLineId: { [lockedLine.id]: { mode: 'locked', grams: lockedLine.planned_grams } } },
    );
    expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
    if (!result.ok) return;
    expect(gramsOf(result.preview.proposedInput, lockedLine.id)).toBe(lockedLine.planned_grams);
    expect(gramsOf(result.preview.proposedInput, 'main-banana')).not.toBe(480);
  });

  it('an impossible incompatible Multi-Main returns an explicit domain refusal', () => {
    const input = ownerSorbet([
      { id: 'main-strawberry', mapperId: MAPPER.strawberry, grams: 300, weight: 1 },
      { id: 'main-banana', mapperId: MAPPER.banana, grams: 300, weight: 1 },
    ]);
    const snapshots = snapshotsWith(input, {
      'main-strawberry': CALIBRATED,
      'main-banana': INCOMPATIBLE_NUT_CALIBRATED,
    });
    const violation = uncorrectableMultiMainAuthorityViolation(input, snapshots);
    expect(violation).toMatchObject({
      code: 'multi_main_policy_unknown',
      lineIds: expect.arrayContaining(['main-strawberry', 'main-banana']),
    });
    expect(violation?.messagePl).toMatch(/wspólnego zakresu Main|rodzin produktów/i);
    expect(violation?.messagePl).not.toContain('Nie udało się zakończyć przeliczenia');
  });
});

describe('technical failure is not an eligibility failure (§22)', () => {
  it('an infeasible user-held Main is refused on recipe technique, never on Main role', () => {
    // Banana at 300 g in a −13 °C Sorbet may still be technically impossible
    // after the safe Main-priority search. PINGÜINO must say that in technical terms.
    const input = ownerSorbet([{ id: 'main-banana', mapperId: MAPPER.banana, grams: 300 }], -13);
    const result = preview(input, { 'main-banana': USER_HELD });
    const payload = JSON.stringify(result);
    expect(payload).not.toMatch(/nie jest zatwierdzony jako Main/);
    expect(payload).not.toMatch(/Brak zatwierdzonego zakresu Main/);
    expect(payload).not.toMatch(/nie jest składnikiem smakowym Main/);
    if (result.ok) {
      // A proposal may still exist; Crown identity survives while grams may move.
      expect(roleOf(result.preview.proposedInput, 'main-banana')).toBe('main');
      expect(gramsOf(result.preview.proposedInput, 'main-banana')).toBeGreaterThan(0);
    } else {
      // The refusal names recipe technique, not the ingredient's Main role.
      expect(result.code).toBe('unsafe_proposal');
    }
  });
});
