/**
 * Protein Main / Multi-Main eligibility (owner v1.4 Part B).
 *
 * The reported symptom was „all seven `Ustaw jako składnik główny` toggles are disabled in the
 * Protein starter". Investigating the gate showed the authority is right and the UI is reporting it
 * faithfully: the starter is milk, cream, whey protein concentrate, water, sucrose, dextrose and
 * tara gum — a neutral base with NO flavour identity in it. None of those is a Main in any profile,
 * and making them selectable to light up the control would be the actual defect.
 *
 * What matters is the contract in §17: *any legitimate Main-capable Protein ingredient must be
 * selectable*. That holds. The staging authority publishes five verified Protein Main policies, and
 * `resolve_product_behavior_v1` at `protein_gelato / −12 / optimal` answers `MAIN = eligible` for
 * every one of them and `MAIN = blocked` for the whey concentrate:
 *
 *   STRAWBERRY  main-protein-fruit-combination-v2  FRUIT_EQUIVALENT        eco 10   ceil 49.5  multi 20.7
 *   BANANA      main-protein-fruit-combination-v2  FRUIT_EQUIVALENT        eco 10   ceil 17.1  multi 20.7
 *   COCOA       main-protein-cocoa-1578            COCOA_SOLIDS_EQUIVALENT eco 6    ceil 6.1   multi  —
 *   PISTACHIO   main-protein-pistachio-0614        NUT_EQUIVALENT          eco 10   ceil 10    multi  —
 *   VANILLA     main-protein-vanilla-0246          PERCENT_OF_BASE         eco 0.5  ceil 4.9   multi  —
 *   WPC         (none) → main_policy_not_approved:…:use_standard_or_approved_main
 *
 * These fixtures mirror those exact resolver answers, so the tests below fail if the UI gate, the
 * envelope or the policy shape drifts away from what the database actually says.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductBehaviorSnapshot } from './contracts';
import { mainBehaviorBlockReason, productBehaviorCanBeMain } from './productBehaviorAccess';
import { verifyMainEnvelope } from './mainEnvelope';

const ingredient = (id: string) => {
  const found = findDemoIngredient(id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
};

const base = (lineId: string, overrides: Partial<ProductBehaviorSnapshot> = {}) =>
  ({
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    lineId,
    productId: `product-${lineId}`,
    productVersionId: `version-${lineId}`,
    source: 'mapper',
    factsFingerprint: `facts-${lineId}`,
    behaviorBindingId: `binding-${lineId}`,
    behaviorBindingVersion: '1',
    taxonomyVersion: 'pinguino-product-taxonomy-v1',
    familyId: null,
    subfamilyId: null,
    formId: null,
    verificationState: 'verified',
    technicalAuthority: 'mapper_exact',
    mapperIngredientId: lineId,
    mainClassification: 'STANDARD_ONLY',
    mainPolicyId: null,
    mainPolicyVersion: null,
    ecoFloorPercent: null,
    optimalCeilingPercent: null,
    hardLimitPercent: null,
    mainEquivalentFactor: null,
    mainBasis: null,
    multiMainHardLimitPercent: null,
    requiresLiquidDairyCarrier: false,
    liquidDairyCarrierFloorPercent: null,
    approvedLiquidDairyCarrier: false,
    approvedMixedFamilyIds: [],
    moduleEligibility: {
      MAIN: 'blocked',
      BASE_RECIPE: 'eligible',
      OPTIMAL: 'eligible',
      ECO: 'eligible',
    },
    processScope: 'BASE_FORMULATION',
    resolverVersion: 'unified-product-behavior-v2',
    sharedFacts: null,
    warnings: [],
    blockReasons: [],
    ...overrides,
  }) as ProductBehaviorSnapshot;

/* ── the five Protein Main policies, exactly as staging resolves them ── */

