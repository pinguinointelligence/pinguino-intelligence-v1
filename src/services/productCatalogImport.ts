/**
 * Catalog import service (Mapper Slice D5C2) — the unified-intake WRITE step.
 *
 * importProductCatalog takes parsed intake candidates (D5C1 productTableParser) and
 * persists them through the canonical product-ingest adapter. ONE authority serves
 * every source (customer / Colin / Mercadona): candidates carry evidence/provenance;
 * identity, immutable versions, duplicate decisions and behavior remain server-owned.
 *
 * Boundaries:
 *   • writes only through createProductWithIdentity → catalog-submit → ingest_product_v1;
 *     it never reaches the database directly, names the locked reference base, invents a
 *     product code, or carries a privileged key;
 *   • runMatch is a compatibility request for server-side candidate evidence, never a
 *     browser authorization of Mapper or Engine meaning;
 *   • deterministic + honest: rows are processed SEQUENTIALLY; a per-row failure is
 *     isolated and tallied (no silent failures); in-batch duplicates are detected by the
 *     pure identity key (the same one D5B dedupes on).
 */
import { createProductWithIdentityResult } from '@/services/products';
import { productIdentityKey, productInsertToIdentityInput } from '@/data/products/productIdentity';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

export interface ImportProductCatalogOptions {
  /** Run the deterministic matcher on each CREATED product (default false — no auto-match). */
  runMatch?: boolean;
  /** Keep importing past a row failure (default true). When false, the first failing row is
   * recorded and then the error is rethrown immediately. */
  continueOnError?: boolean;
  /** @deprecated Canonical ingest always creates/retains the authoritative immutable version. */
  snapshot?: boolean;
  /**
   * Called after every row, so a long import can show what it is doing instead
   * of one spinner. Sequential ingest takes about a second per row: 800 rows is
   * a quarter of an hour, and silence for that long is indistinguishable from a
   * hang.
   */
  onProgress?: (progress: ImportProgress) => void;
  /**
   * Stop after this many CONSECUTIVE failures carrying the same message
   * (default 5). A systemic refusal — an exhausted quota, a lost session —
   * fails every remaining row the same way, and grinding through 800 of them
   * helps nobody and buries the reason.
   */
  stopAfterRepeatedFailures?: number;
  /** Durable server run identity plus cooperative stop/ledger hooks. */
  importRun?: {
    id: string;
    shouldCancel: () => boolean;
    recordOutcome: (input: {
      rowIndex: number;
      sourceRowId: string | null;
      displayName: string | null;
      outcome: 'SKIPPED' | 'FAILED';
      error?: string | null;
      result?: Record<string, unknown>;
    }) => Promise<void>;
  };
}

