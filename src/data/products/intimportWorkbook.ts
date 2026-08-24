/**
 * XLSX → INTIMPORT input adapter.
 *
 * An owner should not have to re-save their catalogue as CSV before importing
 * it. This is ONLY an input adapter: a workbook is turned into exactly the CSV
 * text the existing 36-column parser already reads, and everything downstream —
 * validation, Product Intelligence, the Mapper, dedup and the import itself —
 * runs unchanged and cannot tell which format it came from.
 *
 * Pure: no IO, no network. The caller supplies the bytes.
 */
import * as xlsx from 'xlsx';
import { INTIMPORT_COLUMNS } from './intimport';

/**
 * The floor for a sheet to be an INTIMPORT sheet at all. Deliberately low: it
 * only has to exclude the neighbouring sheets that share a handful of generic
 * columns (Offers, Evidence, Stores each carry 3-4).
 *
 * WHICH sheet is then chosen is decided by COVERAGE rather than by this number,
 * because a threshold is guesswork the moment a workbook changes shape. The
 * owner's own file makes the point: „Products" carries all 36 canonical
 * headers and the partial „Import View" carries 23, so the winner is obvious by
 * comparison and would be a coin-toss under any fixed cut-off near 20.
 */
const REQUIRED_HEADER_MATCHES = 12;

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase();

const CANONICAL_HEADERS = new Set(INTIMPORT_COLUMNS.map((column) => normalizeHeader(column)));

/** The recognised INTIMPORT headers present in a sheet's first row. */
export function intimportHeaderMatches(sheet: xlsx.WorkSheet): number {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const header = rows[0];
  if (!Array.isArray(header)) return 0;
  const seen = new Set<string>();
  for (const cell of header) {
    const name = normalizeHeader(cell);
    if (CANONICAL_HEADERS.has(name)) seen.add(name);
  }
  return seen.size;
}

export interface IntimportWorkbookSheets {
  /** Sheets carrying the INTIMPORT header row, best match first. */
  candidates: string[];
  /** The best candidate covers strictly more of the schema than any other. */
  bestIsUnambiguous: boolean;
  /** Every sheet in the workbook, for a selector. */
  all: string[];
}

export function intimportWorkbookSheets(data: ArrayBuffer | Uint8Array): IntimportWorkbookSheets {
  const workbook = xlsx.read(data, { type: 'array' });
  const scored = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return { name, matches: sheet ? intimportHeaderMatches(sheet) : 0 };
  });
  const ranked = scored
    .filter((entry) => entry.matches >= REQUIRED_HEADER_MATCHES)
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  return {
    candidates: ranked.map((entry) => entry.name),
    // A single best sheet is not a guess: it carries strictly more of the
    // schema than anything else in the book. Only a TIE is ambiguous.
    bestIsUnambiguous:
      ranked.length > 0 && (ranked.length === 1 || ranked[0]!.matches > ranked[1]!.matches),
    all: workbook.SheetNames,
  };
}

export class IntimportSheetAmbiguousError extends Error {
  constructor(readonly sheets: string[]) {
    super(`Wybierz arkusz: ${sheets.join(', ')}`);
    this.name = 'IntimportSheetAmbiguousError';
  }
}

/**
 * The workbook as canonical INTIMPORT CSV.
 *
 * Numbers are emitted RAW, not as the sheet displays them. A cell holding 14
 * displays as „14.00" under a two-decimal format, and package size is part of
 * the catalogue's canonical identity — so display formatting would make the
 * same product a different product depending on which file it arrived in, and
 * a re-import would duplicate the catalogue rather than reuse it. On the
 * owner's file that was 788 rows: „14.00 g × 1.00" against „14 g".
 *
 * When several sheets carry the INTIMPORT headers this REFUSES to guess and
 * asks the caller to choose.
 */
export function intimportWorkbookToCsv(
  data: ArrayBuffer | Uint8Array,
  sheetName?: string,
): { csv: string; sheet: string; candidates: string[] } {
  const workbook = xlsx.read(data, { type: 'array' });
  const { candidates, bestIsUnambiguous, all } = intimportWorkbookSheets(data);

  let chosen = sheetName;
  if (!chosen) {
    if (bestIsUnambiguous) chosen = candidates[0];
    else if (candidates.length > 1) throw new IntimportSheetAmbiguousError(candidates);
    else if (all.length === 1) chosen = all[0];
    else throw new IntimportSheetAmbiguousError(all);
  }

  const sheet = workbook.Sheets[chosen!];
  if (!sheet) throw new Error(`Arkusz „${chosen}" nie istnieje w tym pliku.`);
  const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false, rawNumbers: true });
  return { csv, sheet: chosen!, candidates };
}

/** True when the file should be read as a workbook rather than as text. */
export function isWorkbookFile(name: string, type?: string): boolean {
  return (
    /\.xlsx$/i.test(name) ||
    /\.xlsm$/i.test(name) ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
