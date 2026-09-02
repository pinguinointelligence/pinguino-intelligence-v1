import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateServerResult } from '../../../supabase/functions/_shared/productScanner';
import {
  adaptTextImportRow,
  parseTextImportTable,
  TextImportAdapterError,
} from './textImportAdapter';

const EVIDENCE_FIELDS = [
  'identity.displayName',
  'identity.brand',
  'package.netQuantity',
  'nutrition.energyKcal',
  'nutrition.fat',
  'nutrition.carbohydrate',
  'nutrition.protein',
  'nutrition.salt',
  'ingredientsText',
  'allergensText',
].join(';');

const headers = [
  'Product ID',
  'Country Code',
  'Category',
  'Brand',
  'Product Name Original',
  'Variant Original',
  'Manufacturer',
  'Net Quantity Value',
  'Net Quantity Unit',
  'Ingredients Original',
  'Allergens',
  'Nutrition Basis',
  'Energy kJ',
  'Energy kcal',
  'Fat g',
  'Saturated Fat g',
  'Carbohydrates g',
  'Sugars g',
  'Fibre g',
  'Protein g',
  'Salt g',
  'EAN / GTIN',
  'Country of Origin',
  'Professional Dosage',
  'Technical Parameters',
  'Primary Source URL',
  'Evidence Source Type',
  'Evidence Source Title',
  'Evidence Fields',
] as const;

const completeRow = [
  'PL-BIE-00162',
  'PL',
  'Bakery & sweets',
  'Baitz',
  'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
  'kokos',
  'not_found',
  '50',
  'g',
  'czekolada mleczna 27% (cukier, tłuszcz kakaowy, mleko pełne w proszku, miazga kakaowa), cukier, wiórki kokosowe 24,5%',
  'mleko; zboża zawierające gluten; soja; orzeszki ziemne; orzechy; sezam',
  '100 g',
  '2013',
  '481',
  '25',
  '20',
  '58',
  '50',
  '4',
  '4.1',
  '0.07',
  'not_found',
  'not_found',
  'not_applicable',
  'not_applicable',
  'https://www.biedronka.pl/pl/baitz',
  'retailer',
  'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
  EVIDENCE_FIELDS,
] as const;

const secondCompleteRow = [
  'PL-BIE-00158',
  'PL',
  'Bakery & sweets',
  'Baitz',
  'Caramel & Peanuts Waffle Baitz',
  'karmel i orzeszki ziemne',
  'not_found',
  '73',
  'g',
  'cukier, wafel z kremem kakaowym, tłuszcz kakaowy, mleko w proszku, orzeszki arachidowe 5,9%',
  'mleko; orzeszki ziemne; orzechy laskowe; orzechy; jaja',
  '100 g',
  '2182',
  '523',
  '31',
  '17',
  '52',
  '44',
  '1.9',
  '7.4',
  '0.41',
  'not_found',
  'not_found',
  'not_applicable',
  'not_applicable',
  'https://www.biedronka.pl/pl/baitz',
  'retailer',
  'Caramel & Peanuts Waffle Baitz',
  EVIDENCE_FIELDS,
] as const;

const incompleteRow = [
  'PL-BIE-00163',
  'PL',
  'Bakery & sweets',
  'Baitz',
  'Chrupiące herbatniki Baitz Czeko Sandwich z nadzieniem z czekolady mlecznej',
  'nadzienie z czekolady mlecznej',
  'not_found',
  '168',
  'g',
  'not_found',
  'not_found',
  '100 g',
  '2152',
  '514',
  '26',
  '14',
  '64',
  '32',
  '0.8',
  '6.7',
  '0.43',
  'not_found',
  'not_found',
  'not_applicable',
  'not_applicable',
  'https://www.biedronka.pl/pl/baitz',
  'retailer',
  'Chrupiące herbatniki Baitz Czeko Sandwich z nadzieniem z czekolady mlecznej',
  [
    'identity.displayName',
    'identity.brand',
    'package.netQuantity',
    'nutrition.energyKcal',
    'nutrition.fat',
    'nutrition.carbohydrate',
    'nutrition.protein',
    'nutrition.salt',
  ].join(';'),
] as const;

const tsv = (...rows: readonly (readonly string[])[]): string =>
  [headers, ...rows].map((row) => row.join('\t')).join('\n');

