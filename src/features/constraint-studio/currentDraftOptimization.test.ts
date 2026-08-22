/// <reference types="node" />
/**
 * CURRENT-DRAFT OPTIMIZATION P0 — the owner's verified live failure and the
 * complete regression matrix (owner brief, 2026-07-25).
 *
 * THE OWNER-VERIFIED FAILURE (served staging, Gelato / Classic / −11 °C,
 * target 1000 g, fruit-gelato family): a manually edited recipe with
 * INULIN · Specialty added as a NORMAL UNLOCKED line. At 0 / 10 / 100 / 500 g
 * the LIVE Monitor reacted (so the engine saw the ingredient and its amount),
 * but „Przelicz z PI" always returned „PI nie znalazło dalszej bezpiecznej
 * poprawy…" with the stop reason „receptura odpowiada już wzorcowi
 * referencyjnemu (fruit_gelato_ref_v1)". At Inulin 10 g the draft weighed
 * ≈ 955 g against a 1000 g target and at 100 g ≈ 1045 g — and STILL no Preview:
 * PI called an off-batch draft „the best verified result".
 *
 * Everything below runs the REAL pipeline (`buildOptimizePreview` →
 * `commitPreview`) and the REAL stores. Engine science is untouched: test 20
 * pins ENGINE 0.4.0 / CONFIG 0.7.0.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_VERSION,
  ENGINE_VERSION,
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type RecipeInput,
} from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { recipeTechnicalFit } from '@/features/recipe-score';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ConstraintSet } from '@/features/recipe-constraints';
import {
  buildOptimizePreview,
  commitPreview,
  isBatchReconciliation,
  plannedSum,
  type BuildPreviewResult,
  type ConstraintPreview,
} from './applyPipeline';
import { buildDraftCandidateVector } from './draftCandidateVector';
import { selectCanonicalDraft, useConstraintStudioStore } from './constraintStudioStore';

/* ── the owner's exact draft ──────────────────────────────────────────────── */

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};
const INULIN: EngineIngredient = {
  ...findDemoIngredient('inulin')!,
  name: 'INULIN · Specialty',
};

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock: 'unlocked' | 'grams' = 'unlocked',
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

/** The manually edited fruit-gelato family WITHOUT inulin — exactly 945 g, so
 * that inulin 10 g reproduces the owner's 955 g and 100 g his 1045 g. */
const BASE_945 = () => [
  line('l-straw', STRAWBERRIES, 330),
  line('l-milk', findDemoIngredient('milk_3_5')!, 360),
  line('l-cream', findDemoIngredient('cream_30')!, 76),
  line('l-smp', findDemoIngredient('smp')!, 38),
  line('l-suc', findDemoIngredient('sucrose')!, 104),
  line('l-dex', findDemoIngredient('dextrose')!, 33),
  line('l-tara', findDemoIngredient('tara_gum')!, 4),
];

const withInulin = (grams: number, lock: 'unlocked' | 'grams' = 'unlocked') => [
  ...BASE_945(),
  line('l-inulin', INULIN, grams, lock),
];

// OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — SUPERSEDES the
// `fruit_gelato` category these fixtures carried. That cell has NO native
// seeded bands, so `selectTargetBand` silently substituted the milk_gelato
// bands and flagged every indicator `category_fallback`. This dairy fruit
// family is canonical GELATO → `milk_gelato`. The BAND VALUES are byte-
// identical (the fallback WAS the milk_gelato band), so every number this
// suite pins is unchanged; what changes is that the violations are now
// measured on NATIVE approved bands instead of being labelled provisional.
const draft = (items: ReturnType<typeof line>[], batch = 1000): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

const NO: ConstraintSet = { byLineId: {} };
const TARGET = 1000;
const AT = '2026-07-25T09:00:00.000Z';