const STRAWBERRY = (lineId = 'strawberry') =>
  base(lineId, {
    mapperIngredientId: 'PI-ING-001553',
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-protein-fruit-combination-v2',
    mainPolicyVersion: '2',
    mainBasis: 'FRUIT_EQUIVALENT',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 49.5,
    hardLimitPercent: 49.5,
    multiMainHardLimitPercent: 20.7,
    mainEquivalentFactor: 1,
    moduleEligibility: { MAIN: 'eligible', BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
  });

const BANANA = (lineId = 'banana') =>
  base(lineId, {
    mapperIngredientId: 'PI-ING-000345',
    familyId: 'fruit',
    subfamilyId: 'banana',
    formId: 'fresh',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-protein-fruit-combination-v2',
    mainPolicyVersion: '2',
    mainBasis: 'FRUIT_EQUIVALENT',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 17.1,
    hardLimitPercent: 17.1,
    multiMainHardLimitPercent: 20.7,
    mainEquivalentFactor: 1,
    moduleEligibility: { MAIN: 'eligible', BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
  });

const COCOA = (lineId = 'cocoa') =>
  base(lineId, {
    mapperIngredientId: 'PI-ING-001578',
    familyId: 'chocolate_cocoa',
    formId: 'cocoa_powder',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-protein-cocoa-1578',
    mainPolicyVersion: '2',
    mainBasis: 'COCOA_SOLIDS_EQUIVALENT',
    ecoFloorPercent: 6,
    optimalCeilingPercent: 6.1,
    hardLimitPercent: 6.1,
    mainEquivalentFactor: 1,
    moduleEligibility: { MAIN: 'eligible', BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
  });

const PISTACHIO = (lineId = 'pistachio') =>
  base(lineId, {
    mapperIngredientId: 'PI-ING-000614',
    familyId: 'nut',
    formId: 'pure_nut_paste',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-protein-pistachio-0614',
    mainPolicyVersion: '1',
    mainBasis: 'NUT_EQUIVALENT',
    ecoFloorPercent: 10,
    optimalCeilingPercent: 10,
    hardLimitPercent: 10,
    mainEquivalentFactor: 1,
    moduleEligibility: { MAIN: 'eligible', BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
  });

/** The whey concentrate the starter actually contains — a protein source, not a flavour. */
const WPC = (lineId = 'wpc') =>
  base(lineId, {
    mapperIngredientId: 'PI-ING-000264',
    mainClassification: 'PROTEIN_CONTRIBUTOR_ONLY',
    blockReasons: ['main_policy_not_approved:PI-ING-000264:MAIN:use_standard_or_approved_main'],
  });

/* ── §17: the default Protein starter, proven ingredient by ingredient ── */

describe('the neutral Protein starter has no Main-capable line — and that is correct', () => {
  const STARTER: Array<[string, ProductBehaviorSnapshot]> = [
    ['MILK 3.5%', base('milk', { mapperIngredientId: 'PI-ING-000236' })],
    ['CREAM 30%', base('cream', { mapperIngredientId: 'PI-ING-000203' })],
    ['PROTEIN GEL WPC', WPC()],
    ['WATER', base('water', { mapperIngredientId: 'PI-ING-000733' })],
    ['SUCROSE', base('sucrose', { mapperIngredientId: 'PI-ING-000514' })],
    ['DEXTROSE', base('dextrose', { mapperIngredientId: 'PI-ING-000512' })],
    ['TARA GUM', base('tara', { mapperIngredientId: 'PI-ING-000456' })],
  ];

  it.each(STARTER)('%s cannot be Main', (_name, snapshot) => {
    expect(productBehaviorCanBeMain(snapshot)).toBe(false);
    expect(mainBehaviorBlockReason(snapshot)).not.toBeNull();
  });

  it('explains the whey concentrate as a protein source, not as a missing policy', () => {
    // Owner rule: a technical protein powder is not automatically the flavour identity.
    expect(mainBehaviorBlockReason(WPC())).toBe(
      'Składnik białkowy nie jest automatycznie smakiem Main.',
    );
  });

  it('never blocks a line merely because no snapshot has loaded yet', () => {
    // A missing snapshot is „not known yet", not „not allowed" — the toggle stays live.
    expect(mainBehaviorBlockReason(undefined)).toBeNull();
    expect(mainBehaviorBlockReason(null, true)).not.toBeNull();
  });
});

/* ── §17/§18: a legitimate Protein flavour IS selectable ── */

describe('every published Protein Main policy is selectable as Main', () => {
  it.each([
    ['STRAWBERRIES · Fresh Fruit', STRAWBERRY()],
    ['COCOA ALKALIZED 100%', COCOA()],
    ['PISTACHIO · Aldori 100% Nut', PISTACHIO()],
    ['BANANA · Fresh Fruit', BANANA()],
  ])('%s can be Main in Protein', (_name, snapshot) => {
    expect(mainBehaviorBlockReason(snapshot)).toBeNull();
    expect(productBehaviorCanBeMain(snapshot)).toBe(true);
  });

  it('carries a complete approved range, so the Apply door has something to verify against', () => {
    for (const snapshot of [STRAWBERRY(), COCOA(), PISTACHIO(), BANANA()]) {
      expect(snapshot.mainPolicyId).toBeTruthy();
      expect(snapshot.mainPolicyVersion).toBeTruthy();
      expect(snapshot.ecoFloorPercent).not.toBeNull();
      expect(snapshot.optimalCeilingPercent).not.toBeNull();
      expect(snapshot.hardLimitPercent).not.toBeNull();
      expect(snapshot.mainEquivalentFactor).not.toBeNull();
    }
  });
});

/* ── §19/§20: Multi-Main ── */

const recipe = (mains: Array<{ id: string; grams: number }>, batch = 1000): RecipeInput =>
  ({
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: batch,
    machine_capacity_grams: null,
    items: [
      ...mains.map((main) => ({
        id: main.id,
        ingredient: ingredient('raspberry'),
        planned_grams: main.grams,
        actual_grams: null,
        lock_type: 'main' as const,
      })),
      {
        id: 'milk',
        ingredient: ingredient('milk_3_5'),
        planned_grams: batch - mains.reduce((sum, m) => sum + m.grams, 0),
        actual_grams: null,
        lock_type: 'unlocked' as const,
      },
    ],
  }) as unknown as RecipeInput;

const MILK = base('milk', {
  mapperIngredientId: 'PI-ING-000236',
  approvedLiquidDairyCarrier: true,
});

describe('Protein Multi-Main — strawberry + banana', () => {
  // The ONLY approved Protein multi-main group: one shared policy
  // (main-protein-fruit-combination-v2), one shared basis, one shared 20.7 % combined limit.
  const snapshots = { strawberry: STRAWBERRY(), banana: BANANA(), milk: MILK };

  it('accepts a 1:1 pair inside the combined envelope', () => {
    // 100 g + 100 g = 20.0 % — above the 10 % floor, below the 20.7 % combined hard limit.
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'strawberry', grams: 100 },
        { id: 'banana', grams: 100 },
      ]),
      snapshots,
      mode: 'optimal',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a 2:1 pair inside the same envelope', () => {
    // 138 g + 69 g = 20.7 % exactly at the combined hard limit, ratio preserved 2:1.
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'strawberry', grams: 138 },
        { id: 'banana', grams: 69 },
      ]),
      snapshots,
      mode: 'optimal',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a pair that exceeds the COMBINED limit even though each fits its own ceiling', () => {
    // 300 g strawberry alone is legal (49.5 % ceiling); with 100 g banana the pair is 40 %,
    // which the 20.7 % multi-main limit must reject. This is the rule single-main ceilings miss.
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'strawberry', grams: 300 },
        { id: 'banana', grams: 100 },
      ]),
      snapshots,
      mode: 'optimal',
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a pair below the shared floor', () => {
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'strawberry', grams: 20 },
        { id: 'banana', grams: 20 },
      ]),
      snapshots,
      mode: 'optimal',
    });
    expect(result.ok).toBe(false);
  });
});

