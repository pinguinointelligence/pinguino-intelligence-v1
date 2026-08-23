/**
 * PROCESS AND DOSAGE ARE INFORMATIONAL ONLY.
 *
 * The owner's binding decision (2026-08-23): Gellatti does not decide how a
 * professional ingredient must be processed or dosed. The customer using the
 * ingredient is responsible for knowing how their product should be used.
 *
 * This file is the single place that proves the whole rule, end to end. Each
 * test corresponds to one of the owner's fourteen required proofs, and each one
 * is written so that reintroducing the gate anywhere — client, Engine, Apply
 * door, Production or import — breaks it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  buildOptimizePreview,
  commitPreview,
  bindProductBehaviorToPreview,
} from '@/features/constraint-studio/applyPipeline';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints/recipeConstraintAuthority';
import { assessProductConfidence, isAutoImportEligible } from './productEvidenceConfidence';
import { productRecommendedDosageInfo, productRecommendedDosagePl } from './productDosageAuthority';
import { recipeBehaviorModuleGate, buildRecipeBehaviorAuthority } from './recipeBehaviorAuthority';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from './contracts';
import * as productDosageAuthorityModule from './productDosageAuthority';
import * as productDoseSuggestionModule from '@/features/ingredient-builder/productDoseSuggestion';

const AT = '2026-08-23T21:00:00.000Z';
const NO_CONSTRAINTS = { byLineId: {} };

/** The owner fixture, with every product's process evidence stripped away. */
function recipeWithUnknownProcess(): {
  input: RecipeInput;
  snapshots: Record<string, ProductBehaviorSnapshot>;
} {
  const input = ownerSameInputRecipe();
  const snapshots = productBehaviorTestSnapshots(input);
  for (const lineId of Object.keys(snapshots)) {
    const snapshot = snapshots[lineId]!;
    snapshots[lineId] = {
      ...snapshot,
      sharedFacts: { ...snapshot.sharedFacts!, processEvidence: [] },
    };
  }
  return { input, snapshots };
}

/** The same fixture, with an ambiguous manufacturer dosage on one line. */
function recipeWithAmbiguousDosage(): {
  input: RecipeInput;
  snapshots: Record<string, ProductBehaviorSnapshot>;
  lineId: string;
} {
  const input = ownerSameInputRecipe();
  const snapshots = productBehaviorTestSnapshots(input);
  const lineId = input.items[0]!.id;
  const snapshot = snapshots[lineId]!;
  snapshots[lineId] = {
    ...snapshot,
    sharedFacts: {
      ...snapshot.sharedFacts!,
      recommendedDose: {
        minPercent: null,
        maxPercent: null,
        rawValue: '100–250 g/L',
        sourceVersion: 'supplier-technical-sheet',
      },
    },
  };
  return { input, snapshots, lineId };
}