const previewOf = (result: BuildPreviewResult): ConstraintPreview => {
  expect(result.ok, result.ok ? '' : `expected a Preview, got ${result.code}`).toBe(true);
  if (!result.ok) throw new Error('no preview');
  return result.preview;
};

const inulinGrams = (input: RecipeInput): number =>
  input.items.find((item) => item.id === 'l-inulin')?.planned_grams ?? Number.NaN;

const seedStore = (items: ReturnType<typeof line>[], constraints: ConstraintSet = NO) => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato', // canonical family (owner addendum item 1)
    visibleProductType: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: TARGET,
    machine_capacity_grams: null,
    machine_capacity_source: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items,
    excludedIngredientIds: [],
    servingModeId: null,
    machineKind: null,
    machineId: null,
    machineLabel: null,
  });
  useConstraintStudioStore.getState().resetForTests();
  useConstraintStudioStore.setState({ constraints });
};

beforeEach(() => seedStore(withInulin(10)));

/* ═══ 1–3 — the optimizer really receives the CURRENT draft ═══════════════ */

describe('the optimizer receives the CURRENT draft (owner Phase 1, tests 1–3)', () => {
  it('test 1: a MANUALLY ADDED unlocked Inulin line reaches the optimizer as an adjustable candidate', () => {
    const rec = draft(withInulin(10));
    const vector = buildDraftCandidateVector(rec, NO, new Set());
    const inulin = vector.find((candidate) => candidate.lineId === 'l-inulin');
    expect(inulin, 'Inulin must be in the candidate vector').toBeDefined();
    expect(inulin!.increasable).toBe(true);
    expect(inulin!.testedGrams.length).toBeGreaterThan(0);
    // …and the run itself records it (the QA-visible proof).
    const preview = previewOf(buildOptimizePreview(rec, NO, AT));
    expect(preview.iteration!.candidateVector.map((candidate) => candidate.lineId)).toContain(
      'l-inulin',
    );
  });

  it('test 2: the CURRENT amount reaches the optimizer — never a stale/reference value', () => {
    for (const grams of [0, 10, 100, 500]) {
      const rec = draft(withInulin(grams));
      const preview = previewOf(buildOptimizePreview(rec, NO, AT));
      const iteration = preview.iteration!;
      // THE anti-staleness proof: the optimizer received the user's CURRENT
      // grams and the CURRENT total (955 / 1045 …), not a 1000 g reference.
      expect(iteration.draftPlannedSumGrams).toBeCloseTo(plannedSum(rec), 6);
      expect(iteration.draftLineGrams.find((l) => l.lineId === 'l-inulin')!.grams).toBe(grams);
      // …and it was offered as an adjustable candidate on the batch-true state
      // (the grams there are the CURRENT value carried through the §17.4
      // reconciliation — proportional inside the free envelope, while the
      // template-controlled Tara dose stays byte-exact).
      const seen = iteration.candidateVector.find((c) => c.lineId === 'l-inulin');
      expect(seen, `inulin ${grams} g must be offered`).toBeDefined();
      expect(seen!.currentGrams).toBeCloseTo(grams * ((TARGET - 4) / (plannedSum(rec) - 4)), 6);
      expect(iteration.startPlannedSumGrams).toBeCloseTo(TARGET, 6);
      expect(iteration.targetBatchGrams).toBe(TARGET);
    }
  });

  it('test 3: 0 / 10 / 100 / 500 g produce DISTINCT evaluations of the draft', () => {
    const signatures = [0, 10, 100, 500].map((grams) => {
      const rec = draft(withInulin(grams));
      const result = calculateRecipe(rec);
      return JSON.stringify({
        sum: plannedSum(rec),
        violations: detectViolations(result).map((v) => `${v.metric}_${v.direction}`),
        technical: result.scores?.technical,
      });
    });
    expect(new Set(signatures).size).toBe(4);
    // The owner's exact off-batch masses are reproduced.
    expect(plannedSum(draft(withInulin(10)))).toBeCloseTo(955, 6);
    expect(plannedSum(draft(withInulin(100)))).toBeCloseTo(1045, 6);
  });
});

