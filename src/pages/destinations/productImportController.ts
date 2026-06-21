/**
 * Product import controller (Mapper Slice D5C4A) — the PURE, presentation-free logic
 * behind the CSV upload page. No React, no DB, no service: it wraps the existing pure
 * parser, derives the import gate, reads a chosen CSV file as text in the browser, and
 * normalizes errors. Kept dependency-light so it is unit-testable without a DOM.
 */
import { copy } from '@/copy/en';
import {
  parseProductTable,
  type ProductIntakeResult,
  type ProductIntakeSource,
} from '@/data/products/productTableParser';

const c = copy.productsImport;

export interface SourceOption {
  id: ProductIntakeSource;
  label: string;
}

/** The three intake sources, in display order. The selector only stamps source_type. */
export const SOURCE_OPTIONS: readonly SourceOption[] = [
  { id: 'generic', label: c.sources.generic },
  { id: 'mercadona', label: c.sources.mercadona },
  { id: 'colin', label: c.sources.colin },
];

export const DEFAULT_SOURCE: ProductIntakeSource = 'generic';

/** Parse CSV text into intake candidates for one source. Pure — never imports/writes. */
export function parseIntake(csvText: string, source: ProductIntakeSource): ProductIntakeResult {
  return parseProductTable(csvText, source);
}

/** Rows the importer will actually try to create (skip rows are not importable). */
export function importableCount(result: ProductIntakeResult): number {
  return result.candidates.filter((candidate) => candidate.status !== 'skip').length;
}

/** Import is allowed only when signed in AND there is at least one importable row. */
export function canImport(args: { isSignedIn: boolean; result: ProductIntakeResult | null }): boolean {
  return args.isSignedIn && args.result != null && importableCount(args.result) > 0;
}

/**
 * Read a chosen .csv file as TEXT, in the browser, via Blob.text(). No upload, no
 * storage bucket, no readAsArrayBuffer — text only (leading zeros survive the pure parser).
 */
export function readCsvFile(file: File): Promise<string> {
  return file.text();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
