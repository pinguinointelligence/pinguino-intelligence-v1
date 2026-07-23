/**
 * PRO TEMPERATURE ROUTING AND LOCK DIAGNOSIS — owner P0 contract.
 *
 * Proves, with the REAL canonical solver pipeline (no Demo Scenario presets — recipes are built
 * from the raw ingredient catalog):
 *  - a clean, no-lock recipe recalculates successfully at −11, −12 AND −13, and each temperature
 *    produces a DIFFERENT verified proposal (the solver aims at that temperature's band cell);
 *  - one locked ingredient is preserved by exactly 0.0 g while others may change;
 *  - all-locked recipes are classified with the explicit all-locked message — never a generic
 *    impossibility;
 *  - a failure with ZERO locks is never labelled a lock conflict;
 *  - poured actuals (§15 rescue) are surfaced as the immutable lines they are (the owner's real
 *    v5 recipe shape: Cream 30 % with actual_grams=150 + lock_type 'grams');
 *  - a failed recalculation mutates nothing.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput, RecipeItem } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildOptimizePreview } from './applyPipeline';
import { constraintStudioCopy } from './constraintStudioCopy';
import {
  buildLockReport,
  diagnoseRecalcFailure,
  isAllLocked,
} from './recalcDiagnosis';

const NOW = '2026-07-22T00:00:00.000Z';

const line = (
  id: string,
  ing: string,
  grams: number,
  lock: RecipeItem['lock_type'] = 'unlocked',
  actual: number | null = null,
): RecipeItem => ({
  id,
  ingredient: findDemoIngredient(ing)!,
  planned_grams: grams,
  actual_grams: actual,
  lock_type: lock,
});

const input = (temp: number, items: RecipeItem[]): RecipeInput => ({
  items,
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: temp,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
});

/** A clean canonical base (raw catalog ingredients — NOT a Demo Scenario preset). */
const cleanBase = () => [
  line('l-milk', 'milk_3_5', 700),
  line('l-cream', 'cream_30', 100),
  line('l-smp', 'smp', 50),
  line('l-suc', 'sucrose', 100),
  line('l-dex', 'dextrose', 20),
  line('l-tara', 'tara_gum', 5),
];

const NO_CONSTRAINTS = { byLineId: {} };