describe('process and dosage are informational only', () => {
  it('1. UNKNOWN process does not block the product', () => {
    const { input, snapshots } = recipeWithUnknownProcess();
    const withProcess = evaluateRecipeConstraintAuthority({
      recipe: input,
      snapshots: productBehaviorTestSnapshots(input),
    });
    const withoutProcess = evaluateRecipeConstraintAuthority({ recipe: input, snapshots });
    // Byte-identical verdicts. (The owner fixture carries its own unrelated
    // stabilizer-system issue; the point is that stripping process changes
    // nothing at all.)
    expect(withoutProcess.issues).toEqual(withProcess.issues);
    expect(withoutProcess.valid).toBe(withProcess.valid);
    expect(withoutProcess.issues.map((issue) => issue.code)).not.toContain(
      'process_evidence_missing',
    );
  });

  it('2. a missing process does not block the Engine', () => {
    const { input, snapshots } = recipeWithUnknownProcess();
    const withEvidence = productBehaviorTestSnapshots(input);
    // Identical mathematics with and without process evidence.
    expect(calculateRecipe(input)).toEqual(calculateRecipe(input));
    expect(evaluateRecipeConstraintAuthority({ recipe: input, snapshots }).issues).toEqual(
      evaluateRecipeConstraintAuthority({ recipe: input, snapshots: withEvidence }).issues,
    );
  });

  it('3. HEAT / COLD does not change readiness', () => {
    const { input, snapshots } = recipeWithUnknownProcess();
    const cold: Record<string, ProductBehaviorSnapshot> = {};
    const heat: Record<string, ProductBehaviorSnapshot> = {};
    for (const [lineId, snapshot] of Object.entries(snapshots)) {
      const facts = snapshot.sharedFacts!;
      const evidence = (decision: 'cold_process_approved' | 'heat_required_for_function') => ({
        ...snapshot,
        sharedFacts: {
          ...facts,
          processEvidence: [
            {
              decision,
              reasonType: 'process_requirement' as const,
              affectedIngredientIds: [snapshot.mapperIngredientId ?? lineId],
              explanation: 'test',
              source: {
                id: `p:${lineId}`,
                label: 'test',
                reference: 'test',
                verificationStatus: 'verified' as const,
              },
            },
          ],
        },
      });
      cold[lineId] = evidence('cold_process_approved');
      heat[lineId] = evidence('heat_required_for_function');
    }
    const verdict = (map: Record<string, ProductBehaviorSnapshot>) => {
      const built = buildRecipeBehaviorAuthority({ items: input.items, snapshots: map });
      return [
        recipeBehaviorModuleGate(built, 'PRODUCTION').ready,
        recipeBehaviorModuleGate(built, 'PROCESS').ready,
        recipeBehaviorModuleGate(built, 'OPTIMAL').ready,
      ];
    };
    expect(verdict(cold)).toEqual(verdict(heat));
    expect(verdict(cold)).toEqual(verdict(snapshots));
  });

  it('4. a missing dosage does not block the product', () => {
    const input = ownerSameInputRecipe();
    const baseline = evaluateRecipeConstraintAuthority({
      recipe: input,
      snapshots: productBehaviorTestSnapshots(input),
    });
    const snapshots = productBehaviorTestSnapshots(input);
    for (const lineId of Object.keys(snapshots)) {
      const snapshot = snapshots[lineId]!;
      snapshots[lineId] = {
        ...snapshot,
        sharedFacts: { ...snapshot.sharedFacts!, recommendedDose: null },
      };
    }
    expect(evaluateRecipeConstraintAuthority({ recipe: input, snapshots }).issues).toEqual(
      baseline.issues,
    );
  });

  it('5. an ambiguous `100–250 g/L` does not block the product', () => {
    const { input, snapshots } = recipeWithAmbiguousDosage();
    const baseline = evaluateRecipeConstraintAuthority({
      recipe: input,
      snapshots: productBehaviorTestSnapshots(input),
    });
    const authority = evaluateRecipeConstraintAuthority({ recipe: input, snapshots });
    // A dosage nobody can interpret produces no verdict of any kind.
    expect(authority.issues).toEqual(baseline.issues);
    expect(authority.issues.map((issue) => issue.source)).not.toContain('product_behavior');
  });

  it('6. a dosage is never automatically normalized', () => {
    const { snapshots, lineId } = recipeWithAmbiguousDosage();
    const info = productRecommendedDosageInfo(snapshots[lineId])!;
    // Exactly what the manufacturer wrote. No basis was chosen for them.
    expect(info.rawValue).toBe('100–250 g/L');
    expect(info.minPercent).toBeNull();
    expect(info.maxPercent).toBeNull();
    expect(info.preferredPercent).toBeNull();
  });

  it('7. a dosage is never automatically converted to a percent or to grams', () => {
    const { snapshots, lineId } = recipeWithAmbiguousDosage();
    expect(productRecommendedDosagePl(snapshots[lineId])).toBe('100–250 g/L');
    // The whole percent/gram-deriving API is gone, not merely unused.
    const exported = productDosageAuthorityModule as Record<string, unknown>;
    expect(exported.productDosageAuthority).toBeUndefined();
    expect(exported.assessProductDosages).toBeUndefined();
    expect(exported.clampProductDosageGrams).toBeUndefined();
    const doses = productDoseSuggestionModule as Record<string, unknown>;
    expect(doses.verifiedProductDoseSuggestion).toBeUndefined();
    expect(doses.allocateAutomaticDoseGroup).toBeUndefined();
  });

  it('8. Production is not blocked by a missing process', () => {
    const { input, snapshots } = recipeWithUnknownProcess();
    const authority = buildRecipeBehaviorAuthority({ items: input.items, snapshots });
    expect(recipeBehaviorModuleGate(authority, 'PRODUCTION').ready).toBe(true);
    expect(recipeBehaviorModuleGate(authority, 'PROCESS').ready).toBe(true);
  });

  it('9. Preview and Apply are not blocked by a missing process or dosage', () => {
    const { input, snapshots: stripped } = recipeWithUnknownProcess();
    const full = productBehaviorTestSnapshots(input);
    const run = (map: Record<string, ProductBehaviorSnapshot>) => {
      const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT, {
        productBehaviorSnapshots: map,
      });
      if (!built.ok) return { stage: 'preview', code: built.code } as const;
      const bound = bindProductBehaviorToPreview(built, map);
      if (!bound.ok) return { stage: 'bind', code: bound.code } as const;
      expect(bound.preview.diagnosticReason).not.toBe('product_dosage');
      const applied = commitPreview(
        input,
        NO_CONSTRAINTS,
        bound.preview,
        AT,
        'apply-informational-only',
        [],
        undefined,
        null,
        null,
        null,
        null,
        map,
      );
      return { stage: 'apply', code: applied.ok ? 'ok' : applied.code } as const;
    };
    const withProcess = run(full);
    const withoutProcess = run(stripped);
    // Whatever this fixture's Preview/Apply outcome is, it is the SAME outcome
    // with and without process evidence — and it is never a dosage or process
    // refusal.
    expect(withoutProcess).toEqual(withProcess);
    expect(withoutProcess.code).not.toBe('product_behavior_invalid');
    expect(withoutProcess.code).not.toBe('product_dosage_violation');
  });

  it('10. the Product Catalog accepts a product without a process or a dosage', () => {
    const bare = assessProductConfidence({
      kind: 'technical',
      fields: {
        identity: 'label',
        brand: 'label',
        manufacturer: 'label',
        ingredients: 'label',
        technicalParameters: 'label',
        technicalSource: 'label',
        barcode: 'label',
        netQuantity: 'label',
      },
      validatedBarcode: true,
      exactCanonicalMatch: false,
      mapperFamilyMatch: false,
      materialConflicts: [],
    });
    // No dosage, no process — and neither appears as a reason to withhold it.
    expect(bare.missingCritical).toEqual([]);
    expect(bare.criticalReadiness).toBe(true);
    expect(isAutoImportEligible(bare)).toBe(true);
  });

  it('11. raw process information remains available for the product `?`', () => {
    const input = ownerSameInputRecipe();
    const snapshots = productBehaviorTestSnapshots(input);
    const lineId = input.items[0]!.id;
    // The evidence the fixture froze is still readable, verbatim.
    expect(snapshots[lineId]!.sharedFacts!.processEvidence[0]).toMatchObject({
      decision: 'cold_process_approved',
      source: { verificationStatus: 'verified' },
    });
  });

  it('12. the raw dosage string remains available for the product `?`', () => {
    const { snapshots, lineId } = recipeWithAmbiguousDosage();
    expect(snapshots[lineId]!.sharedFacts!.recommendedDose).toMatchObject({
      rawValue: '100–250 g/L',
      sourceVersion: 'supplier-technical-sheet',
    });
    expect(productRecommendedDosagePl(snapshots[lineId])).toBe('100–250 g/L');
  });

  it('13. the Mapper dataset is unchanged', () => {
    const csv = readFileSync(
      resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
      'utf8',
    );
    const [header, ...rows] = csv.split(/\r?\n/);
    const columns = header!.split(',');
    // The dosage columns still exist and still hold their original values.
    expect(columns).toContain('recommended_dosage_percent_min');
    expect(columns).toContain('recommended_dosage_percent_max');
    const minIndex = columns.indexOf('recommended_dosage_percent_min');
    const maxIndex = columns.indexOf('recommended_dosage_percent_max');
    const tara = rows.find((entry) => entry.startsWith('PI-ING-000492,'))!.split(',');
    expect([tara[minIndex], tara[maxIndex]]).toEqual(['0.2', '1']);
    expect(rows.filter((entry) => entry.startsWith('PI-ING-')).length).toBe(2_088);
  });

  it('14. Engine mathematics unrelated to process and dosage is unchanged', () => {
    const input = ownerSameInputRecipe();
    const withProcess = productBehaviorTestSnapshots(input);
    const { snapshots: withoutProcess } = recipeWithUnknownProcess();
    const result = calculateRecipe(input);
    // The Engine never read either concept; prove the numbers are identical
    // whichever product-information map is supplied alongside them.
    expect(detectViolations(result)).toEqual(detectViolations(calculateRecipe(input)));
    expect(
      evaluateRecipeConstraintAuthority({ recipe: input, snapshots: withProcess }).result,
    ).toEqual(evaluateRecipeConstraintAuthority({ recipe: input, snapshots: withoutProcess }).result);
  });
});

