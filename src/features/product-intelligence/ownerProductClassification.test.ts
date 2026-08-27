import { describe, expect, it } from 'vitest';
import { INTIMPORT_COLUMNS, parseINTIMPORT } from '@/data/products/intimport';
import { planIntimportImport, runIntimportLocalIntelligence } from './intimportIntelligence';
import {
  applyOwnerProductClassification,
  parseOwnerProductClassification,
  type OwnerProductClassification,
} from './ownerProductClassification';
import { classifyProductSemantics, type ProductSemanticEvidence } from './productRecognition';

const evidence: ProductSemanticEvidence = {
  name: 'Broad retailer article',
  brand: 'Brand',
  manufacturer: null,
  manufacturerCode: null,
  gtin: null,
  productType: 'retail',
  category: 'Bakery & sweets',
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
};

const owner: OwnerProductClassification = {
  authority: 'OWNER_SEMANTIC_CLASSIFICATION_V1',
  sourceProductId: 'PL-TEST-1',
  roleCode: 'T',
  usageRole: 'TOPPING_ONLY',
  wholeProductGroup: 'BAKERY_SWEETS',
  semanticFamily: 'WAFER_CONFECTIONERY',
  physicalForm: 'SOLID_PIECES',
  materialKey: 'CHOCOLATE',
  donorGroup: 'WAFER_CONFECTIONERY|CHOCOLATE',
  guesserAllowed: false,
  guesserScope: 'LABEL_ONLY_NO_TECHNICAL_GUESSER',
  donorMatchRule: 'Do not run technical inference.',
  confidence: 0.97,
  basis: 'owner fixture',
  sourceUrl: null,
  reviewRequired: false,
};

describe('owner semantic classification', () => {
  it('strictly validates matching S/T/O and expanded role', () => {
    expect(parseOwnerProductClassification(owner)).toEqual(owner);
    expect(parseOwnerProductClassification({ ...owner, usageRole: 'BASE_ONLY' })).toBeNull();
  });

  it('overrides broad retailer taxonomy with the exact owner role/family/form', () => {
    const result = applyOwnerProductClassification(
      evidence,
      owner,
      classifyProductSemantics(evidence),
    );
    expect(result).toMatchObject({
      classificationSource: 'OWNER_CONFIRMED',
      productArchetype: 'CONFECTIONERY',
      ingredientFamily: 'confectionery',
      physicalForm: 'SOLID',
      intendedUsageRole: 'TOPPING_ONLY',
      modelRequired: false,
    });
  });

  it('travels with the normalized Product Intelligence proposal to the shared server authority', () => {
    const values = Object.fromEntries(INTIMPORT_COLUMNS.map((column) => [column, '']));
    Object.assign(values, {
      'Product ID': owner.sourceProductId,
      'Country Code': 'PL',
      Category: 'Bakery & sweets',
      'Product Type': 'retail',
      Brand: 'Brand',
      'Product Name Original': 'Broad retailer article',
      'Net Quantity Value': '100',
      'Net Quantity Unit': 'g',
      'Primary Source URL': 'https://example.test/product',
    });
    const csv = [
      INTIMPORT_COLUMNS.join(','),
      INTIMPORT_COLUMNS.map((column) => String(values[column] ?? '')).join(','),
    ].join('\n');
    const parsed = parseINTIMPORT(csv);
    const rows = runIntimportLocalIntelligence(
      parsed.candidates,
      {},
      null,
      new Map(),
      new Map(),
      new Map(),
      new Map([[1, owner]]),
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ownerClassification).toEqual(owner);
    expect(rows[0]?.recognition.intendedUsageRole).toBe('TOPPING_ONLY');
    const proposal = (
      planIntimportImport(rows).rows[0]?.insert.extracted_json as Record<string, unknown>
    ).productIntelligence as Record<string, unknown>;
    expect(
      (proposal.intimportProductProfileProposal as Record<string, unknown>).ownerClassification,
    ).toEqual(owner);
  });
});
