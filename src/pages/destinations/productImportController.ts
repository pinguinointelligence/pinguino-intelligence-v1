import { intimportWorkbookToCsv, isWorkbookFile } from '@/data/products/intimportWorkbook';
/**
 * Product import controller (Mapper Slice D5C4A) — the PURE, presentation-free logic
 * behind the CSV upload page. No React, no DB, no service: it wraps the existing pure
 * parser, derives the import gate, reads a chosen CSV file as text in the browser, and
 * normalizes errors. Kept dependency-light so it is unit-testable without a DOM.
 */
import { copy } from '@/copy/en';
import { blocksAutoVerify, detectRedFlags } from '@/data/products/productRedFlags';
import {
  parseProductTable,
  type ProductIntakeCandidate,
  type ProductIntakeResult,
  type ProductIntakeSource,
} from '@/data/products/productTableParser';
import {
  parseINTIMPORT,
  type IntimportExistingIndex,
  type IntimportResult,
} from '@/data/products/intimport';

const c = copy.productsImport;

export interface SourceOption {
  id: ProductIntakeSource;
  label: string;
}

/** The intake sources, in display order. Every source but INTIMPORT only stamps
 * source_type; INTIMPORT additionally routes to its own deterministic 36-column parser. */
export const SOURCE_OPTIONS: readonly SourceOption[] = [
  { id: 'generic', label: c.sources.generic },
  { id: 'mercadona', label: c.sources.mercadona },
  { id: 'colin', label: c.sources.colin },
  { id: 'intimport', label: c.sources.intimport },
];

export const DEFAULT_SOURCE: ProductIntakeSource = 'generic';

/**
 * Parse is allowed whenever the CSV box holds any non-whitespace text — from paste OR a
 * loaded file. It depends ONLY on the text (never on the file input, import, or auth state),
 * so signed-out users can still parse/preview.
 */
export function canParse(csvText: string): boolean {
  return csvText.trim() !== '';
}

/**
 * INTIMPORT rows that must never reach the writer. EXISTING and DUPLICATE rows are
 * importable-but-inert at the service layer (it re-checks identity); INVALID rows have no
 * usable identity at all, and REVIEW_REQUIRED rows are held for a human.
 */
const INTIMPORT_NOT_IMPORTABLE = new Set(['INVALID', 'REVIEW_REQUIRED', 'DUPLICATE', 'EXISTING']);

/** Adapt one INTIMPORT candidate onto the shared intake shape the writer consumes. */
function intimportToIntakeCandidate(
  candidate: IntimportResult['candidates'][number],
): ProductIntakeCandidate {
  const skip = INTIMPORT_NOT_IMPORTABLE.has(candidate.state);
  return {
    rowIndex: candidate.rowIndex,
    status: skip
      ? 'skip'
      : candidate.reasons.length > 0 || candidate.warnings.length > 0
        ? 'warning'
        : 'valid',
    insert: candidate.insert,
    warnings: [...candidate.warnings, ...candidate.reasons],
    skipReason: skip ? `${candidate.state}: ${candidate.reasons.join('; ')}` : null,
  };
}

/** The rich INTIMPORT preview. Pure and free — nothing here can trigger a paid call. */
export function parseIntimport(
  csvText: string,
  existing: IntimportExistingIndex = {},
): IntimportResult {
  return parseINTIMPORT(csvText, existing);
}

/** Project an INTIMPORT result onto the shared intake shape (for the existing writer). */
export function intimportToIntakeResult(result: IntimportResult): ProductIntakeResult {
  const candidates = result.candidates.map(intimportToIntakeCandidate);
  return {
    total: candidates.length,
    valid: candidates.filter((candidate) => candidate.status === 'valid').length,
    warnings: candidates.filter((candidate) => candidate.status === 'warning').length,
    skipped: candidates.filter((candidate) => candidate.status === 'skip').length,
    candidates,
  };
}

/** Parse CSV text into intake candidates for one source. Pure — never imports/writes. */
export function parseIntake(
  csvText: string,
  source: ProductIntakeSource,
  existing: IntimportExistingIndex = {},
): ProductIntakeResult {
  if (source === 'intimport') return intimportToIntakeResult(parseINTIMPORT(csvText, existing));
  return parseProductTable(csvText, source);
}

/** Rows the importer will actually try to create (skip rows are not importable). */
export function importableCount(result: ProductIntakeResult): number {
  return result.candidates.filter((candidate) => candidate.status !== 'skip').length;
}

/** Internal-only red-flag annotation for one importable candidate (admin preview). */
export interface IntakeRedFlagRow {
  rowIndex: number;
  codes: string[];
  reasons: string[];
  /** true → this product will NOT auto-verify after import (sweetener/polyol/protein/etc.). */
  blocksAutoVerify: boolean;
}

/**
 * Per-candidate red flags for the import preview (INTERNAL/admin only — no percentages, no
 * customer copy). PURE: runs the red-flag detector on each importable candidate's parsed
 * fields; never matches, never writes, never touches the reference base. Skip rows and
 * flag-free rows are omitted.
 */
export function importPreviewRedFlags(result: ProductIntakeResult): IntakeRedFlagRow[] {
  return result.candidates
    .filter((candidate) => candidate.status !== 'skip')
    .map((candidate) => {
      const flags = detectRedFlags(candidate.insert);
      return {
        rowIndex: candidate.rowIndex,
        codes: flags.map((f) => f.code),
        reasons: flags.map((f) => f.reason),
        blocksAutoVerify: blocksAutoVerify(flags),
      };
    })
    .filter((row) => row.codes.length > 0);
}

/** Import is allowed only when signed in AND there is at least one importable row. */
export function canImport(args: {
  isSignedIn: boolean;
  result: ProductIntakeResult | null;
}): boolean {
  return args.isSignedIn && args.result != null && importableCount(args.result) > 0;
}

/**
 * Read a chosen .csv file as TEXT, in the browser, via Blob.text(). No upload, no
 * storage bucket, no readAsArrayBuffer — text only (leading zeros survive the pure parser).
 */
/**
 * Read an intake file as canonical CSV text.
 *
 * A workbook is converted here and nowhere else: everything downstream sees the
 * same CSV the owner used to have to export by hand.
 */
export async function readCsvFile(file: File): Promise<string> {
  if (!isWorkbookFile(file.name, file.type)) return file.text();
  const { csv } = intimportWorkbookToCsv(await file.arrayBuffer());
  return csv;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