export interface ImportProgress {
  processed: number;
  total: number;
  created: number;
  existing: number;
  inBatchDuplicates: number;
  skipped: number;
  failed: number;
  /** The row just handled, for a live "current product" line. */
  currentName: string | null;
  currentRowIndex: number;
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
  /**
   * Set when the run stopped early on a repeated systemic failure. `remaining`
   * rows were never attempted, so they are neither imported nor failed — and a
   * resume can pick them up without recreating anything.
   */
  stopped?: { reason: string; afterRowIndex: number; remaining: number };
  /** Cooperative cancellation stops before the next row; the in-flight row is atomic. */
  cancelled?: { afterRowIndex: number | null; remaining: number };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Import parsed intake candidates into the products layer, deduped by identity. Returns an
 * honest summary (created / existing / in_batch_duplicate / skipped / failed). Sequential +
 * per-row isolated. Each row is its own all-or-nothing canonical transaction; this browser
 * orchestrator deliberately does not pretend that the whole sheet is one DB transaction.
 */
export async function importProductCatalog(
  candidates: ProductIntakeCandidate[],
  options: ImportProductCatalogOptions = {},
): Promise<ProductImportSummary> {
  const runMatch = options.runMatch === true;
  const continueOnError = options.continueOnError !== false;
  const stopAfter = options.stopAfterRepeatedFailures ?? 5;
  let lastFailure: string | null = null;
  let repeatedFailures = 0;

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
  if (runMatch) {
    summary.warnings.push(
      'Legacy client-side Mapper matching is ignored; canonical ingest owns classification.',
    );
  }

  for (const candidate of candidates) {
    if (options.importRun?.shouldCancel()) {
      summary.cancelled = {
        afterRowIndex: summary.rowResults.at(-1)?.rowIndex ?? null,
        remaining: candidates.length - summary.rowResults.length,
      };
      break;
    }
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
      await recordRunOutcome(candidate, 'SKIPPED', candidate.skipReason);
      summary.rowResults.push(row);
      emitProgress(candidate);
      continue;
    }

    // 2-3. in-batch duplicate (identity key ONLY)
    // A row the identity preflight already proved distinct by a STRONGER key is
    // not an in-batch duplicate, however similar this weaker key makes it look.
    const key = productIdentityKey(productInsertToIdentityInput(candidate.insert));
    const firstRowIndex = candidate.forceDistinctIdentity ? undefined : seenKeys.get(key);
    if (firstRowIndex !== undefined) {
      row.outcome = 'in_batch_duplicate';
      row.duplicateOfRowIndex = firstRowIndex;
      summary.inBatchDuplicates += 1;
      await recordRunOutcome(candidate, 'SKIPPED', null, {
        duplicateOfRowIndex: firstRowIndex,
        kind: 'in_batch_duplicate',
      });
      summary.rowResults.push(row);
      emitProgress(candidate);
      continue;
    }
    seenKeys.set(key, candidate.rowIndex);

    try {
      // Create or reuse. The DB owns product code, duplicate identity and the
      // authoritative outcome; owner-scoped browser reads cannot classify a
      // cross-account shared duplicate honestly.
      const { product, ingest } = await createProductWithIdentityResult(candidate.insert, {
        duplicateDecision: candidate.forceDistinctIdentity ? 'different' : null,
        ...(options.importRun
          ? {
              importRun: {
                id: options.importRun.id,
                rowIndex: candidate.rowIndex,
                sourceRowId: sourceRowId(candidate),
                displayName: displayName(candidate),
              },
            }
          : {}),
      });
      // `idempotent` means the server replayed an earlier ingest and returned
      // its ORIGINAL snapshot, whose kind still reads `created`. Without this a
      // second import of the same file reports fresh creations that never
      // happened.
      const existing = ingest.kind !== 'created' || ingest.idempotent === true;
      row.outcome = existing ? 'existing' : 'created';
      row.productId = product.id;
      row.productCode = product.product_code;
      if (existing) summary.existingDuplicates += 1;
      else summary.created += 1;
      summary.productIds.push(product.id);
      summary.productCodes.push(product.product_code);

      summary.rowResults.push(row);
      lastFailure = null;
      repeatedFailures = 0;
    } catch (error) {
      if (
        options.importRun?.shouldCancel() ||
        errorMessage(error).includes('import_cancellation_requested')
      ) {
        summary.cancelled = {
          afterRowIndex: summary.rowResults.at(-1)?.rowIndex ?? null,
          remaining: candidates.length - summary.rowResults.length,
        };
        break;
      }
      // 8. isolate a create/lookup failure
      row.outcome = 'failed';
      row.error = errorMessage(error);
      summary.failed += 1;
      await recordRunOutcome(candidate, 'FAILED', row.error);
      summary.rowResults.push(row);
      if (!continueOnError) throw error;
      repeatedFailures = row.error === lastFailure ? repeatedFailures + 1 : 1;
      lastFailure = row.error;
    }

    emitProgress(candidate);

    // The same refusal several times running is systemic, not bad luck. Stop and
    // say why, instead of repeating it for every remaining row.
    if (stopAfter > 0 && repeatedFailures >= stopAfter) {
      const handled = summary.rowResults.length;
      summary.stopped = {
        reason: lastFailure ?? 'Powtarzający się błąd zapisu',
        afterRowIndex: candidate.rowIndex,
        remaining: candidates.length - handled,
      };
      break;
    }
  }

  return summary;

  function emitProgress(candidate: ProductIntakeCandidate): void {
    options.onProgress?.({
      processed: summary.rowResults.length,
      total: candidates.length,
      created: summary.created,
      existing: summary.existingDuplicates,
      inBatchDuplicates: summary.inBatchDuplicates,
      skipped: summary.skipped,
      failed: summary.failed,
      currentName:
        candidate.insert.product_name_display ?? candidate.insert.product_name_internal ?? null,
      currentRowIndex: candidate.rowIndex,
    });
  }

  async function recordRunOutcome(
    candidate: ProductIntakeCandidate,
    outcome: 'SKIPPED' | 'FAILED',
    error: string | null = null,
    result: Record<string, unknown> = {},
  ): Promise<void> {
    if (!options.importRun) return;
    await options.importRun.recordOutcome({
      rowIndex: candidate.rowIndex,
      sourceRowId: sourceRowId(candidate),
      displayName: displayName(candidate),
      outcome,
      error,
      result,
    });
  }
}

function displayName(candidate: ProductIntakeCandidate): string | null {
  return candidate.insert.product_name_display ?? candidate.insert.product_name_internal ?? null;
}

function sourceRowId(candidate: ProductIntakeCandidate): string | null {
  const extracted = candidate.insert.extracted_json;
  if (!extracted || typeof extracted !== 'object') return null;
  const intelligence = (extracted as Record<string, unknown>).productIntelligence;
  if (!intelligence || typeof intelligence !== 'object') return null;
  const proposal = (intelligence as Record<string, unknown>).intimportProductProfileProposal;
  if (!proposal || typeof proposal !== 'object') return null;
  const value = (proposal as Record<string, unknown>).sourceProductId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
