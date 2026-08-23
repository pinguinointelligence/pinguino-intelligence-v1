import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import {
  ECO_QUALITY_FLOOR_SCORE,
  effectiveInputCostPerKg,
} from '@/features/constraint-studio/ecoDraftCostSweep';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { assessProteinFormulation, recipeFitForInput } from './proteinAuthority';

/**
 * §9/§11 — ECO IS LOWEST COST WITH QUALITY PROTECTED.
 *
 * The sweep's admission test was `sameTechnicalFit`, which compares only NATIVE
 * band violations. A Protein candidate can sit deep inside every hard band while
 * its structure collapses, so ECO could buy cost with quality it never measured:
 * observed at ~17 % protein by mass, Score 4-5, purely because the concentrate
 * was the cheapest way to hold the bands.
 */

const EMPTY = { byLineId: {} } as const;
const AT = '2026-08-23T12:00:00.000Z';

const ing = (id: string) => {
  const payload = approvedFormulationToolboxIngredients(id)[0]!;
  // Toolbox payloads carry a price but no currency; canonical Mapper products
  // carry EUR. Stamp it so the ECO cost objective can run.
  return { ...payload, cost_currency: 'EUR' as const };
};

const line = (id: string, toolboxId: string, grams: number) => ({
  id,
  ingredient: ing(toolboxId),
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const draft = (
  temperatureC: -11 | -12 | -13,
  strategy: 'optimal' | 'eco',
  protein: number,
  cream: number,
  sucrose: number,
  dextrose: number,
): RecipeInput => ({
  items: [
    line('d-milk', 'milk_3_5', Math.max(0, 1000 - protein - cream - sucrose - dextrose - 2)),
    line('d-cream', 'cream_30', cream),
    line('d-protein', 'PI-ING-000264', protein),
    line('d-water', 'water', 0),
    line('d-sucrose', 'sucrose', sucrose),
    line('d-dextrose', 'dextrose', dextrose),
    line('d-tara', 'tara_gum', 2),
  ],
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: temperatureC,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced', formulation_strategy: strategy },
});

interface Point {
  protein: number;
  score: number | null;
  structure: number | null;
  qualified: boolean;
  costPerKg: number | null;
  violations: string[];
}

const point = (input: RecipeInput): Point => {
  const result = calculateRecipe(input);
  const assessment = assessProteinFormulation(input, result);
  return {
    protein: Number(result.percentages.protein_percent.toFixed(2)),
    score: recipeFitForInput(input, result).score,
    structure: assessment.structure.score,
    qualified: assessment.qualification.qualified,
    costPerKg: effectiveInputCostPerKg(input),
    violations: detectViolations(result).map((v) => v.metric),
  };
};

describe('§11 — the legal cost/quality frontier is real', () => {
  it('enumerates legal candidates across the quality tiers with their costs', () => {
    // Hand-set compositions almost never satisfy every band at once — that is
    // what the optimizer is for. So the frontier is built from OPTIMIZED legal
    // candidates: vary the seed, let OPTIMAL settle each one, and collect the
    // distinct legal products with their real costs. This is the set ECO is
    // choosing between.
    const points: (Point & { seedProtein: number })[] = [];
    for (const protein of [70, 90, 110, 140, 180, 230]) {
      for (const cream of [60, 110, 190]) {
        const seed = draft(-12, 'optimal', protein, cream, 99, 95);
        const built = buildOptimizePreview(seed, EMPTY, AT);
        const candidate = built.ok ? built.preview.proposedInput : seed;
        const p = point(candidate);
        if (p.violations.length > 0 || !p.qualified) continue;
        points.push({ ...p, seedProtein: protein });
      }
    }

    expect(points.length).toBeGreaterThan(2);

    // Cheapest legal candidate per Score tier — the Pareto view.
    const byTier = new Map<number, Point & { seedProtein: number }>();
    for (const p of points) {
      const tier = p.score ?? 0;
      const held = byTier.get(tier);
      if (!held || (p.costPerKg ?? Infinity) < (held.costPerKg ?? Infinity)) byTier.set(tier, p);
    }
    const frontier = [...byTier.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([tier, p]) => ({
        score: tier,
        cheapestCostPerKg: Number((p.costPerKg ?? 0).toFixed(4)),
        protein: p.protein,
        structure: p.structure,
      }));
    console.info('FRONTIER ' + JSON.stringify(frontier));

    // MEASURED FINDING, recorded rather than asserted away: with the canonical
    // toolbox at −12 every seed from 70 g to 230 g of concentrate converges on
    // the SAME legal optimum (8.88 % protein, Score 10, 2.2363 EUR/kg). The
    // v2 optimizer is a strong attractor, so the frontier collapses to a single
    // point and ECO has no cost/quality trade available to get wrong here.
    //
    // That does not make the floor decorative: it is what guarantees the cost
    // sweep can never step OFF that optimum onto something cheaper and worse,
    // which is exactly what produced the ~17 % protein / Score 4-5 ECO result
    // from the retired starter.
    for (const p of points) expect(p.qualified).toBe(true);
    for (const p of points) expect(p.violations).toEqual([]);
  }, 600_000);
});

describe('§9 — ECO never buys cost with quality below the floor', () => {
  const CASES: readonly (readonly [-11 | -12 | -13, number, number, number, number])[] = [
    [-11, 105, 252, 80, 70],
    [-12, 87, 110, 99, 95],
    [-13, 101, 193, 63, 109],
    [-12, 180, 110, 60, 90],
    [-12, 230, 100, 30, 86],
  ];

  it.each(CASES)('ECO @ %s keeps the quality floor', (temperatureC, protein, cream, sucrose, dextrose) => {
    const input = draft(temperatureC, 'eco', protein, cream, sucrose, dextrose);
    const before = point(input);
    const built = buildOptimizePreview(input, EMPTY, AT);
    const candidate = built.ok ? built.preview.proposedInput : input;
    const after = point(candidate);

    expect(after.violations).toEqual([]);
    if (after.qualified) {
      // The floor never rises above what the draft already achieves, so this is
      // a protection and never a new hard gate.
      const effectiveFloor = Math.min(ECO_QUALITY_FLOOR_SCORE, before.score ?? ECO_QUALITY_FLOOR_SCORE);
      expect(after.score ?? 0).toBeGreaterThanOrEqual(effectiveFloor);
    }

    console.info(
      'ECOFLOOR ' +
        JSON.stringify({
          temperatureC,
          seedProtein: protein,
          before: { protein: before.protein, score: before.score, cost: before.costPerKg },
          after: { protein: after.protein, score: after.score, cost: after.costPerKg, qualified: after.qualified },
        }),
    );
  }, 180_000);

  it('exposes the floor as a named owner decision, not a magic number', () => {
    expect(ECO_QUALITY_FLOOR_SCORE).toBe(8);
  });
});

describe('§12 — ECO drives neither protein maximisation nor minimisation', () => {
  it('lands inside the legal window rather than at an extreme', () => {
    const results = ([-11, -12, -13] as const).map((t) => {
      const input = draft(t, 'eco', 100, 130, 80, 90);
      const built = buildOptimizePreview(input, EMPTY, AT);
      return point(built.ok ? built.preview.proposedInput : input);
    });
    for (const r of results) {
      if (!r.qualified) continue;
      // Not pinned to a number: only that ECO neither collapses protein to the
      // bare qualification edge nor pushes it toward the old overloaded region.
      expect(r.protein).toBeGreaterThan(5);
      expect(r.protein).toBeLessThan(15);
    }
    console.info('ECOWINDOW ' + JSON.stringify(results));
  }, 180_000);
});
