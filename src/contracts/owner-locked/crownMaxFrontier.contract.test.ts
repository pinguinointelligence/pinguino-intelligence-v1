/**
 * GEL-P0-027 — CROWN MAX SEARCHES THE HARD SAFETY FRONTIER, PATH-INDEPENDENTLY
 *
 * OWNER CROWN SEMANTICS
 * ---------------------
 * CROWN ON  = maximize the Main / Main group as far as SAFELY possible.
 * CROWN OFF = the current/user grams are the anchor.
 *
 * Three published policy fields carry three different roles, proven by the
 * violation logic in `verifyMainEnvelope`:
 *
 *   eco_floor_percent        Main sensory MINIMUM, enforced in both modes.
 *   optimal_ceiling_percent  OPTIMAL preference TARGET. Its violation was
 *                            mode-scoped; it is not a safety boundary.
 *   hard_limit_percent       The absolute SAFETY boundary, enforced in both
 *                            modes and never suppressed.
 *
 * The served defect (owner QA, 2026-08-31, saved recipe `CROWN-391`, 670 g
 * Gelato / Ninja CREAMi Deluxe / OPTIMAL / STRAWBERRIES):
 *
 *   v1  Crown ON   STRAWBERRIES 214 g  (31.9%)   MILK 3.5% 201 g = 30.00%
 *   v2  Crown OFF  STRAWBERRIES 300 g  (44.8%)
 *   v3  Crown OFF  STRAWBERRIES 391 g  (58.4%)
 *
 * Crown ON — the explicit MAX mode — produced the SMALLEST Main, because the
 * search frontier was the OPTIMAL preference target (35%) instead of the hard
 * safety limit (45%). Worse, when the descending sweep found no admissible
 * candidate the objective returned its own input unchanged and relabelled the
 * incoming grams as the accepted maximum, so the "maximum" was whatever Crown
 * happened to start from:
 *
 *   start 1 → 1 · 168 → 168 · 214 → 214 · 234 → 234 · 300 → 300 · 450 → 450
 *
 * This contract locks the corrected semantics. It must not be relaxed to make
 * a failing search pass; an empty sweep is a refusal, never an echo.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  mainEnvelopeSearchCeilingGrams,
  mainEnvelopeSearchFloorGrams,
  verifyMainEnvelope,
} from '@/features/product-intelligence/mainEnvelope';
import { resolveMainCapability } from '@/features/product-intelligence/mainCapability';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

/** The published `main-berry-fresh-dairy` v2 envelope for milk_gelato. */
const POLICY = {
  ecoFloorPercent: 25,
  optimalCeilingPercent: 35,
  hardLimitPercent: 45,
  liquidDairyCarrierFloorPercent: 30,
} as const;
const BATCH = 670;
const HARD_FRONTIER_G = (BATCH * POLICY.hardLimitPercent) / 100; // 301.5
const PREFERENCE_G = (BATCH * POLICY.optimalCeilingPercent) / 100; // 234.5
const FLOOR_G = (BATCH * POLICY.ecoFloorPercent) / 100; // 167.5

const snapshot = (over: Partial<ProductBehaviorSnapshot> = {}): ProductBehaviorSnapshot =>
  ({
    lineId: 'straw',
    resolutionState: 'RESOLVED',
    processScope: 'BASE_FORMULATION',
    moduleEligibility: { BASE_RECIPE: 'eligible', OPTIMAL: 'eligible', ECO: 'eligible' },
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-berry-fresh-dairy',
    mainPolicyVersion: '2',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    requiresLiquidDairyCarrier: true,
    approvedLiquidDairyCarrier: false,
    multiMainHardLimitPercent: POLICY.hardLimitPercent,
    ...POLICY,
    ...over,
  }) as unknown as ProductBehaviorSnapshot;

/** `approvedLiquidDairyCarrier` is a per-product Mapper approval. In staging
 *  only MILK 3.5% (`PI-ING-000236`) carries it; CREAM 30% and SKIMMED MILK do
 *  not, which is why the served v1 drove MILK to exactly 201 g = 30.00%. */
const supportSnapshot = (lineId: string, approvedCarrier: boolean): ProductBehaviorSnapshot =>
  snapshot({
    lineId,
    mainCapability: 'MAIN_TECHNICAL_BLOCKED',
    behaviorRole: 'STANDARD_ONLY',
    mainClassification: 'STANDARD_ONLY',
    approvedLiquidDairyCarrier: approvedCarrier,
    requiresLiquidDairyCarrier: false,
  } as Partial<ProductBehaviorSnapshot>);

