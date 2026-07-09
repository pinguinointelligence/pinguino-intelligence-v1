/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  previewBatchRescueRecalculation,
  previewStockShortageRecalculation,
} from './branchRecalculationPreview';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type BatchRescueScenario,
  type StockShortageScenario,
} from './branchRecalculationFixtures';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '..', '..', '..');

const scenario = <T extends { id: string }>(id: string): T =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === id)! as unknown as T;

const rescue = (id: string) => {
  const s = scenario<BatchRescueScenario>(id);
  return previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
};
const shortage = (id: string) => {
  const s = scenario<StockShortageScenario>(id);
  return previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
};

describe('IF9 exact preview — add-only rescue solve, verified or nothing', () => {
  it('feasible too-hard rescue ATTEMPTS the real solve and reports the engine verdict honestly', () => {
    const r = rescue('rescue-too-hard-12');
    expect(r.routeDecision).toBe('rescue_with_tradeoff');
    // The REAL solver ran, aimed at the regulator −12 band (Slice 14 override)…
    expect(r.trace.solverInvoked).toBe(true);
    expect(r.trace.targetOverrideActive).toBe(true);
    // …and its Golden-Middle verification REJECTED a single-shot addition for this
    // large npac gap (the per-water NPAC moves further than the solver's per-batch
    // model, overshooting the band). The honest outcome is no-grams — never a
    // forced or fabricated correction.
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('solver_found_no_safe_add_only_correction');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('exact grams appear ONLY on a calculated status, and are always add-only positives', () => {
    for (const s of BRANCH_RECALCULATION_SCENARIOS.filter((x): x is BatchRescueScenario => x.kind === 'batch_rescue')) {
      const r = previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
      if (r.exactStatus !== 'calculated') {
        expect(r.exactActions).toEqual([]);
        expect(r.proposedRecipeSnapshot).toBeNull();
      } else {
        expect(r.exactActions.length).toBeGreaterThan(0);
        for (const a of r.exactActions) {
          expect(a.type).toBe('add');
          expect(a.grams).toBeGreaterThan(0);
        }
        expect(['optimized', 'tradeoff']).toContain(r.rerun!.decision);
      }
    }
  });

  it('frozen batch without reprocessing never calculates fake grams', () => {
    const r = rescue('rescue-frozen-no-reprocess');
    expect(r.routeDecision).toBe('reprocess_required');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('reprocess_required_no_addition_grams');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
    expect(r.trace.solverInvoked).toBe(false);
  });

  it('food-safety concern is unsafe — the solver is never invoked', () => {
    const r = rescue('rescue-food-safety');
    expect(r.routeDecision).toBe('discard_or_rebatch');
    expect(r.exactStatus).toBe('unsafe');
    expect(r.exactActions).toEqual([]);
    expect(r.trace.solverInvoked).toBe(false);
  });

  it('outstanding physical measurements (icy) block the exact solve', () => {
    const r = rescue('rescue-icy');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('physical_measurements_required_first');
    expect(r.exactActions).toEqual([]);
  });

  it('temperature adjustment is non-compositional — no grams, the action is the answer', () => {
    const r = rescue('rescue-temp-mismatch');
    expect(r.routeDecision).toBe('rescue_possible');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('non_compositional_action');
  });

  it('missing batch size blocks before anything is calculated', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const r = previewBatchRescueRecalculation({
      rescueIntent: { ...s.rescueIntent, batchSizeG: null },
      actualRecipe: s.actualRecipe,
    });
    expect(r.exactStatus).toBe('blocked_missing_data');
    expect(r.exactActions).toEqual([]);
  });

  it('a rescue whose rerun shows no genuine improvement exposes NO grams (verification_failed path)', () => {
    // too_soft on a batch whose npac is BELOW the −12 band: the "decrease npac" solve
    // has no npac_high violation → solver finds nothing → not_attempted (honest);
    // this also proves no grams are fabricated when the observation contradicts the data.
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const r = previewBatchRescueRecalculation({
      rescueIntent: { ...s.rescueIntent, observation: { problem: 'too_soft' } },
      actualRecipe: s.actualRecipe,
    });
    expect(['not_attempted', 'verification_failed']).toContain(r.exactStatus);
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('never mutates the actual recipe or the rescue intent', () => {
    const s = scenario<BatchRescueScenario>('rescue-too-hard-12');
    const recipeSnapshot = JSON.stringify(s.actualRecipe);
    const intentSnapshot = JSON.stringify(s.rescueIntent);
    previewBatchRescueRecalculation({ rescueIntent: s.rescueIntent, actualRecipe: s.actualRecipe });
    expect(JSON.stringify(s.actualRecipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(s.rescueIntent)).toBe(intentSnapshot);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(rescue('rescue-too-hard-12'))).toBe(JSON.stringify(rescue('rescue-too-hard-12')));
  });
});

describe('IF10 exact preview — deterministic scale-down, verified or nothing', () => {
  it('scale-down produces the verified scaled snapshot with the exact ratio', () => {
    const r = shortage('shortage-scale-down');
    expect(r.routeDecision).toBe('scale_down_possible');
    expect(r.exactStatus).toBe('calculated');
    expect(r.scaleFactor).toBeCloseTo(0.72, 5);
    expect(r.scaleVerified).toBe(true);
    expect(r.proposedRecipeSnapshot).not.toBeNull();
    const scaled = r.proposedRecipeSnapshot as { target_batch_grams: number; items: { planned_grams: number }[] };
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    expect(scaled.target_batch_grams).toBeCloseTo(s.plannedRecipe.target_batch_grams * 0.72, 6);
    expect(scaled.items[0]!.planned_grams).toBeCloseTo(s.plannedRecipe.items[0]!.planned_grams * 0.72, 6);
    // ratio metrics preserved under uniform scaling
    expect(Math.abs(r.afterMetrics!.npac - r.beforeMetrics!.npac)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.afterMetrics!.pod - r.beforeMetrics!.pod)).toBeLessThanOrEqual(0.05);
  });

  it('an unsafe (dairy-into-sorbet) substitute is unsafe — never calculated', () => {
    const r = shortage('shortage-dairy-substitute');
    expect(r.routeDecision).toBe('production_blocked');
    expect(r.exactStatus).toBe('unsafe');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('missing stock quantities block', () => {
    const r = shortage('shortage-missing-quantities');
    expect(r.exactStatus).toBe('blocked_missing_data');
  });

  it('duplicate line ids block (router regression carried through)', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const dup = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          { lineId: 'x', ingredientName: 'A', requiredG: 100, availableG: 50 },
          { lineId: 'x', ingredientName: 'B', requiredG: 100, availableG: 50 },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: dup, plannedRecipe: s.plannedRecipe });
    expect(r.exactStatus).toBe('blocked_missing_data');
    expect(r.exactStatusReason).toBe('duplicate_line_ids');
  });

  it('an unverified substitute never reaches an exact solve', () => {
    const s = scenario<StockShortageScenario>('shortage-dairy-substitute');
    const unverified = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          {
            lineId: 'strawberry',
            ingredientName: 'Strawberry',
            correctionFamily: 'fruit' as const,
            requiredG: 600,
            availableG: 0,
            substitute: { ingredientName: 'Mystery puree', available: true, hasVerifiedIngredientData: false, correctionFamily: 'fruit' as const },
          },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: unverified, plannedRecipe: s.plannedRecipe });
    expect(r.exactStatus).toBe('unsafe'); // substitute_data_not_verified is a safety block
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('a viable substitution is honestly not_attempted (composition not in the v0.1 contract)', () => {
    const s = scenario<StockShortageScenario>('shortage-dairy-substitute');
    const viable = {
      ...s.shortageIntent,
      observation: {
        shortages: [
          {
            lineId: 'strawberry',
            ingredientName: 'Strawberry',
            correctionFamily: 'fruit' as const,
            requiredG: 600,
            availableG: 0,
            substitute: { ingredientName: 'Raspberry puree', available: true, hasVerifiedIngredientData: true, correctionFamily: 'fruit' as const },
          },
        ],
      },
    };
    const r = previewStockShortageRecalculation({ shortageIntent: viable, plannedRecipe: s.plannedRecipe });
    expect(r.routeDecision).toBe('substitution_possible');
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('substitute_composition_not_in_contract_v01');
    expect(r.exactActions).toEqual([]);
  });

  it('a recipe carrying actual grams is refused — that is IF9 territory', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const withActuals = {
      ...s.plannedRecipe,
      items: s.plannedRecipe.items.map((i, idx) => (idx === 0 ? { ...i, actual_grams: 100 } : i)),
    };
    const r = previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: withActuals });
    expect(r.exactStatus).toBe('not_attempted');
    expect(r.exactStatusReason).toBe('actual_batch_present_use_batch_rescue');
  });

  it('never mutates the planned recipe or the shortage intent', () => {
    const s = scenario<StockShortageScenario>('shortage-scale-down');
    const recipeSnapshot = JSON.stringify(s.plannedRecipe);
    const intentSnapshot = JSON.stringify(s.shortageIntent);
    previewStockShortageRecalculation({ shortageIntent: s.shortageIntent, plannedRecipe: s.plannedRecipe });
    expect(JSON.stringify(s.plannedRecipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(s.shortageIntent)).toBe(intentSnapshot);
  });
});

describe('branchRecalculationPreview — boundary (preview only, no writes anywhere)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = ['branchRecalculationPreview.ts', 'branchRecalculationFixtures.ts'].map((f) =>
    strip(readFileSync(join(HERE, f), 'utf8')),
  );

  it('engine only via the public barrel; no DB / Mapper / services / inventory', () => {
    for (const src of sources) {
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
      expect(/@\/services\/|@\/lib\/|@\/data\/products|mapper_basement|service_role/i.test(src)).toBe(false);
      expect(/writeInventory|updateStock|decrementStock/i.test(src)).toBe(false);
    }
  });

  it('no write verbs, no save path, no product PAC/POD or status writes', () => {
    for (const src of sources) {
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
      expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(src)).toBe(false);
    }
  });

  it('accepted-correction migration is STILL not applied (no such file under supabase/migrations)', () => {
    const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'));
    expect(migrations.some((f) => /accepted_correction/i.test(f))).toBe(false);
    expect(existsSync(join(ROOT, 'docs', 'spine', 'proposals', 'accepted_corrections_table.proposal.sql'))).toBe(true);
  });
});
