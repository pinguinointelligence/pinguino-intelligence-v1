/**
 * Catalog import service (Mapper Slice D5C2) — the unified-intake WRITE step.
 *
 * importProductCatalog takes parsed intake candidates (D5C1 productTableParser) and
 * persists them via the D5B identity-aware createProductWithIdentity. ONE pipeline for
 * every source (customer / Colin / Mercadona) — candidates already carry their
 * source_type; this service only ORCHESTRATES (it builds nothing and writes nothing
 * itself).
 *
 * Boundaries:
 *   • writes products ONLY through createProductWithIdentity (own-row, RLS-gated; the DB
 *     assigns the product code) — it never reaches the database directly, never names the
 *     locked reference base, never generates a product code, never uses a privileged key;
 *   • matching is OPT-IN: matchAndSaveProduct runs only when options.runMatch === true,
 *     never automatically; a match failure is best-effort (a per-row warning), never a
 *     product failure, and short-circuits the rest of the batch;
 *   • deterministic + honest: rows are processed SEQUENTIALLY; a per-row failure is
 *     isolated and tallied (no silent failures); in-batch duplicates are detected by the
 *     pure identity key (the same one D5B dedupes on).
 */
import { createProductWithIdentity, findExistingProductForIdentity } from '@/services/products';
import { matchAndSaveProduct } from '@/services/productMapper';
import { snapshotNewProduct, snapshotSourceChange } from '@/services/productSnapshots';
import { productIdentityKey, productInsertToIdentityInput } from '@/data/products/productIdentity';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

export interface ImportProductCatalogOptions {
  /** Run the deterministic matcher on each CREATED product (default false — no auto-match). */
  runMatch?: boolean;
  /** Keep importing past a row failure (default true). When false, the first failing row is
   * recorded and then the error is rethrown immediately. */
  continueOnError?: boolean;
  /** Record a product_snapshots history row on create, and on a CHANGED existing source
   * (default true). Best-effort: a snapshot failure is a per-row warning, never a row failure. */
  snapshot?: boolean;
}

export type ImportRowOutcome = 'created' | 'existing' | 'in_batch_duplicate' | 'skipped' | 'failed';

export interface ImportRowResult {
  rowIndex: number;
  outcome: ImportRowOutcome;
  productId?: string;
  productCode?: string;
  /** in_batch_duplicate: the earlier row (rowIndex) this one duplicates. */
  duplicateOfRowIndex?: number;
  /** skipped: why the parser skipped it. */
  skipReason?: string;
  /** failed: the error message. */
  error?: string;
  /** Per-row warnings: the intake warnings + any best-effort match note. */
  warnings: string[];
}

export interface ProductImportSummary {
  total: number;
  created: number;
  existingDuplicates: number;
  inBatchDuplicates: number;
  skipped: number;
  failed: number;
  /** productId of every created + existing row. */
  productIds: string[];
  /** product_code (DB-assigned) of every created + existing row. */
  productCodes: string[];
  /** BATCH-level (orchestration) warnings; per-row warnings live in rowResults[].warnings. */
  warnings: string[];
  rowResults: ImportRowResult[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Import parsed intake candidates into the products layer, deduped by identity. Returns an
 * honest summary (created / existing / in_batch_duplicate / skipped / failed). Sequential +
 * per-row isolated. NOTE: created counts are exact for a sequential import; under genuine
 * concurrency a race-existing row could be tallied as created (createProductWithIdentity
 * returns the same shape for both) — acceptable and documented.
 */
export async function importProductCatalog(
  candidates: ProductIntakeCandidate[],
  options: ImportProductCatalogOptions = {},
): Promise<ProductImportSummary> {
  const runMatch = options.runMatch === true;
  const continueOnError = options.continueOnError !== false;
  const snapshot = options.snapshot !== false;

  const summary: ProductImportSummary = {
    total: candidates.length,
    created: 0,
    existingDuplicates: 0,
    inBatchDuplicates: 0,
    skipped: 0,
    failed: 0,
    productIds: [],
    productCodes: [],
    warnings: [],
    rowResults: [],
  };

  const seenKeys = new Map<string, number>(); // identity key -> the first row's rowIndex
  let matchingAvailable = runMatch; // flips off after the first match failure

  for (const candidate of candidates) {
    const row: ImportRowResult = {
      rowIndex: candidate.rowIndex,
      outcome: 'failed', // replaced below on every path
      warnings: [...candidate.warnings],
    };

    // 1. skip rows (no usable identity) — never look up or create
    if (candidate.status === 'skip') {
      row.outcome = 'skipped';
      if (candidate.skipReason) row.skipReason = candidate.skipReason;
      summary.skipped += 1;
      summary.rowResults.push(row);
      continue;
    }

    // 2-3. in-batch duplicate (identity key ONLY)
    const key = productIdentityKey(productInsertToIdentityInput(candidate.insert));
    const firstRowIndex = seenKeys.get(key);
    if (firstRowIndex !== undefined) {
      row.outcome = 'in_batch_duplicate';
      row.duplicateOfRowIndex = firstRowIndex;
      summary.inBatchDuplicates += 1;
      summary.rowResults.push(row);
      continue;
    }
    seenKeys.set(key, candidate.rowIndex);

    try {
      // 4-5. pre-check the DB for an already-owned product (accurate created vs existing)
      const existing = await findExistingProductForIdentity(candidate.insert);
      if (existing) {
        row.outcome = 'existing';
        row.productId = existing.id;
        row.productCode = existing.product_code;
        summary.existingDuplicates += 1;
        summary.productIds.push(existing.id);
        summary.productCodes.push(existing.product_code);
        // best-effort: record a history snapshot only if the source data changed
        if (snapshot) {
          try {
            await snapshotSourceChange(existing.id, candidate.insert);
          } catch (snapError) {
            row.warnings.push(`snapshot skipped: ${errorMessage(snapError)}`);
          }
        }
        summary.rowResults.push(row);
        continue;
      }

      // 6. create (the DB assigns the product code; identity hash computed inside)
      const product = await createProductWithIdentity(candidate.insert);
      row.outcome = 'created';
      row.productId = product.id;
      row.productCode = product.product_code;
      summary.created += 1;
      summary.productIds.push(product.id);
      summary.productCodes.push(product.product_code);

      // 6b. best-effort: record the first history snapshot for the new product
      if (snapshot) {
        try {
          await snapshotNewProduct(product);
        } catch (snapError) {
          row.warnings.push(`snapshot skipped: ${errorMessage(snapError)}`);
        }
      }

      // 7. optional, best-effort matching of the CREATED product only
      if (matchingAvailable) {
        try {
          await matchAndSaveProduct(product.id);
        } catch (matchError) {
          const message = errorMessage(matchError);
          row.warnings.push(`match skipped: ${message}`);
          summary.warnings.push(`matching unavailable after row ${candidate.rowIndex}: ${message}`);
          matchingAvailable = false; // stop trying for the remaining rows
        }
      }

      summary.rowResults.push(row);
    } catch (error) {
      // 8. isolate a create/lookup failure
      row.outcome = 'failed';
      row.error = errorMessage(error);
      summary.failed += 1;
      summary.rowResults.push(row);
      if (!continueOnError) throw error;
    }
  }

  return summary;
}