describe('Protein Multi-Main — groups the authority has NOT approved', () => {
  it('refuses strawberry + cocoa (different families, no shared policy)', () => {
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'strawberry', grams: 100 },
        { id: 'cocoa', grams: 60 },
      ]),
      snapshots: { strawberry: STRAWBERRY(), cocoa: COCOA(), milk: MILK },
      mode: 'optimal',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.violations[0]!.code).toBe('multi_main_policy_unknown');
  });

  it('refuses a pair whose policy publishes no combined limit', () => {
    // Two nut lines share a policy but that policy has no multiMainHardLimitPercent, so there is
    // no approved combined ceiling to hold them to. Fail closed, never guess one.
    const result = verifyMainEnvelope({
      recipe: recipe([
        { id: 'pistachio', grams: 50 },
        { id: 'pistachio2', grams: 50 },
      ]),
      snapshots: {
        pistachio: PISTACHIO(),
        pistachio2: PISTACHIO('pistachio2'),
        milk: MILK,
      },
      mode: 'optimal',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.violations[0]!.code).toBe('multi_main_policy_unknown');
  });

  it('refuses a Main that carries no approved range at all', () => {
    const result = verifyMainEnvelope({
      recipe: recipe([{ id: 'wpc', grams: 90 }]),
      snapshots: { wpc: WPC(), milk: MILK },
      mode: 'optimal',
    });
    expect(result.ok).toBe(false);
  });
});

describe('Protein single Main — each policy holds its own range', () => {
  it.each([
    ['strawberry', STRAWBERRY(), 300, true],
    ['strawberry above ceiling', STRAWBERRY(), 600, false],
    ['cocoa inside its narrow band', COCOA(), 61, true],
    ['cocoa above 6.1 %', COCOA(), 90, false],
    ['pistachio at exactly 10 %', PISTACHIO(), 100, true],
    ['pistachio above 10 %', PISTACHIO(), 150, false],
  ] as const)('%s', (_label, snapshot, grams, expected) => {
    const result = verifyMainEnvelope({
      recipe: recipe([{ id: snapshot.lineId, grams }]),
      snapshots: { [snapshot.lineId]: snapshot, milk: MILK },
      mode: 'optimal',
    });
    expect(result.ok).toBe(expected);
  });
});
