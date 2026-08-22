import { describe, expect, it } from 'vitest';
import {
  mergeProductScanResults,
  validateServerResult,
} from '../../../supabase/functions/_shared/productScanner';
import type { ProductScanResult } from './contracts';

/**
 * Named regressions for the two owner-reported real-product E2E failures.
 * These reproduce the exact observed sequences rather than synthetic shapes:
 * HARIBO Quaxi lost earlier evidence on an accurate continuation and offered a
 * malformed barcode; La Chocolatera stayed draft because a separate allergen
 * statement was treated as strictly mandatory even when the label carried
 * direct "może zawierać" evidence.
 */

type Evidence = ProductScanResult['evidence'][number];

const regionFor = (field: string): Evidence['region'] =>
  field.startsWith('nutrition.')
    ? 'nutrition_table'
    : field === 'ingredientsText'
      ? 'ingredients'
      : field === 'allergensText' || field === 'mayContainAllergens'
        ? 'allergen_statement'
        : field.startsWith('package.')
          ? 'package'
          : 'front';

const labelEvidence = (assetId: string, fields: readonly string[]): Evidence[] =>
  fields.map(
    (field) =>
      ({
        assetId,
        field,
        source: 'label',
        confidence: 'high',
        region: regionFor(field),
        directVisibility: true,
      }) as Evidence,
  );

const empty = (): Record<string, unknown> => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: null,
    originalName: null,
    brand: null,
    explicitlyUnbranded: false,
    category: null,
    variant: null,
    countryOfOrigin: null,
    labelLanguages: [],
  },
  package: { netQuantity: null, unit: null, netQuantityText: null },
  barcodes: [],
  nutrition: {
    basis: null,
    energyKj: null,
    energyKcal: null,
    fat: null,
    saturatedFat: null,
    carbohydrate: null,
    sugars: null,
    protein: null,
    salt: null,
    fibre: null,
  },
  ingredientsText: null,
  allergensText: null,
  mayContainAllergens: [],
  claims: [],
  storageInstructions: null,
  manufacturer: null,
  externalSources: [],
  evidence: [],
  missingFields: [],
  conflicts: [],
  warnings: [],
});

const nutrition = (root: Record<string, unknown>) => root.nutrition as Record<string, unknown>;
const identity = (root: Record<string, unknown>) => root.identity as Record<string, unknown>;

describe('HARIBO Quaxi cumulative-evidence regression', () => {
  // Fast pass: strong identity, valid EAN, allergen statement — no ingredients.
  const fastPass = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), { displayName: 'Quaxi', brand: 'HARIBO', labelLanguages: ['de'] });
    Object.assign(root.package as Record<string, unknown>, {
      netQuantity: 175,
      unit: 'g',
      netQuantityText: '175 g',
    });
    root.barcodes = [{ value: '4001686322536', format: 'EAN_13' }];
    Object.assign(nutrition(root), {
      basis: 'per_100g',
      energyKj: 1435,
      energyKcal: 338,
      fat: 0.5,
      saturatedFat: 0.2,
      carbohydrate: 77,
      sugars: 46,
      protein: 6.9,
      salt: 0.07,
    });
    root.allergensText = 'Może zawierać: pszenica.';
    root.mayContainAllergens = ['pszenica'];
    root.evidence = labelEvidence('asset-front', [
      'identity.displayName',
      'identity.brand',
      'package.netQuantity',
      'nutrition.energyKcal',
      'nutrition.fat',
      'nutrition.carbohydrate',
      'nutrition.protein',
      'nutrition.salt',
      'allergensText',
      'mayContainAllergens',
    ]);
    return root;
  };

  // Accurate continuation: finds ingredients, but drops the allergen statement,
  // emits a malformed EAN and disagrees on protein and salt.
  const accurateContinuation = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), { displayName: 'Quaxi', brand: 'HARIBO' });
    root.barcodes = [{ value: "4001686322536'}]},", format: 'EAN_13' }];
    root.ingredientsText =
      'Syrop glukozowy, cukier, żelatyna wieprzowa, kwas cytrynowy, aromaty, barwniki.';
    Object.assign(nutrition(root), { protein: 5.2, salt: 0.25 });
    root.evidence = labelEvidence('asset-back', [
      'ingredientsText',
      'nutrition.protein',
      'nutrition.salt',
    ]);
    return root;
  };

  const merged = mergeProductScanResults(fastPass(), accurateContinuation(), '4001686322536');

  it('preserves the validated EAN and rejects the malformed continuation candidate', () => {
    expect(merged.barcodes).toEqual([{ value: '4001686322536', format: 'EAN_13' }]);
    expect(merged.warnings).toContain('barcode_candidate_rejected');
  });

  it('never erases the earlier allergen evidence when a later call omits it', () => {
    expect(merged.allergensText).toBe('Może zawierać: pszenica.');
    expect(merged.mayContainAllergens).toContain('pszenica');
    expect(merged.evidence).toContainEqual(
      expect.objectContaining({ field: 'allergensText', assetId: 'asset-front' }),
    );
  });

  it('supplements the newly found ingredients without disturbing prior facts', () => {
    expect(merged.ingredientsText).toContain('żelatyna wieprzowa');
    expect(identity(merged).brand).toBe('HARIBO');
    expect(nutrition(merged).energyKcal).toBe(338);
  });

  it('records protein and salt disagreement as conflicts instead of last-call-wins', () => {
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(merged.conflicts).toContainEqual(expect.objectContaining({ field }));
    }
    // Equally specific direct label evidence from different assets cannot be
    // silently resolved, so the disputed value is withheld rather than guessed.
    expect(nutrition(merged).protein).toBeNull();
    expect(nutrition(merged).salt).toBeNull();
  });

  it('holds finalization on the unresolved critical nutrition conflicts', () => {
    const validation = validateServerResult(merged, ['asset-front', 'asset-back']);
    expect(validation.ok).toBe(true);
    expect(validation.overlayState).toBe('SCAN_DRAFT');
    expect(validation.missingCriticalFields).toEqual(
      expect.arrayContaining(['conflict_nutrition.protein', 'conflict_nutrition.salt']),
    );
  });

  it('finalizes once the requested confirmation image corroborates one reading', () => {
    const resolution = empty();
    Object.assign(nutrition(resolution), { protein: 6.9, salt: 0.07 });
    resolution.evidence = labelEvidence('asset-nutrition-closeup', [
      'nutrition.protein',
      'nutrition.salt',
    ]);
    const settled = mergeProductScanResults(merged, resolution, '4001686322536');
    expect(nutrition(settled).protein).toBe(6.9);
    expect(nutrition(settled).salt).toBe(0.07);
    // The disagreement stays on record; only the retained source is filled in.
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(settled.conflicts).toContainEqual(
        expect.objectContaining({ field, retainedSource: 'label' }),
      );
    }
    const validation = validateServerResult(settled, [
      'asset-front',
      'asset-back',
      'asset-nutrition-closeup',
    ]);
    expect(validation.missingCriticalFields).toEqual([]);
    expect(validation.overlayState).toBe('PENDING_PUBLICATION');
  });

  it('never mutates the prior session state it was handed', () => {
    const prior = fastPass();
    const snapshot = JSON.stringify(prior);
    mergeProductScanResults(prior, accurateContinuation(), '4001686322536');
    expect(JSON.stringify(prior)).toBe(snapshot);
  });

  it('does not let a weak indirect reading break a genuine label tie', () => {
    const weak = empty();
    Object.assign(nutrition(weak), { protein: 6.9, salt: 0.07 });
    weak.evidence = ['nutrition.protein', 'nutrition.salt'].map(
      (field) =>
        ({
          assetId: 'asset-retailer',
          field,
          source: 'retailer',
          confidence: 'high',
          region: 'nutrition_table',
          directVisibility: false,
        }) as Evidence,
    );
    const settled = mergeProductScanResults(merged, weak, '4001686322536');
    for (const field of ['nutrition.protein', 'nutrition.salt']) {
      expect(settled.conflicts).toContainEqual(
        expect.objectContaining({ field, retainedSource: null }),
      );
    }
    expect(validateServerResult(settled, ['asset-front', 'asset-back']).overlayState).toBe(
      'SCAN_DRAFT',
    );
  });
});

