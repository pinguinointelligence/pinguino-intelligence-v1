/**
 * Thin service seam for the D5C4A upload page. The ONLY module here that calls the
 * D5C2 import service. It never sets runMatch, so matching stays default-off, and
 * returns an honest discriminated result so the page can render a calm error
 * instead of crashing. Progress is forwarded so a long import can report itself.
 */
import {
  importProductCatalog,
  type ImportProductCatalogOptions,
  type ProductImportSummary,
} from '@/services/productCatalogImport';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';
import { errorMessage } from './productImportController';

export type RunImportResult =
  | { ok: true; summary: ProductImportSummary }
  | { ok: false; error: string };

/** Import parsed candidates via the existing service. No options → no matching. */
export async function runProductImport(
  candidates: ProductIntakeCandidate[],
  options?: Pick<ImportProductCatalogOptions, 'onProgress' | 'importRun'>,
): Promise<RunImportResult> {
  try {
    const summary = await importProductCatalog(candidates, options);
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
