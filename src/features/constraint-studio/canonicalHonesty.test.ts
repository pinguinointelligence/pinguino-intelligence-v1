/**
 * OWNER FINAL INTEGRATION ADDENDUM — items 2, 3 and 4 (2026-07-25).
 *
 * Item 2 — reference_derived may never produce an APPLICABLE production recipe:
 *          the trustless provenance gate at `VerifiedApply.commit`, and the
 *          structural proof that no runtime path can select a non-approved
 *          template.
 * Item 3 — no „best achievable" claim survives anywhere in the runtime copy or
 *          the QA verdict vocabulary (the solver is coordinate descent: it can
 *          prove a LOCAL fixed point, never a global optimum).
 * Item 4 — batch reconciliation is NOT formulation improvement: the outcome
 *          classification is recomputed from the before/after inputs, so a pure
 *          rescale can never render the optimisation wording and a verified
 *          improvement can never be mislabelled as a rescale.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TARGET_BANDS, type ProductCategory, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  buildOptimizePreview,
  classifyPreviewOutcome,
  commitPreview,
  plannedSum,
  workingStateFingerprint,
  type ConstraintPreview,
} from './applyPipeline';
import { constraintStudioCopy } from './constraintStudioCopy';
import { previewIssueMessagePl } from './previewIssueMessage';
import {
  findFormulationTemplateById,
  isApprovedTemplateId,
  listFormulationTemplates,
  listQuarantinedTemplates,
  selectFormulationTemplate,
} from '@/features/formulation/templateRegistry';
import { NATIVE_BAND_CATEGORIES } from '@/features/studio/productType';
import type { ConstraintSet } from '@/features/recipe-constraints';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const line = (id: string, ingredient: string, grams: number) => ({
  id,
  ingredient: findDemoIngredient(ingredient)!,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: 'unlocked' as const,
});

const input = (items: ReturnType<typeof line>[], batch = 1000): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items,
});

const NO: ConstraintSet = { byLineId: {} };

/** A complete, in-band milk gelato at exactly 1000 g. */
const CLEAN_1000 = () => [
  line('l-milk', 'milk_3_5', 670),
  line('l-cream', 'cream_30', 130),
  line('l-smp', 'smp', 35),
  line('l-suc', 'sucrose', 130),
  line('l-dex', 'dextrose', 30),
  line('l-tara', 'tara_gum', 5),
];

/* ═══ ITEM 2 — reference-derived may never become an applicable recipe ════ */