describe('TEXTIMPORT adapter — exact Scanner input seam', () => {
  it('parses pasted Poland rows and preserves row order', () => {
    const parsed = parseTextImportTable(tsv(completeRow, incompleteRow));
    expect(parsed.map((row) => [row.rowIndex, row.cells['Product ID']])).toEqual([
      [1, 'PL-BIE-00162'],
      [2, 'PL-BIE-00163'],
    ]);
  });

  it('converts a Poland row to the complete current ProductScanResult contract', () => {
    const output = adaptTextImportRow(parseTextImportTable(tsv(completeRow))[0]!);
    expect(output.adapterVersion).toBe('gellatti_textimport_adapter_v1');
    expect(output.sourceRowId).toBe('PL-BIE-00162');
    expect(output.scannerInput).toMatchObject({
      schemaVersion: 'gellatti_product_scan_v1',
      identity: {
        displayName: 'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
        originalName: 'Baton w czekoladzie mlecznej z wiórkami kokosowymi Baitz Choco Cocos',
        brand: 'Baitz',
        category: 'Bakery & sweets',
        variant: 'kokos',
      },
      package: { netQuantity: 50, unit: 'g', netQuantityText: '50 g' },
      barcodes: [],
      nutrition: {
        basis: 'per_100g',
        energyKj: 2013,
        energyKcal: 481,
        fat: 25,
        saturatedFat: 20,
        carbohydrate: 58,
        sugars: 50,
        fibre: 4,
        protein: 4.1,
        salt: 0.07,
      },
      productionDeclarations: {
        alcoholAbv: null,
        cocoaButterPercent: null,
        cocoaSolidsPercent: null,
        fruitContentPercent: null,
        brix: null,
        concentrationText: null,
        dosageText: null,
        technicalParametersText: null,
        formDeclaration: null,
      },
      externalSources: [
        {
          sourceType: 'retailer',
          url: 'https://www.biedronka.pl/pl/baitz',
          fieldsUsed: EVIDENCE_FIELDS.split(';'),
        },
      ],
      evidence: [],
      conflicts: [],
      warnings: [],
    });
  });

  it('leaves missing facts null and lets the existing Scanner validator classify them', () => {
    const output = adaptTextImportRow(parseTextImportTable(tsv(incompleteRow))[0]!);
    expect(output.scannerInput.ingredientsText).toBeNull();
    expect(output.scannerInput.allergensText).toBeNull();
    expect(output.scannerInput.barcodes).toEqual([]);
    expect(validateServerResult(output.scannerInput, [])).toMatchObject({
      ok: true,
      overlayState: 'SCAN_DRAFT',
      missingCriticalFields: expect.arrayContaining(['ingredientsText', 'allergen_confirmation']),
    });
  });

  it('passes all three rows one-by-one into the existing Scanner validator', () => {
    const proof = parseTextImportTable(tsv(completeRow, secondCompleteRow, incompleteRow)).map(
      (row) => {
        const adapter = adaptTextImportRow(row);
        return [adapter.sourceRowId, validateServerResult(adapter.scannerInput, [])] as const;
      },
    );
    expect(proof.map(([id]) => id)).toEqual(['PL-BIE-00162', 'PL-BIE-00158', 'PL-BIE-00163']);
    expect(proof.map(([, scanner]) => scanner.overlayState)).toEqual([
      'PENDING_PUBLICATION',
      'PENDING_PUBLICATION',
      'SCAN_DRAFT',
    ]);
  });

  it('fails before Scanner input when a present number is not contract-compatible', () => {
    const invalid = [...completeRow];
    invalid[13] = 'four hundred eighty one';
    const row = parseTextImportTable(tsv(invalid))[0]!;
    expect(() => adaptTextImportRow(row)).toThrowError(TextImportAdapterError);
    expect(() => adaptTextImportRow(row)).toThrow(/Energy kcal/);
  });
});

describe('TEXTIMPORT architecture boundary', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

  it('contains no independent post-Scanner product pipeline', () => {
    const adapter = read('src/features/product-textimport/textImportAdapter.ts');
    expect(adapter).toContain("from '@/features/product-scanner/contracts'");
    expect(adapter).toContain("from '@/features/product-scanner/barcode'");
    expect(adapter).not.toMatch(
      /intimport|research|mapper|productBehavior|accuracy|materiality|readiness|dedup|threshold|blocker/i,
    );
  });

  it('uses only the existing Scanner validator plus a service-only session transport', () => {
    const edge = read('supabase/functions/product-textimport-adapt/index.ts');
    const migration = read(
      'supabase/migrations/20260828100000_product_textimport_session_adapter.sql',
    );
    expect(edge).toContain('validateServerResult(result, [])');
    expect(edge).toContain("service.rpc('create_product_textimport_session_v1'");
    expect(edge).not.toMatch(
      /customerProductProfile|ProductBehavior|ProductAccuracy|mapper_basement/i,
    );
    expect(edge).not.toContain('gellatti_upsert_customer_added_product_v1');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/mapper_basement|product_accuracy|product_behavior/i);
    expect(migration).not.toMatch(/to authenticated/i);
  });

  it('keeps EAN resolution before Scanner and delegates research to the existing provider', () => {
    const resolver = read('supabase/functions/product-textimport-ean-resolve/index.ts');
    const handoff = read('src/features/product-textimport/textImportEanResolver.ts');
    expect(resolver).toContain('/functions/v1/intimport-enrich');
    expect(resolver).toContain("fields: ['barcode']");
    expect(resolver).toContain('normalizeValidatedEan');
    expect(handoff).toContain('validateBarcode(resolution.ean)');
    expect(resolver).not.toMatch(
      /product-scan-finalize|gellatti_upsert_customer_added_product_v1|customerProductProfile|ProductBehavior|ProductAccuracy|mapper_basement/i,
    );
  });
});
