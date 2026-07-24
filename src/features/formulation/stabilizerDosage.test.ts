/**
 * FAILURE 3 — TARA 5 g FORENSIC AUDIT (owner Phases 7–10, NIGHTLY).
 *
 * Pins the approved-dosage wiring (Mapper 0.2–1 % of total mix →
 * formulation-layer safety bounds), the pure-gum vs blend identity rule
 * (test 17: non-interchange), explicit units on every dosage field, bounds
 * violation detection (test 19), the Phase 10 tara-sweep diagnostic on the
 * exact owner fixture, and that ENGINE SCIENCE IS UNCHANGED (test 20).
 *
 * Honest limit (BLOCKED_SCIENCE, ledger): the Engine has NO stabilizer-
 * activity metric/band — moving tara produces no engine-verified gradient, so
 * the dose is NOT optimized; the template-controlled seed stays, bounds act as
 * clamps + diagnostics only.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  CONFIG_VERSION,
  detectViolations,
  ENGINE_VERSION,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { strawberrySurrogate } from '@/qa/engine-validation/fixtures';
import {
  approvedStabilizerDosage,
  approvedStabilizerDosageOfKind,
  assessStabilizerDosage,
  stabilizerDosageWindowGrams,
  violatesApprovedStabilizerDosage,
} from './stabilizerDosage';

/** The exact owner fixture: 350/380/80/40/110/35/tara (fruit_gelato −11). */
const fruitFixture = (taraGrams: number): RecipeInput => ({
  mode: 'classic',
  category: 'fruit_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items: [
    { id: 'l-straw', ingredient: strawberrySurrogate(), planned_grams: 350, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-milk', ingredient: findDemoIngredient('milk_3_5')!, planned_grams: 380, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-cream', ingredient: findDemoIngredient('cream_30')!, planned_grams: 80, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-smp', ingredient: findDemoIngredient('smp')!, planned_grams: 40, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-suc', ingredient: findDemoIngredient('sucrose')!, planned_grams: 110, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-dex', ingredient: findDemoIngredient('dextrose')!, planned_grams: 35, actual_grams: null, lock_type: 'unlocked' },
    { id: 'l-tara', ingredient: findDemoIngredient('tara_gum')!, planned_grams: taraGrams, actual_grams: null, lock_type: 'unlocked' },
  ],
});

describe('approved dosage identity (staging-verified PI-ING-000492)', () => {
  it('tara resolves by EXACT identity under both the engine id and the Mapper id', () => {
    for (const id of ['tara_gum', 'PI-ING-000492']) {
      const entry = approvedStabilizerDosage(id)!;
      expect(entry.mapperId).toBe('PI-ING-000492');
      expect(entry.kind).toBe('pure_gum');
      expect(entry.minPercentOfTotalMix).toBe(0.2);
      expect(entry.maxPercentOfTotalMix).toBe(1);
    }
  });

  it('an unregistered ingredient has NO approved window — no fallback of any kind', () => {
    expect(approvedStabilizerDosage('inulin')).toBeNull();
    expect(approvedStabilizerDosage('sucrose')).toBeNull();
    expect(approvedStabilizerDosage('PI-ING-999999')).toBeNull();
  });

  it('pure-gum vs blend NEVER interchange (test 17)', () => {
    // The blend row (PI-ING-000490) can never resolve as pure gum…
    expect(approvedStabilizerDosageOfKind('PI-ING-000490', 'pure_gum')).toBeNull();
    // …and the pure-gum row can never resolve as a blend.
    expect(approvedStabilizerDosageOfKind('PI-ING-000492', 'stabilizer_blend')).toBeNull();
    expect(approvedStabilizerDosageOfKind('tara_gum', 'stabilizer_blend')).toBeNull();
    // Each identity resolves ONLY under its own kind.
    expect(approvedStabilizerDosageOfKind('PI-ING-000492', 'pure_gum')?.mapperId).toBe('PI-ING-000492');
    expect(approvedStabilizerDosageOfKind('PI-ING-000490', 'stabilizer_blend')?.mapperId).toBe('PI-ING-000490');
  });

  it('every dosage field carries an EXPLICIT unit (test 15)', () => {
    const entry = approvedStabilizerDosage('tara_gum')!;
    expect(entry.unit).toBe('percent_of_total_mix');
    const window = stabilizerDosageWindowGrams(entry, 1000);
    expect(window.unit).toBe('grams');
    expect(window.minGrams).toBeCloseTo(2, 10); // 0.2 % of 1000 g
    expect(window.maxGrams).toBeCloseTo(10, 10); // 1 % of 1000 g
    const assessment = assessStabilizerDosage(fruitFixture(5))[0]!;
    expect(assessment.unitGrams).toBe('grams');
    expect(assessment.unitPercent).toBe('percent_of_total_mix');
  });
});

