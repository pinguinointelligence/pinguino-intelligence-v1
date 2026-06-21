/**
 * Thin service seam for the D5C4A upload page. The ONLY module here that calls the
 * D5C2 import service. It invokes importProductCatalog with NO options, so matching
 * stays default-off (runMatch is never set true), and returns an honest discriminated
 * result so the page can render a calm error instead of crashing.
 */
import { importProductCatalog, type ProductImportSummary } from '@/services/productCatalogImport';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';
import { errorMessage } from './productImportController';

export type RunImportResult =
  | { ok: true; summary: ProductImportSummary }
  | { ok: false; error: string };

/** Import parsed candidates via the existing service. No options → no matching. */
export async function runProductImport(
  candidates: ProductIntakeCandidate[],
): Promise<RunImportResult> {
  try {
    const summary = await importProductCatalog(candidates);
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