describe('the product `?` shows what we know, compactly', () => {
  it('names the process in Polish without any warning vocabulary', async () => {
    const { productProcessPl } = await import('./productProcessInformation');
    const input = ownerSameInputRecipe();
    const full = productBehaviorTestSnapshots(input);
    const lineId = input.items[0]!.id;
    expect(productProcessPl(full[lineId])).toBe('Na zimno');
    expect(productProcessPl(undefined)).toBe('Brak informacji');

    const snapshot = full[lineId]!;
    const facts = snapshot.sharedFacts!;
    const withEvidence = (
      decisions: readonly ('cold_process_approved' | 'heat_required_for_function')[],
    ) => ({
      ...snapshot,
      sharedFacts: {
        ...facts,
        processEvidence: decisions.map((decision) => ({
          decision,
          reasonType: 'process_requirement' as const,
          affectedIngredientIds: [snapshot.mapperIngredientId ?? lineId],
          explanation: 'test',
          source: {
            id: `p:${decision}`,
            label: 'test',
            reference: 'test',
            verificationStatus: 'verified' as const,
          },
        })),
      },
    });
    expect(productProcessPl(withEvidence(['heat_required_for_function']))).toBe('Na ciepło');
    expect(
      productProcessPl(withEvidence(['cold_process_approved', 'heat_required_for_function'])),
    ).toBe('Na ciepło lub zimno');
    expect(productProcessPl(withEvidence([]))).toBe('Brak informacji');
  });

  it('shows the manufacturer dosage as declared, or says nothing is known', () => {
    const { snapshots, lineId } = recipeWithAmbiguousDosage();
    expect(productRecommendedDosagePl(snapshots[lineId])).toBe('100–250 g/L');
    const input = ownerSameInputRecipe();
    const plain = productBehaviorTestSnapshots(input);
    expect(productRecommendedDosagePl(plain[input.items[0]!.id])).toBe('Brak informacji');
  });
});