describe('Phase 4 — no-lock recalculation at every professional temperature', () => {
  it.each([-11, -12, -13])('temperature %d: real preview, solver aims at that band cell', (temp) => {
    const result = buildOptimizePreview(input(temp, cleanBase()), NO_CONSTRAINTS, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.lines.length).toBeGreaterThan(0);
    expect(result.preview.violationsAfter).toBeLessThan(result.preview.violationsBefore);
  });

  it('−11, −12 and −13 produce DIFFERENT proposals (temperature-aware targeting, one shared route)', () => {
    // Owner P0 (recalc duplication): the solver's dextrose addition now UPDATES
    // the existing dextrose line (canonical identity merge) instead of adding a
    // parallel row — so the temperature-distinct amounts land on 'l-dex'.
    const dextroseAfter = [-11, -12, -13].map((temp) => {
      const result = buildOptimizePreview(input(temp, cleanBase()), NO_CONSTRAINTS, NOW);
      if (!result.ok) throw new Error(`preview failed at ${temp}`);
      expect(result.preview.lines.every((l) => l.kind !== 'added')).toBe(true); // no duplicate rows
      const dex = result.preview.lines.find((l) => l.lineId === 'l-dex');
      return dex?.afterGrams ?? null;
    });
    expect(dextroseAfter.every((g) => g !== null)).toBe(true);
    // Three distinct gram amounts — impossible if all temperatures hit one band cell.
    expect(new Set(dextroseAfter.map((g) => Math.round((g as number) * 10))).size).toBe(3);
  });

  it('a failed/successful preview never mutates the input recipe (pure pipeline)', () => {
    const items = cleanBase();
    const snapshot = JSON.stringify(items);
    buildOptimizePreview(input(-12, items), NO_CONSTRAINTS, NOW);
    const lockedItems = cleanBase().map((l) => ({ ...l, lock_type: 'grams' as const }));
    const allSet = {
      byLineId: Object.fromEntries(
        lockedItems.map((l) => [l.id, { mode: 'locked' as const, grams: l.planned_grams }]),
      ),
    };
    buildOptimizePreview(input(-12, lockedItems), allSet, NOW);
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});

describe('Phase 5 — locks', () => {
  it('ONE locked ingredient: solver recalculates around it; locked grams change by exactly 0.0 g', () => {
    const constraints = { byLineId: { 'l-cream': { mode: 'locked' as const, grams: 100 } } };
    const result = buildOptimizePreview(input(-12, cleanBase()), constraints, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cream = result.preview.lines.find((l) => l.lineId === 'l-cream');
    expect(cream?.beforeGrams).toBe(100);
    expect(cream?.afterGrams).toBe(100);
    expect(cream?.locked).toBe(true);
  });

  it('ALL ingredients locked → no_proposal → the EXPLICIT all-locked classification + message', () => {
    const lockedItems = cleanBase().map((l) => ({ ...l, lock_type: 'grams' as const }));
    const constraints = {
      byLineId: Object.fromEntries(
        lockedItems.map((l) => [l.id, { mode: 'locked' as const, grams: l.planned_grams }]),
      ),
    };
    const recipe = input(-12, lockedItems);
    const result = buildOptimizePreview(recipe, constraints, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const diagnosis = diagnoseRecalcFailure({
      input: recipe,
      constraints,
      issue: result,
      servingModeId: null,
    });
    expect(diagnosis.code).toBe('locked_constraints_conflict');
    expect(isAllLocked(diagnosis)).toBe(true);
    expect(constraintStudioCopy.diagnosis.allLocked).toBe(
      'Wszystkie składniki są zablokowane. Odblokuj przynajmniej jeden składnik, aby PI mogło przeliczyć recepturę.',
    );
  });
});

describe('failure classification (owner taxonomy)', () => {
  const noProposal = { ok: false as const, code: 'no_proposal' as const };

  it('ZERO locks → never a lock conflict (PROVEN optimizer_no_solution with metrics + invocations)', () => {
    const diagnosis = diagnoseRecalcFailure({
      input: input(-12, cleanBase()),
      constraints: NO_CONSTRAINTS,
      issue: { ...noProposal, violatedMetrics: ['npac', 'lactose'], solverInvocations: 2 },
      servingModeId: null,
    });
    // Owner P0 (Przelicz z PI): the zero-lock failure is classified as the
    // optimizer honestly finding no solution — WITH proof, never lock blame.
    expect(diagnosis.code).toBe('optimizer_no_solution');
    expect(diagnosis.lockedCount).toBe(0);
    expect(diagnosis.violatedMetrics).toEqual(['npac', 'lactose']);
    expect(diagnosis.solverInvocations).toBe(2);
    const message = constraintStudioCopy.diagnosis.optimizerNoSolution(['NPAC', 'laktoza'], 2);
    expect(message).not.toContain('blokad'); // locks explicitly exonerated
    expect(message).toContain('solver uruchomiony 2 ×');
    expect(message).toContain('NPAC');
  });

  it('≥1 verified lock → locked_constraints_conflict WITH the complete proven lock list', () => {
    const constraints = { byLineId: { 'l-cream': { mode: 'locked' as const, grams: 100 } } };
    const diagnosis = diagnoseRecalcFailure({
      input: input(-13, cleanBase()),
      constraints,
      issue: noProposal,
      servingModeId: 'temp_minus_13',
    });
    expect(diagnosis.code).toBe('locked_constraints_conflict');
    expect(diagnosis.lockedCount).toBe(1);
    expect(diagnosis.totalCount).toBe(6);
    const locked = diagnosis.lockReport.find((r) => !r.adjustable);
    expect(locked?.lineId).toBe('l-cream');
    expect(locked?.source).toBe('user_padlock');
    expect(locked?.userSet).toBe(true);
  });

  it('serving mode vs temperature disagreement → temperature_route_mismatch (checked FIRST)', () => {
    const diagnosis = diagnoseRecalcFailure({
      input: input(-11, cleanBase()), // recipe says −11…
      constraints: NO_CONSTRAINTS,
      issue: noProposal,
      servingModeId: 'temp_minus_13', // …but the routed mode says −13
    });
    expect(diagnosis.code).toBe('temperature_route_mismatch');
    expect(constraintStudioCopy.diagnosis.temperatureMismatch).toBe(
      'Nie można przeliczyć receptury, ponieważ wybrana temperatura i aktywny profil Engine są niespójne.',
    );
  });

  it('empty recipe → recipe_input_incomplete; invalid constraints → constraint_verification_failed', () => {
    expect(
      diagnoseRecalcFailure({
        input: input(-12, []),
        constraints: NO_CONSTRAINTS,
        issue: noProposal,
        servingModeId: null,
      }).code,
    ).toBe('recipe_input_incomplete');
    expect(
      diagnoseRecalcFailure({
        input: input(-12, cleanBase()),
        constraints: NO_CONSTRAINTS,
        issue: { ok: false, code: 'invalid_constraints', issues: [] },
        servingModeId: null,
      }).code,
    ).toBe('constraint_verification_failed');
  });

  it('„Świeże" routes internally to −11 and is NOT a mismatch at −11', () => {
    const diagnosis = diagnoseRecalcFailure({
      input: input(-11, cleanBase()),
      constraints: NO_CONSTRAINTS,
      issue: noProposal,
      servingModeId: 'fresh',
    });
    expect(diagnosis.code).not.toBe('temperature_route_mismatch');
  });
});

describe('lock report — the owner\'s REAL v5 recipe shape (poured actual on Cream 30 %)', () => {
  it('classifies the poured line as immutable rescue material, everything else adjustable', () => {
    const items = [
      line('milk-base:milk_3_5', 'milk_3_5', 1670),
      line('milk-base:cream_30', 'cream_30', 130, 'grams', 150), // poured 150 g — the ONE real lock
      line('milk-base:smp', 'smp', 35),
      line('milk-base:sucrose', 'sucrose', 130),
      line('milk-base:dextrose', 'dextrose', 30),
      line('milk-base:tara_gum', 'tara_gum', 5),
    ];
    const report = buildLockReport(input(-13, items), NO_CONSTRAINTS);
    const cream = report.find((r) => r.lineId === 'milk-base:cream_30');
    expect(cream?.lockState).toBe('poured');
    expect(cream?.source).toBe('poured_actual');
    expect(cream?.adjustable).toBe(false);
    expect(cream?.actualGrams).toBe(150);
    expect(report.filter((r) => r.adjustable)).toHaveLength(5);

    const diagnosis = diagnoseRecalcFailure({
      input: input(-13, items),
      constraints: NO_CONSTRAINTS,
      issue: { ok: false, code: 'no_proposal' },
      servingModeId: 'temp_minus_13',
    });
    // ONE verified lock → a lock-aware classification with the proof, NOT all-locked.
    expect(diagnosis.code).toBe('locked_constraints_conflict');
    expect(isAllLocked(diagnosis)).toBe(false);
    expect(diagnosis.pouredCount).toBe(1);
  });

  it('a grams-lock WITHOUT a session padlock is reported as inherited from the saved recipe', () => {
    const items = [line('l-a', 'milk_3_5', 700), line('l-b', 'cream_30', 100, 'grams')];
    const report = buildLockReport(input(-11, items), NO_CONSTRAINTS);
    expect(report.find((r) => r.lineId === 'l-b')?.source).toBe('saved_recipe');
  });
});