describe('addendum item 2 — reference-derived provenance can never commit', () => {
  it('no runtime lookup can select a non-approved template, for ANY category × temperature', () => {
    const ALL_CATEGORIES: ProductCategory[] = [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
      'sorbet',
      'vegan_gelato',
      'custom',
    ];
    for (const category of ALL_CATEGORIES) {
      for (const temperature of [-10, -11, -12, -13, -14]) {
        const template = selectFormulationTemplate(category, temperature).template;
        if (template === null) continue;
        expect(template.status, `${category}@${temperature}`).toBe('approved');
      }
    }
    // …and the runtime registry itself contains approved templates only.
    expect(listFormulationTemplates().every((t) => t.status === 'approved')).toBe(true);
    // The quarantined seed still exists for tests/diagnostics/the door.
    expect(listQuarantinedTemplates().length).toBeGreaterThan(0);
    for (const quarantined of listQuarantinedTemplates()) {
      expect(quarantined.status).not.toBe('approved');
      expect(findFormulationTemplateById(quarantined.templateId)).not.toBeNull();
      expect(isApprovedTemplateId(quarantined.templateId)).toBe(false);
      expect(listFormulationTemplates()).not.toContainEqual(quarantined);
    }
  });

  it('the door refuses a reference-derived proposal even when everything else is perfect', () => {
    const current = input(CLEAN_1000());
    const built = buildOptimizePreview(current, NO, 'now');
    // The clean draft needs no change — forge a preview from the same state so
    // that EVERY other door gate (fingerprint, locks, batch, duplicates,
    // improvement) is satisfied and only the provenance can refuse it.
    const base = built.ok
      ? built.preview
      : ({
          kind: 'optimize',
          titlePl: 'forged',
          outcomeClassification: classifyPreviewOutcome(current, current),
          baseFingerprint: workingStateFingerprint(current, NO),
          proposedInput: current,
          nextConstraints: NO,
          lines: [],
          violationsBefore: 0,
          violationsAfter: 0,
          explanation: [],
          engineVersion: '0.4.0',
          configVersion: '0.7.0',
          createdAt: 'now',
        } satisfies ConstraintPreview);

    const forged: ConstraintPreview = {
      ...base,
      // A quarantined seed, but the preview CLAIMS it is approved: the door must
      // ignore the claim and re-read the registry by id (trustless).
      formulation: {
        mode: 'full_formulation',
        templateId: 'fruit_gelato_ref_v1',
        templateStatus: 'approved',
        added: [],
        missingRoles: [],
        recommendations: [],
        keptFixed: [],
        roleTrace: [],
        proof: {
          verdict: 'all_bands_in_range',
          improvingMoves: 1,
          solverInvocations: 1,
          proportionalProjection: false,
          sharedScaleFactor: null,
          bestEffort: false,
          bestEffortReasons: [],
          stabilizerDoseNotePl: null,
        },
      },
      iteration: {
        solverInvocations: 1,
        draftVectorSearches: 0,
        candidateVector: [],
        draftPlannedSumGrams: plannedSum(current),
        draftLineGrams: [],
        startPlannedSumGrams: plannedSum(current),
        targetBatchGrams: 1000,
        rounds: [
          { round: 0, violations: 0, severityPoints: 0 },
          { round: 1, violations: 0, severityPoints: 0 },
        ],
        stopReason: 'all_bands_in_range',
        stopDetail: null,
        capped: false,
        attemptedMoves: [],
      },
    };

    const outcome = commitPreview(current, NO, forged, 'now', 'ref-derived');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('reference_derived_provenance');
    expect(outcome.messagePl).toContain('fruit_gelato_ref_v1');
    expect(outcome.messagePl).toContain('nie jest zatwierdzona naukowo');
    expect(outcome.messagePl).toContain('Receptura nie została zmieniona.');
  });

  it('an unknown template id is not approved either (never a silent pass)', () => {
    expect(isApprovedTemplateId('no-such-template')).toBe(false);
    expect(findFormulationTemplateById('no-such-template')).toBeNull();
  });

  it('the reference-derived seed is diagnostic-only when it is presented at all', () => {
    // The card renders the honest explanation + next step for this reason code.
    expect(
      constraintStudioCopy.preview.diagnosticReferenceDerived('fruit_gelato_ref_v1'),
    ).toContain('wyłącznie diagnostyce');
    expect(constraintStudioCopy.preview.diagnosticReferenceDerived('X')).toContain(
      'Wybierz zatwierdzony profil produktu',
    );
    const card = read('features', 'constraint-studio', 'ui', 'ConstraintPreviewCard.tsx');
    expect(card).toContain('diagnosticReferenceDerived');
  });
});

/* ═══ ITEM 3 — no unearned „best achievable" claim anywhere ══════════════ */

