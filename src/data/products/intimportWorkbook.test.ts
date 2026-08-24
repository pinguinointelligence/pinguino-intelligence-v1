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
} from './intimportWorkbook';

const book = (sheets: Record<string, string[][]>) => {
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
});