describe('La Chocolatera allergen readiness regression', () => {
  // Strong identity, nutrition and ingredients, but no separate allergen line —
  // only a directly visible "może zawierać" statement on the label.
  const scan = (): Record<string, unknown> => {
    const root = empty();
    Object.assign(identity(root), {
      displayName: 'La Chocolatera',
      brand: 'La Chocolatera',
      labelLanguages: ['es'],
    });
    Object.assign(root.package as Record<string, unknown>, {
      netQuantity: 1000,
      unit: 'g',
      netQuantityText: '1 kg',
    });
    Object.assign(nutrition(root), {
      basis: 'per_100g',
      energyKj: 2100,
      energyKcal: 502,
      fat: 30,
      saturatedFat: 18,
      carbohydrate: 52,
      sugars: 48,
      protein: 6,
      salt: 0.1,
    });
    root.ingredientsText = 'Cukier, kakao w proszku, tłuszcz kakaowy.';
    root.mayContainAllergens = ['mleko', 'orzechy'];
    root.evidence = labelEvidence('asset-1', [
      'identity.displayName',
      'identity.brand',
      'package.netQuantity',
      'nutrition.energyKcal',
      'nutrition.fat',
      'nutrition.carbohydrate',
      'nutrition.protein',
      'nutrition.salt',
      'ingredientsText',
      'mayContainAllergens',
    ]);
    return root;
  };

  it('derives the allergen summary from directly visible may-contain evidence', () => {
    const merged = mergeProductScanResults(null, scan());
    expect(merged.allergensText).toContain('mleko');
    expect(merged.warnings).toContain(
      'allergen_summary_derived_from_direct_may_contain_evidence',
    );
  });

  it('reaches a finalizable state instead of staying permanently draft', () => {
    const merged = mergeProductScanResults(null, scan());
    const validation = validateServerResult(merged, ['asset-1']);
    expect(validation.ok).toBe(true);
    expect(validation.missingCriticalFields).toEqual([]);
    expect(validation.overlayState).toBe('PENDING_PUBLICATION');
    expect(validation.highRiskAuthorityRequired).toBe(false);
  });

  it('still fails closed when the may-contain evidence is not directly visible', () => {
    const root = scan();
    root.evidence = (root.evidence as Evidence[]).map((item) =>
      item.field === 'mayContainAllergens'
        ? { ...item, source: 'retailer', directVisibility: false }
        : item,
    );
    const merged = mergeProductScanResults(null, root);
    expect(merged.allergensText).toBeNull();
    expect(validateServerResult(merged, ['asset-1']).missingCriticalFields).toContain(
      'allergen_confirmation',
    );
  });
});