describe('addendum item 3 — honest terminology (no global-optimum claims)', () => {
  const CLAIMS = [
    'najlepszym zweryfikowanym wynikiem',
    'dowiedzioną najlepszą',
    'best achievable',
    'BEST-ACHIEVABLE',
  ];

  /** Every LIVE (non-comment) line of a source file — supersession notes are
   * allowed to quote the retired wording, shipped strings are not. Line and
   * block comments are both stripped (a block comment's continuation lines do
   * not necessarily start with `*`). */
  const liveSource = (...path: string[]): string => {
    const lines = read(...path).split('\n');
    const live: string[] = [];
    let inBlock = false;
    for (const row of lines) {
      const trimmed = row.trimStart();
      if (inBlock) {
        if (row.includes('*/')) inBlock = false;
        continue;
      }
      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('/*')) {
        if (!row.includes('*/')) inBlock = true;
        continue;
      }
      live.push(row);
    }
    return live.join('\n');
  };

  it('no runtime copy string claims a proven best/optimal result', () => {
    const copySource = liveSource('features', 'constraint-studio', 'constraintStudioCopy.ts');
    for (const claim of CLAIMS) {
      expect(copySource, claim).not.toContain(claim);
    }
    // The shared copy module carries no such claim either.
    const en = liveSource('copy', 'en.ts');
    for (const claim of CLAIMS) {
      expect(en, claim).not.toContain(claim);
    }
  });

  it('the best-safe message names the SOLVER and always carries its stop reason', () => {
    const message = previewIssueMessagePl({
      ok: false,
      code: 'best_safe_result',
      solverInvocations: 4,
      softViolatedMetrics: ['fat'],
      bandSource: 'category_fallback',
      templateId: 'milk_base_v1',
      templateStatus: 'approved',
      stopReason: 'local_no_proposal',
      evidence: {
        solverInvocations: 4,
        draftVectorSearches: 4,
        iterations: 3,
        testedCandidates: [],
        limitingMetrics: ['fat'],
        provisionalProfile: true,
      },
    });
    expect(message).toContain('najlepszy wynik znaleziony przez obecny solver');
    expect(message).toContain('Powód zatrzymania');
    expect(message).toContain('4 ×'); // the real invocation count rides along
    expect(message).not.toContain('najlepszym zweryfikowanym wynikiem');
  });

  it('the QA verdict vocabulary carries no best-achievable claim', () => {
    const cases = read('qa', 'engine-authenticity', 'authenticityCases.ts');
    // The type union itself.
    expect(cases).toContain("| 'AUTHENTIC-BEST-FOUND'");
    // Only the supersession note may mention the retired name.
    const live = cases
      .split('\n')
      .filter((row) => !row.trimStart().startsWith('*') && !row.trimStart().startsWith('//'));
    expect(live.join('\n')).not.toContain('BEST-ACHIEVABLE');
  });

  it('all_bands_in_range stays the ONLY outcome allowed to say every band is met', () => {
    // …and even it is never called a global optimum anywhere in the copy.
    const pipeline = read('features', 'constraint-studio', 'applyPipeline.ts');
    expect(pipeline).toContain("'all_bands_in_range'");
    const copySource = read('features', 'constraint-studio', 'constraintStudioCopy.ts');
    expect(copySource).not.toContain('globalne optimum');
    expect(copySource).not.toContain('optimum matematyczne');
    // The one sentence allowed to say the recipe is inside every approved band
    // stays exactly that — a statement about BANDS, never about optimality.
    expect(constraintStudioCopy.previewIssue.alreadyClean).toContain('w zatwierdzonym zakresie');
    expect(constraintStudioCopy.previewIssue.alreadyClean).not.toContain('optym');
  });
});

/* ═══ ITEM 4 — batch reconciliation is NOT formulation improvement ═══════ */