/** Served v1 shape: Main + approved carrier + support, summing to the batch. */
const recipeAt = (mainGrams: number, carrierGrams: number): RecipeInput =>
  ({
    category: 'milk_gelato',
    target_batch_grams: BATCH,
    goals: { formulation_strategy: 'optimal' },
    items: [
      { id: 'straw', planned_grams: mainGrams, lock_type: 'main', actual_grams: null,
        ingredient: { id: 'PI-ING-001553', name: 'STRAWBERRIES', category: 'fruit' } },
      { id: 'milk', planned_grams: carrierGrams, lock_type: 'unlocked', actual_grams: null,
        ingredient: { id: 'PI-ING-000236', name: 'MILK 3.5%', category: 'dairy' } },
      { id: 'rest', planned_grams: BATCH - mainGrams - carrierGrams, lock_type: 'unlocked',
        actual_grams: null,
        ingredient: { id: 'PI-ING-000494', name: 'DEXTROSE', category: 'sugar' } },
    ],
  }) as unknown as RecipeInput;

const snapshots = () => ({
  straw: snapshot(),
  milk: supportSnapshot('milk', true),
  rest: supportSnapshot('rest', false),
});

describe('GEL-P0-027 Crown MAX frontier', () => {
  // ---- B. HARD FRONTIER -----------------------------------------------------
  it('derives the Crown search frontier from hard_limit_percent, not the preference', () => {
    const ceiling = mainEnvelopeSearchCeilingGrams({
      recipe: recipeAt(214, 201),
      snapshots: snapshots(),
    });
    expect(ceiling).toBeCloseTo(HARD_FRONTIER_G, 6);
    expect(ceiling).not.toBeCloseTo(PREFERENCE_G, 6);
  });

  it('derives the same frontier regardless of the current Main grams', () => {
    const frontiers = [1, 100, 168, 214, 234, 300, 450].map((g) =>
      mainEnvelopeSearchCeilingGrams({
        recipe: recipeAt(g, Math.min(201, BATCH - g)),
        snapshots: snapshots(),
      }),
    );
    expect(new Set(frontiers.map((f) => f?.toFixed(6)))).toEqual(
      new Set([HARD_FRONTIER_G.toFixed(6)]),
    );
  });

  it('keeps the published Main floor unchanged', () => {
    expect(
      mainEnvelopeSearchFloorGrams({ recipe: recipeAt(214, 201), snapshots: snapshots() }),
    ).toBeCloseTo(FLOOR_G, 6);
  });

  // ---- C. OPTIMAL PREFERENCE OVERRIDE --------------------------------------
  it('lets an active Crown cross the OPTIMAL preference target', () => {
    // 250 g = 37.3% — above the 35% preference target, below the 45% hard limit.
    expect(
      verifyMainEnvelope({ recipe: recipeAt(250, 201), snapshots: snapshots(), mode: 'optimal' }).ok,
    ).toBe(true);
  });

  it('still blocks an active Crown at the hard safety limit', () => {
    // 310 g = 46.3% — above the hard limit; must fail closed in BOTH modes.
    for (const mode of ['optimal', 'eco'] as const) {
      expect(
        verifyMainEnvelope({ recipe: recipeAt(310, 201), snapshots: snapshots(), mode }),
      ).toMatchObject({
        ok: false,
        violations: expect.arrayContaining([
          expect.objectContaining({ code: 'main_above_hard_limit' }),
        ]),
      });
    }
  });

  it('keeps the preference boundary available to an explicit opt-in caller', () => {
    expect(
      verifyMainEnvelope({
        recipe: recipeAt(250, 201),
        snapshots: snapshots(),
        mode: 'optimal',
        enforceOptimalPreferenceCeiling: true,
      }),
    ).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ code: 'main_above_optimal_ceiling' }),
      ]),
    });
  });

  // ---- carrier stays enforceable -------------------------------------------
  it('still blocks when the approved liquid dairy carrier is below its floor', () => {
    // MILK 3.5% is the only approved carrier; 100 g = 14.9% < 30%.
    expect(
      verifyMainEnvelope({ recipe: recipeAt(250, 100), snapshots: snapshots(), mode: 'optimal' }),
    ).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ code: 'liquid_dairy_carrier_below_floor' }),
      ]),
    });
  });

  // ---- 5. USER-HELD CARVE-OUT CANNOT BE REACHED BY AN ANCHOR ---------------
  it('never turns a calibrated Crown into a user-held envelope bypass', () => {
    const calibrated = resolveMainCapability({ snapshot: snapshot(), snapshotRequired: true });
    expect(calibrated.state).toBe('MAIN_CAPABLE');
    expect(calibrated.userHeld).toBe(false);

    // A stale user anchor is not a calibration fact and must not disable the
    // envelope: the hard limit and the carrier rule stay enforceable.
    const anchored = recipeAt(310, 100) as unknown as {
      items: { id: string; user_intent_anchor_grams?: number }[];
    };
    anchored.items[0]!.user_intent_anchor_grams = 450;
    const verdict = verifyMainEnvelope({
      recipe: anchored as unknown as RecipeInput,
      snapshots: snapshots(),
      mode: 'optimal',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      const codes = verdict.violations.map((v) => v.code);
      expect(codes).toContain('main_above_hard_limit');
      expect(codes).toContain('liquid_dairy_carrier_below_floor');
    }
  });
});
