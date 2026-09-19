import { describe, expect, it } from 'vitest';
import {
  buildAccumulatedScannerEvidence,
  researchFieldsForScannerGaps,
  sanitizeAccumulatedScannerEvidence,
} from '../../../supabase/functions/_shared/scannerRescuePipeline';

describe('Scanner rescue-first AI handoff', () => {
  it('SCN-AI-01 asks only for still-missing source facts', () => {
    expect(
      researchFieldsForScannerGaps([
        'MISSING_WATER_PERCENT',
        'MISSING_TOTAL_SOLIDS_PERCENT',
        'UNRESOLVED_SWEETENING_FREEZING_PATH',
        'INGREDIENTS_EVIDENCE_REQUIRED',
      ]),
    ).toEqual(['waterPercent', 'totalSolidsPercent', 'technicalParameters']);
  });

  it('SCN-AI-02 carries hard facts, photo evidence, semantics, Rescue estimates and conflicts', () => {
    const payload = buildAccumulatedScannerEvidence({
      scanResult: {
        identity: { displayName: 'Queso fresco batido', brand: 'Hacendado' },
        nutrition: { basis: 'per_100g', protein: 8 },
        ingredientsText: 'Leche desnatada, fermentos lácticos',
        evidence: [{ field: 'ingredientsText', source: 'label', assetId: 'photo-1' }],
        externalSources: [{ url: 'https://example.test/8480000510716' }],
        conflicts: [{ field: 'nutrition.protein', retainedSource: null }],
      },
      recognition: {
        ingredientFamily: 'dairy_liquid',
        physicalForm: 'LIQUID',
        intendedUsageRole: 'BASE_ONLY',
        compatibleMapperCategories: ['dairy'],
      },
      fieldTruth: {
        fat_percent: {
          value: 0.2,
          state: 'VERIFIED',
          basis: 'product_declared',
          confidence: 1,
        },
        water_percent: {
          value: 87.4,
          state: 'ESTIMATED',
          basis: 'mapper_rescue_estimate',
          confidence: 0.84,
        },
      },
      unresolvedFields: ['MISSING_TOTAL_SOLIDS_PERCENT'],
    });

    expect(payload.scanResult).toMatchObject({
      identity: { displayName: 'Queso fresco batido', brand: 'Hacendado' },
      ingredientsText: 'Leche desnatada, fermentos lácticos',
    });
    expect(payload.photoEvidence).toEqual([
      expect.objectContaining({ field: 'ingredientsText', source: 'label' }),
    ]);
    expect(payload.recognition).toMatchObject({
      ingredientFamily: 'dairy_liquid',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(payload.knownTechnicalFacts).toMatchObject({ fat_percent: { value: 0.2 } });
    expect(payload.rescueEstimates).toMatchObject({ water_percent: { value: 87.4 } });
    expect(payload.unresolvedFields).toEqual(['MISSING_TOTAL_SOLIDS_PERCENT']);
    expect(payload.conflicts).toEqual([expect.objectContaining({ field: 'nutrition.protein' })]);
  });

  it('SCN-AI-03 emits only the Owner-approved product evidence allowlist', () => {
    const payload = buildAccumulatedScannerEvidence({
      scanResult: {
        identity: {
          displayName: 'Queso fresco batido',
          brand: 'Hacendado',
          privateNote: 'never send this',
        },
        nutrition: { basis: 'per_100g', protein: 8, userPrice: 2.99 },
        ingredientsText: 'Leche desnatada, fermentos lácticos',
        recipe: { name: 'private recipe' },
        supplier: 'private supplier',
        inventory: 14,
        account: { email: 'owner@example.test' },
        evidence: [
          {
            field: 'ingredientsText',
            source: 'label',
            rawText: 'Leche desnatada, fermentos lácticos',
            privateStorageUrl: 'https://private.example.test/photo.jpg',
          },
        ],
      },
      recognition: {
        ingredientFamily: 'dairy_liquid',
        physicalForm: 'LIQUID',
        intendedUsageRole: 'BASE_ONLY',
        accountId: 'private-account-id',
      },
      fieldTruth: {},
      unresolvedFields: ['MISSING_TOTAL_SOLIDS_PERCENT'],
      readinessContext: {
        ready: false,
        criticalBlockers: ['MISSING_TOTAL_SOLIDS_PERCENT'],
        customerHistory: ['private'],
      },
    });

    expect(payload).toEqual(sanitizeAccumulatedScannerEvidence(payload));
    expect(JSON.stringify(payload)).not.toContain('never send this');
    expect(JSON.stringify(payload)).not.toContain('private recipe');
    expect(JSON.stringify(payload)).not.toContain('private supplier');
    expect(JSON.stringify(payload)).not.toContain('owner@example.test');
    expect(JSON.stringify(payload)).not.toContain('private-account-id');
    expect(JSON.stringify(payload)).not.toContain('private.example.test');
    expect(payload.scanResult).toMatchObject({
      identity: { displayName: 'Queso fresco batido', brand: 'Hacendado' },
      nutrition: { basis: 'per_100g', protein: 8 },
    });
    expect(payload.readinessContext).toEqual({
      ready: false,
      criticalBlockers: ['MISSING_TOTAL_SOLIDS_PERCENT'],
    });
  });
});