/* ═══ 4–6 — the batch equality and real adjustability ════════════════════ */

describe('target-batch equality is a REQUIRED outcome (tests 4–6)', () => {
  it('test 4: the owner 955 g draft (Inulin 10 g) optimizes to EXACTLY 1000 g', () => {
    const preview = previewOf(buildOptimizePreview(draft(withInulin(10)), NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
  });

  it('test 5: the owner 1045 g draft (Inulin 100 g) optimizes to EXACTLY 1000 g', () => {
    const preview = previewOf(buildOptimizePreview(draft(withInulin(100)), NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
  });

  it('test 6: an UNLOCKED Inulin line may really be changed without silently removing user intent', () => {
    const changed = [0, 10, 100, 500].map((grams) => {
      const preview = previewOf(buildOptimizePreview(draft(withInulin(grams)), NO, AT));
      return inulinGrams(preview.proposedInput) !== grams;
    });
    expect(changed.some(Boolean), 'at least one amount must really move').toBe(true);
    // A line at 0 g is offered upward movement (it is not frozen at zero).
    const zeroVector = buildDraftCandidateVector(draft(withInulin(0)), NO, new Set());
    const zeroInulin = zeroVector.find((c) => c.lineId === 'l-inulin')!;
    expect(Math.max(...zeroInulin.testedGrams)).toBeGreaterThan(0);
  });

  it('keeps a positive user-intent Standard line present and anchors ranking to the entered grams', () => {
    const rec: RecipeInput = {
      ...draft(withInulin(100)),
      items: draft(withInulin(100)).items.map((item) =>
        item.id === 'l-inulin' ? { ...item, user_intent_anchor_grams: 100 } : item,
      ),
    };
    const vector = buildDraftCandidateVector(rec, NO, new Set());
    const inulin = vector.find((candidate) => candidate.lineId === 'l-inulin')!;
    expect(inulin.testedGrams).toContain(1);
    expect(inulin.testedGrams).not.toContain(0);
    expect(inulin.anchorGrams).toBe(100);

    const preview = previewOf(buildOptimizePreview(rec, NO, AT));
    expect(inulinGrams(preview.proposedInput)).toBeGreaterThanOrEqual(1);
    expect(preview.proposedInput.items.find((item) => item.id === 'l-inulin')).toMatchObject({
      user_intent_anchor_grams: 100,
    });
  });
});

/* ═══ 7–8 — locks and exclusions are absolute ════════════════════════════ */

describe('locks and exclusions bound the optimizer (tests 7–8)', () => {
  it('test 7: an EXACT-locked Inulin line stays byte-exact', () => {
    for (const grams of [0, 10, 100]) {
      const rec = draft(withInulin(grams, 'grams'));
      const set: ConstraintSet = { byLineId: { 'l-inulin': { mode: 'locked', grams } } };
      const result = buildOptimizePreview(rec, set, AT);
      if (!result.ok) continue; // an honest structured stop is acceptable
      expect(Object.is(inulinGrams(result.preview.proposedInput), grams), `inulin ${grams}`).toBe(
        true,
      );
      // The vector never even offers a held line.
      expect(buildDraftCandidateVector(rec, set, new Set()).map((c) => c.lineId)).not.toContain(
        'l-inulin',
      );
    }
  });

  it('test 8: an UNAVAILABLE Inulin never returns and is never raised', () => {
    const rec = draft(withInulin(0));
    const excluded = new Set(['inulin']);
    const vector = buildDraftCandidateVector(rec, NO, excluded);
    const inulin = vector.find((c) => c.lineId === 'l-inulin');
    // Present but never increasable — an excluded ingredient may only shrink.
    expect(inulin?.increasable ?? false).toBe(false);
    expect((inulin?.testedGrams ?? []).every((grams) => grams <= 0)).toBe(true);

    const result = buildOptimizePreview(rec, NO, AT, { excludedIngredientIds: ['inulin'] });
    if (result.ok) {
      // Owner zero-gram executable invariant: an unused (0 g) excluded line is
      // OMITTED from the executable proposal — never raised, never a 0 g row.
      expect(
        result.preview.proposedInput.items.filter((i) => i.ingredient.id === 'inulin'),
      ).toHaveLength(0);
    }
  });
});

/* ═══ 9–11 — a stop must be PROVEN, never asserted ═══════════════════════ */

describe('a stop must be proven (owner Phase 4, tests 9–11)', () => {
  const pipelineSource = readFileSync(
    join(resolve(import.meta.dirname), 'applyPipeline.ts'),
    'utf8',
  );

  it('test 9: resemblance to the reference template can NEVER stop the optimization', () => {
    // The owner's exact failing draft now produces a real Preview…
    const preview = previewOf(buildOptimizePreview(draft(withInulin(10)), NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    // …and the „matches the reference template" phrasing is gone from the copy.
    const copySource = readFileSync(
      join(resolve(import.meta.dirname), 'constraintStudioCopy.ts'),
      'utf8',
    );
    expect(copySource).not.toContain('receptura odpowiada już wzorcowi referencyjnemu');
    // Template similarity survives only as separately labelled provenance.
    expect(copySource).toContain('Zgodność ze wzorcem referencyjnym');
  });

  it('test 10: ONE local solver invocation can never claim a global optimum', () => {
    // Structural: BOTH terminal branches of the local route are wrapped in the
    // template-seeded fallback AND the batch-reconciliation door — a local
    // no-proposal / rejected candidate can never be the last word.
    const composed = /withBatchReconciliation\(\s*\n\s*withTemplateFallback\(\{/g;
    expect(pipelineSource.match(composed) ?? []).toHaveLength(2);
    // Behavioural: the CURRENT-DRAFT vector is really searched before any stop.
    const preview = previewOf(buildOptimizePreview(draft(withInulin(500)), NO, AT));
    expect(preview.iteration!.solverInvocations).toBeGreaterThanOrEqual(1);
    expect(preview.iteration!.candidateVector.length).toBeGreaterThan(0);
  });

  it('test 11: the template-seeded fallback runs AFTER the local fixed point, never instead of it', () => {
    const localFirst = pipelineSource.indexOf('const iterated = iterateSolverToFixedPoint(');
    const fallbackUse = pipelineSource.indexOf('withTemplateFallback({');
    expect(localFirst).toBeGreaterThan(0);
    expect(fallbackUse).toBeGreaterThan(localFirst);
    // And when a best-safe state IS reached it carries the searched evidence.
    expect(pipelineSource).toContain('evidence: buildBestSafeEvidence(');
  });
});

/* ═══ 12–13 — ONE canonical score ═══════════════════════════════════════ */

describe('ONE canonical score (owner Phase 5, tests 12–13)', () => {
  it('test 12: the Monitor and the recalculation modal read the SAME adapter', () => {
    for (const grams of [0, 10, 100, 500]) {
      const result = calculateRecipe(draft(withInulin(grams)));
      expect(monitorScoreView(result).match).toEqual(recipeTechnicalFit(result));
    }
  });

  it('test 13: identical input can never render 8/10 in one place and 9/10 in another', () => {
    // The owner's exact report: technical ≈ 88 → 9/10 while overall ≈ 82 → 8/10.
    for (const grams of [0, 10, 100, 500]) {
      const result = calculateRecipe(draft(withInulin(grams)));
      const monitor = monitorScoreView(result).match;
      const modal = recipeTechnicalFit(result);
      expect(monitor.score).toBe(modal.score);
      expect(monitor.display).toBe(modal.display);
      expect(monitor.label).toBe(modal.label);
    }
    // The Monitor summary no longer reads the mode-weighted blend at all.
    const seam = readFileSync(
      join(resolve(import.meta.dirname), '..', 'pro-workbench', 'monitorSummaryView.ts'),
      'utf8',
    );
    expect(seam.includes('recipeMatchScore(')).toBe(false);
  });
});

/* ═══ 14–18 — the live draft lifecycle ══════════════════════════════════ */

describe('the live draft lifecycle (tests 14–18)', () => {
  it('test 14: the Preview is built on the CURRENT draft revision', () => {
    seedStore(withInulin(10));
    const revisionBefore = selectCanonicalDraft().revision;
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    expect(preview!.baseDraftRevision).toBe(revisionBefore);
    // A material edit bumps the revision — the stale preview can never apply.
    useRecipeStore.getState().setBatchGrams(1200);
    const outcome = commitPreview(
      selectCanonicalDraft().input,
      useConstraintStudioStore.getState().constraints,
      preview!,
      AT,
      'stale-check',
      [],
      selectCanonicalDraft().revision,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('stale_preview');
  });

  it('test 15: Cancel leaves the draft byte-unchanged', () => {
    seedStore(withInulin(10));
    const before = JSON.stringify(
      useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams]),
    );
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().cancelPreview();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(
      JSON.stringify(useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams])),
    ).toBe(before);
  });

  it('test 16: Apply writes EXACTLY the previewed grams', () => {
    seedStore(withInulin(10));
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview!;
    const previewed = preview.proposedInput.items.map((i) => [i.id, i.planned_grams]);
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams])).toEqual(previewed);
  });

  it('test 17: no duplicate canonical ingredients are ever produced', () => {
    seedStore(withInulin(10));
    for (let cycle = 0; cycle < 5; cycle += 1) {
      useConstraintStudioStore.getState().createOptimizePreview();
      if (useConstraintStudioStore.getState().preview) {
        useConstraintStudioStore.getState().applyPreview();
        useConstraintStudioStore.getState().dismissBlocked();
      }
      const ids = useRecipeStore.getState().items.map((i) => i.ingredient.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('test 18: the target batch stays 1000 g across repeated recalculate/apply cycles', () => {
    seedStore(withInulin(10));
    for (let cycle = 0; cycle < 5; cycle += 1) {
      useConstraintStudioStore.getState().createOptimizePreview();
      if (useConstraintStudioStore.getState().preview) {
        useConstraintStudioStore.getState().applyPreview();
        useConstraintStudioStore.getState().dismissBlocked();
      }
      expect(useRecipeStore.getState().target_batch_grams).toBe(TARGET);
      const sum = useRecipeStore.getState().items.reduce((a, i) => a + i.planned_grams, 0);
      expect(Math.abs(sum - TARGET)).toBeLessThanOrEqual(0.1);
    }
  });
});

/* ═══ 19–20 — machine context and the science freeze ════════════════════ */

describe('machine context and the science freeze (tests 19–20)', () => {
  it('test 19: a 1000 g PROFESSIONAL recipe with no Home machine raises NO capacity warning', () => {
    seedStore(withInulin(10));
    // The professional selection is authoritative — it imposes no Home limit.
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_11',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -11,
    });
    const input = buildRecipeInput(useRecipeStore.getState());
    expect(input.machine_capacity_grams).toBeNull();
    expect(
      calculateRecipe(input).warnings.some((w) => w.code === 'machine_capacity_exceeded'),
    ).toBe(false);

    // Even a value left behind by an earlier session cannot fire it: without
    // provenance the capacity never reaches the Engine at all.
    useRecipeStore.setState({ machine_capacity_grams: 500, machine_capacity_source: null });
    const stale = buildRecipeInput(useRecipeStore.getState());
    expect(stale.machine_capacity_grams).toBeNull();
    expect(
      calculateRecipe(stale).warnings.some((w) => w.code === 'machine_capacity_exceeded'),
    ).toBe(false);

    // A REAL, explicitly selected smaller Home capacity still warns honestly.
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'temp_minus_11',
      machineId: 'home-1',
      label: 'Home machine',
      temperatureC: -11,
      batchGrams: TARGET,
      capacityGrams: 500,
    });
    const home = buildRecipeInput(useRecipeStore.getState());
    expect(home.machine_capacity_grams).toBe(500);
    expect(calculateRecipe(home).warnings.some((w) => w.code === 'machine_capacity_exceeded')).toBe(
      true,
    );
  });

  it('test 20: engine science is UNCHANGED (0.4.0 / 0.7.0 pinned)', () => {
    expect(ENGINE_VERSION).toBe('0.4.0');
    expect(CONFIG_VERSION).toBe('0.7.0');
    const preview = previewOf(buildOptimizePreview(draft(withInulin(10)), NO, AT));
    expect(preview.engineVersion).toBe('0.4.0');
    expect(preview.configVersion).toBe('0.7.0');
  });
});

/* ═══ owner fixtures A–F ════════════════════════════════════════════════ */

describe('owner fixtures A–F (complete fruit-gelato family, real pipeline runs)', () => {
  it('A — Inulin 0 g unlocked: total exactly 1000 g, no silent template reset', () => {
    const preview = previewOf(buildOptimizePreview(draft(withInulin(0)), NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    // The user's own identities survive — nothing was replaced wholesale. The
    // one 0 g optional row (unused Inulin) is OMITTED by the zero-gram
    // executable invariant (absence, never an explicit 0 g row).
    for (const item of draft(withInulin(0)).items) {
      const present = preview.proposedInput.items.some((row) => row.id === item.id);
      if (item.planned_grams > 0) expect(present, item.id).toBe(true);
      else expect(present, `${item.id} must be omitted, never a 0 g row`).toBe(false);
    }
    expect(preview.proposedInput.items.every((row) => row.planned_grams > 0)).toBe(true);
  });

  it('B — Inulin 10 g (955 g): evaluated, batch → exactly 1000 g, canonical score before/after', () => {
    const rec = draft(withInulin(10));
    expect(plannedSum(rec)).toBeCloseTo(955, 6);
    const preview = previewOf(buildOptimizePreview(rec, NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    expect(preview.lines.some((l) => l.kind !== 'unchanged')).toBe(true);
    const before = recipeTechnicalFit(calculateRecipe(rec));
    const after = recipeTechnicalFit(calculateRecipe(preview.proposedInput));
    expect(before.score).not.toBeNull();
    expect(after.score).not.toBeNull();
    expect(after.score!).toBeGreaterThanOrEqual(before.score!);
  });

  it('C — Inulin 100 g (1045 g): may be reduced, batch → exactly 1000 g, never a silent no-op', () => {
    const rec = draft(withInulin(100));
    expect(plannedSum(rec)).toBeCloseTo(1045, 6);
    const preview = previewOf(buildOptimizePreview(rec, NO, AT));
    expect(Math.abs(plannedSum(preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    expect(preview.lines.some((l) => l.kind === 'changed')).toBe(true);
  });

  it('D — Inulin 500 g: NEVER called optimal — a safe reformulation or an honest conflict', () => {
    const rec = draft(withInulin(500));
    const result = buildOptimizePreview(rec, NO, AT);
    if (result.ok) {
      // A real proposal that verifiably improves the engine's own measure.
      const before = detectViolations(calculateRecipe(rec)).length;
      const after = detectViolations(calculateRecipe(result.preview.proposedInput)).length;
      expect(after).toBeLessThanOrEqual(before);
      expect(result.preview.lines.some((l) => l.kind !== 'unchanged')).toBe(true);
    } else {
      // …or an honest structured conflict, never „the best verified result".
      expect(['impossible_under_constraints', 'missing_required_role']).toContain(result.code);
    }
    // In neither case may an untouched 1500 g draft be presented as the answer.
    if (result.ok) {
      expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    }
  });

  it('E — Inulin EXACT-locked 100 g: byte-preserved while the rest reaches exactly 1000 g', () => {
    const rec = draft(withInulin(100, 'grams'));
    const set: ConstraintSet = { byLineId: { 'l-inulin': { mode: 'locked', grams: 100 } } };
    const result = buildOptimizePreview(rec, set, AT);
    if (result.ok) {
      expect(Object.is(inulinGrams(result.preview.proposedInput), 100)).toBe(true);
      expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    } else {
      // An exact infeasibility proof is the only permitted alternative.
      expect(['impossible_under_constraints', 'best_safe_result', 'rescale_locked_sum']).toContain(
        result.code,
      );
    }
  });

  it('F — Inulin unavailable: stays absent/0 and is never reintroduced', () => {
    const rec = draft(withInulin(0));
    const result = buildOptimizePreview(rec, NO, AT, { excludedIngredientIds: ['inulin'] });
    if (result.ok) {
      // Owner zero-gram executable invariant: "stays absent" is literal — the
      // unused excluded line is omitted from the executable proposal.
      expect(
        result.preview.proposedInput.items.filter((i) => i.ingredient.id === 'inulin'),
      ).toHaveLength(0);
      expect(Math.abs(plannedSum(result.preview.proposedInput) - TARGET)).toBeLessThanOrEqual(0.1);
    }
  });
});

/* ═══ the batch-reconciliation discriminator (the 8 × 125 g guard) ═══════ */

describe('batch reconciliation never re-opens the 8 × 125 g door', () => {
  it('a HOLLOW uniform draft is NOT a batch reconciliation', () => {
    const hollow = draft(BASE_945().map((item) => ({ ...item, planned_grams: 1 })));
    const projected: RecipeInput = {
      ...hollow,
      items: hollow.items.map((item) => ({ ...item, planned_grams: TARGET / hollow.items.length })),
    };
    expect(isBatchReconciliation(hollow, projected)).toBe(false);
  });

  it('a NEAR-batch uniform draft is NOT a batch reconciliation either', () => {
    const uniform = draft(BASE_945().map((item) => ({ ...item, planned_grams: 140 })));
    const projected: RecipeInput = {
      ...uniform,
      items: uniform.items.map((item) => ({
        ...item,
        planned_grams: TARGET / uniform.items.length,
      })),
    };
    expect(isBatchReconciliation(uniform, projected)).toBe(false);
  });

  it('the owner 955 g DIFFERENTIATED draft IS a legitimate batch reconciliation', () => {
    const rec = draft(withInulin(10));
    const factor = TARGET / plannedSum(rec);
    const restored: RecipeInput = {
      ...rec,
      items: rec.items.map((item) => ({ ...item, planned_grams: item.planned_grams * factor })),
    };
    expect(isBatchReconciliation(rec, restored)).toBe(true);
  });

  it('an on-batch draft is never a "reconciliation" (nothing to reconcile)', () => {
    const rec = draft(withInulin(55)); // exactly 1000 g
    expect(plannedSum(rec)).toBeCloseTo(TARGET, 6);
    expect(isBatchReconciliation(rec, rec)).toBe(false);
  });
});

/* ═══ determinism ═══════════════════════════════════════════════════════ */

describe('determinism (same draft → byte-identical outcome)', () => {
  it('five runs of the owner draft are byte-identical', () => {
    const serialize = (result: BuildPreviewResult): string =>
      JSON.stringify(
        result.ok
          ? {
              items: result.preview.proposedInput.items.map((i) => [i.id, i.planned_grams]),
              iteration: result.preview.iteration,
            }
          : result,
      );
    const runs = Array.from({ length: 5 }, () =>
      serialize(buildOptimizePreview(draft(withInulin(10)), NO, AT)),
    );
    for (const run of runs) expect(run).toBe(runs[0]);
  });
});