describe('bounds violations are DETECTED (test 19)', () => {
  it('5 g on the 1000 g fixture = 0.50 % — within the approved window', () => {
    const [tara] = assessStabilizerDosage(fruitFixture(5));
    expect(tara!.ingredientId).toBe('tara_gum');
    expect(tara!.grams).toBe(5);
    expect(tara!.percentOfTotalMix).toBeCloseTo(0.5, 4);
    expect(tara!.status).toBe('within_window');
  });

  it('1.4 g ≈ 0.14 % — BELOW the approved window (the MyGelato-copy dose)', () => {
    const [tara] = assessStabilizerDosage(fruitFixture(1.4));
    expect(tara!.percentOfTotalMix!).toBeLessThan(0.2);
    expect(tara!.status).toBe('below_window');
  });

  it('12 g ≈ 1.19 % — ABOVE the approved window', () => {
    const [tara] = assessStabilizerDosage(fruitFixture(12));
    expect(tara!.percentOfTotalMix!).toBeGreaterThan(1);
    expect(tara!.status).toBe('above_window');
  });

  it('a stabilizer with no registered identity reports no_approved_window — never a borrowed one', () => {
    const input = fruitFixture(5);
    input.items.push({
      id: 'l-blend',
      ingredient: {
        ...findDemoIngredient('tara_gum')!,
        id: 'unknown_blend_x',
        name: 'Unknown Stabilizer Blend',
      },
      planned_grams: 5,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    const blend = assessStabilizerDosage(input).find((a) => a.ingredientId === 'unknown_blend_x')!;
    expect(blend.status).toBe('no_approved_window');
    expect(blend.window).toBeNull();
  });
});

describe('the safety clamp on solver actions (Phase 9 wiring)', () => {
  it('an ADD pushing tara above 1 % of the mix is rejected', () => {
    const input = fruitFixture(5); // 5 g / 1000 g = 0.5 %
    expect(
      violatesApprovedStabilizerDosage(input, { type: 'add', ingredient_id: 'tara_gum', grams: 8 }),
    ).toBe(true); // 13 g / 1008 g ≈ 1.29 % > 1 %
    expect(
      violatesApprovedStabilizerDosage(input, { type: 'add', ingredient_id: 'tara_gum', grams: 2 }),
    ).toBe(false); // 7 g / 1002 g ≈ 0.70 % — still inside
  });

  it('a REDUCE cutting tara below 0.2 % of the mix is rejected', () => {
    const input = fruitFixture(5);
    expect(
      violatesApprovedStabilizerDosage(input, { type: 'reduce', ingredient_id: 'tara_gum', grams: 4 }),
    ).toBe(true); // 1 g / 996 g ≈ 0.10 % < 0.2 %
    expect(
      violatesApprovedStabilizerDosage(input, { type: 'reduce', ingredient_id: 'tara_gum', grams: 1 }),
    ).toBe(false); // 4 g / 999 g ≈ 0.40 %
  });

  it('actions on unregistered ingredients are never touched by the clamp', () => {
    const input = fruitFixture(5);
    expect(
      violatesApprovedStabilizerDosage(input, { type: 'add', ingredient_id: 'sucrose', grams: 500 }),
    ).toBe(false);
  });
});

describe('PHASE 10 — tara sweep diagnostic on the exact owner fixture (5.0/2.1/1.9/1.7/1.4 g)', () => {
  it('pins the engine outputs per variant — proving the engine has NO stabilizer-activity response', () => {
    const sweep = [5.0, 2.1, 1.9, 1.7, 1.4].map((tara) => {
      const result = calculateRecipe(fruitFixture(tara));
      const violations = detectViolations(result);
      const npac = result.indicators.find((i) => i.key === 'npac')!;
      return {
        tara,
        pod: result.pod_points!,
        pac: result.pac_points!,
        npac: result.npac_points!,
        ice: result.ice_fraction_percent!,
        water_g: result.totals.water_g,
        solids_g: result.totals.solids_g,
        fat_g: result.totals.fat_g,
        protein_g: result.totals.protein_g,
        lactose_g: result.totals.lactose_g,
        overall: result.scores!.overall,
        bandSource: npac.category_fallback ? 'category_fallback' : 'native',
        violations: violations.map((v) => v.metric),
      };
    });

    // Pinned values (diagnostic — the full table lives in the ledger).
    expect(sweep[0]).toMatchObject({ tara: 5 });
    expect(sweep[0]!.pod).toBeCloseTo(16.0209, 3);
    expect(sweep[0]!.npac).toBeCloseTo(36.6001, 3);
    expect(sweep[0]!.ice).toBeCloseTo(50.6999, 3);
    expect(sweep[0]!.violations).toEqual(['fat']);
    expect(sweep[4]!.pod).toBeCloseTo(16.0788, 3);
    expect(sweep[4]!.violations).toEqual(['total_solids', 'fat']);

    // THE Phase 10 conclusion, asserted structurally: across a 3.6 g dose
    // change (0.14→0.50 % of mix) POD/PAC/NPAC/ice move by less than 0.1 —
    // tara registers ONLY as generic water/solids/fiber mass (POD 0 / PAC 0),
    // and NO violation ever names a stabilizer-specific metric. The engine
    // does NOT detect excessive or deficient stabilizer as such.
    for (const row of sweep) {
      expect(Math.abs(row.pod - sweep[0]!.pod)).toBeLessThan(0.1);
      expect(Math.abs(row.npac - sweep[0]!.npac)).toBeLessThan(0.1);
      expect(Math.abs(row.ice - sweep[0]!.ice)).toBeLessThan(0.1);
      expect(row.fat_g).toBeCloseTo(sweep[0]!.fat_g, 6); // tara carries no fat
      expect(row.bandSource).toBe('category_fallback'); // provisional profile
      for (const metric of row.violations) {
        expect(['fat', 'total_solids']).toContain(metric); // never a stabilizer metric
      }
    }
  });
});

describe('ENGINE SCIENCE UNCHANGED (test 20)', () => {
  it('engine/config versions and the B1 reference outputs are byte-identical to the Agent B ledger', () => {
    expect(ENGINE_VERSION).toBe('0.4.0');
    expect(CONFIG_VERSION).toBe('0.7.0');
    const result = calculateRecipe(fruitFixture(5)); // = fixture B1
    expect(result.pod_points!).toBeCloseTo(16.0209, 4);
    expect(result.pac_points!).toBeCloseTo(24.212, 4);
    expect(result.npac_points!).toBeCloseTo(36.6001, 4);
    expect(result.ice_fraction_percent!).toBeCloseTo(50.6999, 4);
    expect(result.totals.water_g).toBeCloseTo(689.02, 2);
    expect(result.totals.solids_g).toBeCloseTo(310.98, 2);
    expect(result.scores!.overall).toBeCloseTo(82.1399, 4);
    // The tara row the engine consumes is still the PURE gum profile.
    const tara = findDemoIngredient('tara_gum')!;
    expect(tara.composition.fiber_percent).toBe(80);
    expect(tara.pod_value).toBeNull();
    expect(tara.pac_value).toBeNull();
  });
});