describe('addendum item 4 — the outcome classification is recomputed, never claimed', () => {
  it('a PURE rescale is „Przeskalowano partię" and can never say optimisation', () => {
    const before = input(
      CLEAN_1000().map((item) => ({ ...item, planned_grams: item.planned_grams * 0.955 })),
    );
    // the same composition, projected onto the exact target batch
    const factor = 1000 / plannedSum(before);
    const after = {
      ...before,
      items: before.items.map((i) => ({ ...i, planned_grams: i.planned_grams * factor })),
    };

    const classification = classifyPreviewOutcome(before, after);
    expect(classification.batchReconciled).toBe(true);
    expect(classification.compositionUnchanged).toBe(true);
    // A pure rescale cannot change ANY per-100 g metric, so the engine can
    // never report an improvement for it — this is arithmetic, not a policy.
    expect(classification.engineImproved).toBe(false);
    expect(classification.outcome).toBe('batch_rescale');
    expect(classification.violationsAfter).toBe(classification.violationsBefore);
  });

  it('a REAL engine-verified improvement can never be mislabelled as a rescale', () => {
    // A draft at the target batch but out of band: any accepted preview must
    // have improved it, so the classification must contain the optimisation.
    const before = input([
      line('l-milk', 'milk_3_5', 700),
      line('l-cream', 'cream_30', 60),
      line('l-smp', 'smp', 20),
      line('l-suc', 'sucrose', 200),
      line('l-dex', 'dextrose', 15),
      line('l-tara', 'tara_gum', 5),
    ]);
    const result = buildOptimizePreview(before, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const classification = result.preview.outcomeClassification;
    expect(classification.engineImproved).toBe(true);
    expect(['engine_optimization', 'batch_rescale_and_optimization']).toContain(
      classification.outcome,
    );
    // …and it is recomputed from the inputs, not carried from the builder.
    expect(classifyPreviewOutcome(before, result.preview.proposedInput)).toEqual(classification);
  });

  it('the MIXED case says both, batch first (the owner order of honesty)', () => {
    expect(constraintStudioCopy.preview.outcome.bothHeading).toBe(
      'Przeskalowano partię i PI zoptymalizowało recepturę',
    );
    const both = constraintStudioCopy.preview.outcome.bothHeading;
    expect(both.indexOf('Przeskalowano')).toBeLessThan(both.indexOf('zoptymalizowało'));
  });

  it('every preview builder emits a classification (no path can skip it)', () => {
    const result = buildOptimizePreview(
      input([
        line('l-milk', 'milk_3_5', 700),
        line('l-cream', 'cream_30', 60),
        line('l-smp', 'smp', 20),
        line('l-suc', 'sucrose', 200),
        line('l-dex', 'dextrose', 15),
        line('l-tara', 'tara_gum', 5),
      ]),
      NO,
      'now',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.outcomeClassification).toBeDefined();
    // The card reads its wording from the classification, never from the flag.
    const card = read('features', 'constraint-studio', 'ui', 'ConstraintPreviewCard.tsx');
    expect(card).toContain('preview.outcomeClassification');
    expect(card).not.toContain('preview.batchReconciliationOnly');
  });

  it('the classification is a pure function of the two inputs', () => {
    const before = input(CLEAN_1000());
    const after = input(CLEAN_1000());
    expect(classifyPreviewOutcome(before, after)).toEqual(classifyPreviewOutcome(before, after));
    expect(classifyPreviewOutcome(before, after).outcome).toBe('no_verified_change');
  });
});

/* ═══ ITEM 1 companion — the seeded-cell list drives everything ══════════ */

describe('addendum item 1 — the native-band list is derived, never hard-coded', () => {
  it('NATIVE_BAND_CATEGORIES equals the engine seeded-cell list exactly', () => {
    const seeded = [
      ...new Set(TARGET_BANDS.filter((band) => band.status === 'seeded').map((b) => b.category)),
    ].sort();
    expect([...NATIVE_BAND_CATEGORIES].sort()).toEqual(seeded);
    // Today that is exactly the four canonical families.
    expect(seeded).toEqual([
      'chocolate_gelato',
      'milk_gelato',
      'protein_gelato',
      'sorbet',
      'vegan_gelato',
    ]);
  });

  it('every runtime-selectable template targets a NATIVE-banded category', () => {
    for (const template of listFormulationTemplates()) {
      expect(NATIVE_BAND_CATEGORIES, template.templateId).toContain(template.category);
    }
  });
});
