import { describe, expect, it } from 'vitest';

import {
  PRODUCT_SCAN_RESPONSE_SCHEMA,
  mergeProductScanResults,
  parseStructuredProviderOutput,
} from '../../../supabase/functions/_shared/productScanner';
import {
  INTIMPORT_ENRICHMENT_SCHEMA,
  classifyIntimportEnrichment,
} from './intimportEnrichmentOutcome';

const output = (value: unknown) => ({ status: 'completed', output_text: JSON.stringify(value) });
const labelResult = () => ({
  schemaVersion: 'gellatti_product_scan_v1',
  identity: {
    displayName: 'Clásica café soluble',
    originalName: null,
    brand: 'Hacendado',
    explicitlyUnbranded: false,
    category: null,
    variant: null,
    countryOfOrigin: null,
    labelLanguages: ['es'],
  },
  package: { netQuantity: 200, unit: 'g', netQuantityText: '200 g' },
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
  productionDeclarations: {
    alcoholAbv: null,
    cocoaButterPercent: null,
    cocoaSolidsPercent: null,
    fruitContentPercent: null,
    brix: null,
    waterPercent: null,
    totalSolidsPercent: null,
    concentrationText: null,
    dosageText: null,
    technicalParametersText: null,
    formDeclaration: null,
  },
  ingredientsText: null,
  allergensText: null,
  mayContainAllergens: [],
  claims: [],
  storageInstructions: null,
  manufacturer: null,
  externalSources: [],
  evidence: [],
  missingFields: ['nutrition'],
  conflicts: [],
  warnings: [],
});

describe('Scanner 1.5 structured model output validation', () => {
  it('S15-FIX-09 fallback empty, malformed and refusal outputs are typed failures', () => {
    expect(
      parseStructuredProviderOutput({ status: 'completed' }, INTIMPORT_ENRICHMENT_SCHEMA),
    ).toMatchObject({
      ok: false,
      reasonCode: 'missing_output',
    });
    expect(
      parseStructuredProviderOutput(
        { status: 'completed', output_text: '{' },
        INTIMPORT_ENRICHMENT_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'malformed_json' });
    expect(
      parseStructuredProviderOutput(
        {
          status: 'completed',
          output: [{ content: [{ type: 'refusal', refusal: 'cannot comply' }] }],
        },
        INTIMPORT_ENRICHMENT_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'model_refusal' });
    expect(
      classifyIntimportEnrichment({ sources: [], facts: [], notFound: [] }, ['brand']),
    ).toEqual({
      outcome: 'MALFORMED',
      reasonCode: 'enrichment_empty_outcome',
      completeness: 'NONE',
    });
  });

  it('S15-FIX-10 label model refusal is not a completed result', () => {
    expect(
      parseStructuredProviderOutput(
        {
          status: 'completed',
          output: [{ content: [{ type: 'refusal', refusal: 'safety refusal' }] }],
        },
        PRODUCT_SCAN_RESPONSE_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'model_refusal' });
    expect(
      parseStructuredProviderOutput(
        { status: 'incomplete', output_text: JSON.stringify(labelResult()) },
        PRODUCT_SCAN_RESPONSE_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'provider_incomplete' });
  });

  it('S15-FIX-11 label model empty output is not a completed result', () => {
    expect(
      parseStructuredProviderOutput(
        { status: 'completed', output: [] },
        PRODUCT_SCAN_RESPONSE_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'missing_output' });
  });

  it('S15-FIX-12 label malformed and schema-invalid JSON are rejected', () => {
    expect(
      parseStructuredProviderOutput(
        { status: 'completed', output_text: '{' },
        PRODUCT_SCAN_RESPONSE_SCHEMA,
      ),
    ).toMatchObject({ ok: false, reasonCode: 'malformed_json' });
    expect(parseStructuredProviderOutput(output({}), PRODUCT_SCAN_RESPONSE_SCHEMA)).toMatchObject({
      ok: false,
      reasonCode: 'schema_invalid',
    });
  });

  it('S15-FIX-13 a schema-valid partial label outcome remains valid', () => {
    const incoming = labelResult();
    const parsed = parseStructuredProviderOutput(output(incoming), PRODUCT_SCAN_RESPONSE_SCHEMA);
    expect(parsed).toEqual({ ok: true, value: incoming });
    const prior = { ...labelResult(), ingredientsText: 'Kawa rozpuszczalna.' };
    expect(mergeProductScanResults(prior, parsed.ok ? parsed.value : null)).toMatchObject({
      identity: { displayName: 'Clásica café soluble', brand: 'Hacendado' },
      package: { netQuantity: 200, unit: 'g' },
      ingredientsText: 'Kawa rozpuszczalna.',
    });
  });
});
