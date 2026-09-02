/**
 * The workbook adapter must choose a sheet by evidence, never by guesswork.
 */
import { describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { INTIMPORT_COLUMNS } from './intimport';
import {
  IntimportSheetAmbiguousError,
  intimportWorkbookSheets,
  intimportWorkbookToCsv,
  isWorkbookFile,
  OWNER_SEMANTIC_POPULATION,
  OWNER_SEMANTIC_SHEET,
} from './intimportWorkbook';

const book = (sheets: Record<string, unknown[][]>) => {
  const wb = xlsx.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), name);
  }
  return xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};
const FULL = [...INTIMPORT_COLUMNS] as string[];
const PARTIAL = FULL.slice(0, 14);

describe('intimport workbook adapter', () => {
  it('recognises a workbook by name or mime type', () => {
    expect(isWorkbookFile('PL_Poland.xlsx')).toBe(true);
    expect(isWorkbookFile('x.csv')).toBe(false);
    expect(
      isWorkbookFile('x', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe(true);
  });

  it('picks the sheet covering more of the schema, without asking', () => {
    const data = book({
      'Import View': [PARTIAL, PARTIAL.map(() => 'x')],
      Products: [FULL, FULL.map(() => 'y')],
    });
    const sheets = intimportWorkbookSheets(data);
    expect(sheets.bestIsUnambiguous).toBe(true);
    expect(intimportWorkbookToCsv(data).sheet).toBe('Products');
  });

  it('refuses to guess between two equally complete sheets', () => {
    const data = book({ A: [FULL, FULL.map(() => '1')], B: [FULL, FULL.map(() => '2')] });
    expect(() => intimportWorkbookToCsv(data)).toThrow(IntimportSheetAmbiguousError);
  });

  it('honours an explicit sheet choice', () => {
    const data = book({ A: [FULL, FULL.map(() => '1')], B: [FULL, FULL.map(() => '2')] });
    expect(intimportWorkbookToCsv(data, 'B').csv).toContain('2');
  });

  it('emits the canonical header row as CSV', () => {
    const data = book({ Products: [FULL, FULL.map(() => 'v')] });
    expect(intimportWorkbookToCsv(data).csv.split('\n')[0]).toContain('Product ID');
  });

  it('uses exactly the 731 owner-retained semantic rows and excludes the other master rows', () => {
    const semanticHeader = [
      'row_number',
      'original_row_number',
      'source_product_id',
      'owner_role_code',
      'usage_role',
      'brand',
      'product_name',
      'variant',
      'source_category',
      'source_subcategory',
      'whole_product_group',
      'semantic_family',
      'physical_form',
      'material_key',
      'donor_group',
      'codex_guesser_allowed',
      'guesser_scope',
      'donor_match_rule',
      'classification_confidence_pct',
      'classification_basis',
      'classification_source_url',
      'semantic_review_required',
    ];
    const semanticRows = Array.from({ length: OWNER_SEMANTIC_POPULATION }, (_, index) => [
      index + 1,
      index + 3,
      `KEEP-${String(index + 1).padStart(3, '0')}`,
      index % 3 === 0 ? 'T' : 'S',
      index % 3 === 0 ? 'TOPPING_ONLY' : 'BASE_ONLY',
      'Brand',
      `Product ${index + 1}`,
      null,
      'Food',
      'Food',
      'FOOD',
      index % 3 === 0 ? 'CONFECTIONERY_BAR' : 'CREAM',
      index % 3 === 0 ? 'SOLID_PIECES' : 'DAIRY_LIQUID',
      'NEUTRAL_OR_OTHER',
      'FOOD',
      false,
      'LABEL_ONLY',
      'Exact owner row',
      97,
      'owner fixture',
      null,
      false,
    ]);
    const masterHeader = [
      'source_product_id',
      'market_country_code',
      'source_category',
      'source_subcategory',
      'product_type',
      'brand',
      'product_name_original',
      'total_net_quantity_value',
      'total_net_quantity_unit',
      'primary_source_url',
    ];
    const keptMaster = semanticRows.map((row, index) => [
      row[2],
      'PL',
      'Food',
      'Food',
      'retail',
      'Brand',
      `Product ${index + 1}`,
      100,
      'g',
      `https://example.test/keep-${index + 1}`,
    ]);
    const discardedMaster = Array.from({ length: 89 }, (_, index) => [
      `DROP-${index + 1}`,
      'PL',
      'Discarded',
      'Discarded',
      'retail',
      'Old',
      `Discarded ${index + 1}`,
      1,
      'g',
      null,
    ]);
    const data = book({
      [OWNER_SEMANTIC_SHEET]: [['semantic title'], semanticHeader, ...semanticRows],
      '01_PRODUCTS_MASTER': [masterHeader, ...keptMaster, ...discardedMaster],
    });

    const converted = intimportWorkbookToCsv(data);
    expect(converted.sheet).toBe(OWNER_SEMANTIC_SHEET);
    expect(converted.ownerClassifications).toHaveLength(731);
    expect(converted.csv).toContain('KEEP-731');
    expect(converted.csv).not.toContain('DROP-1');
    expect(converted.ownerClassifications[0]).toMatchObject({
      sourceProductId: 'KEEP-001',
      roleCode: 'T',
      usageRole: 'TOPPING_ONLY',
    });
  });
});
