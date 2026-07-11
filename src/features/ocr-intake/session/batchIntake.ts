/**
 * BATCH intake workflow (spec §13) — PURE model over the LOCKED `BatchIntake` /
 * `BatchItemOutcome` / `BatchSummary` contract shapes. A batch is a queue of intake
 * SESSIONS (~40 for a hotel restaurant onboarding):
 *
 *   • STABLE ORDERING FOREVER: a session keeps its queue position from enqueue on —
 *     recording outcomes, retrying, and exporting never reorders anything;
 *   • retry touches ONLY failed items (failed → pending); every other outcome is
 *     untouched — no accidental re-processing of saved products;
 *   • NO cross-product mixing: outcomes are keyed strictly by sessionId and an
 *     unknown sessionId is a TYPED refusal, never a silent write;
 *   • CSV export uses EXACTLY the existing catalog header vocabulary
 *     (productTableParser HEADER_ALIASES) so an exported file round-trips through
 *     the same import parser — one intake pipeline, one header language;
 *   • pure — no IO, no services, no engine; same input → same output.
 */
import { HEADER_ALIASES, normalizeHeader } from '@/data/products/productTableParser';
import type { ProductInsert } from '@/data/products/productRow';
import type { BatchIntake, BatchItemOutcome, BatchSummary } from '../intakeContracts';

/* ── typed errors ────────────────────────────────────────────────────────── */

export type BatchIntakeErrorCode =
  | 'invalid_batch_id'
  | 'duplicate_session'
  | 'unknown_session'
  | 'missing_export_item'
  | 'duplicate_export_item';

export class BatchIntakeError extends Error {
  readonly code: BatchIntakeErrorCode;

  constructor(code: BatchIntakeErrorCode, message: string) {
    super(message);
    this.name = 'BatchIntakeError';
    this.code = code;
  }
}

const refuse = (code: BatchIntakeErrorCode, message: string): never => {
  throw new BatchIntakeError(code, message);
};

/* ── batch lifecycle ─────────────────────────────────────────────────────── */

/** Create a batch; every enqueued session starts 'pending'. Ids must be unique. */
export function createBatch(batchId: string, sessionIds: readonly string[] = []): BatchIntake {
  const id = batchId.trim();
  if (id === '') refuse('invalid_batch_id', 'a batch needs a non-empty batchId');
  const seen = new Set<string>();
  for (const sessionId of sessionIds) {
    if (seen.has(sessionId)) refuse('duplicate_session', `session "${sessionId}" appears twice in the batch`);
    seen.add(sessionId);
  }
  return {
    batchId: id,
    sessionIds: [...sessionIds],
    outcomes: Object.fromEntries(sessionIds.map((s) => [s, 'pending' as BatchItemOutcome])),
  };
}

/** Append sessions to the queue (APPEND-ONLY — existing positions never move). */
export function enqueueSessions(batch: BatchIntake, sessionIds: readonly string[]): BatchIntake {
  const existing = new Set(batch.sessionIds);
  const added = new Set<string>();
  for (const sessionId of sessionIds) {
    if (existing.has(sessionId) || added.has(sessionId)) {
      refuse('duplicate_session', `session "${sessionId}" is already queued in batch ${batch.batchId}`);
    }
    added.add(sessionId);
  }
  return {
    ...batch,
    sessionIds: [...batch.sessionIds, ...sessionIds],
    outcomes: {
      ...batch.outcomes,
      ...Object.fromEntries(sessionIds.map((s) => [s, 'pending' as BatchItemOutcome])),
    },
  };
}

/** Record one item's outcome. The session MUST be a member of this batch — a foreign
 * sessionId is a typed refusal (no cross-product / cross-batch mixing, ever). */
export function recordBatchOutcome(
  batch: BatchIntake,
  sessionId: string,
  outcome: BatchItemOutcome,
): BatchIntake {
  if (!(sessionId in batch.outcomes)) {
    refuse('unknown_session', `session "${sessionId}" is not part of batch ${batch.batchId}`);
  }
  return { ...batch, outcomes: { ...batch.outcomes, [sessionId]: outcome } };
}

/** Retry ONLY the failed items: failed → pending. Everything else (saved, duplicate,
 * needs_review, pending) is untouched; queue order is untouched by construction. */
export function retryFailedBatchItems(batch: BatchIntake): { batch: BatchIntake; retriedSessionIds: string[] } {
  const retriedSessionIds = batch.sessionIds.filter((s) => batch.outcomes[s] === 'failed');
  if (retriedSessionIds.length === 0) return { batch, retriedSessionIds };
  const outcomes = { ...batch.outcomes };
  for (const sessionId of retriedSessionIds) outcomes[sessionId] = 'pending';
  return { batch: { ...batch, outcomes }, retriedSessionIds };
}

/** Derive the honest summary. processed = every non-pending item. */
export function deriveBatchSummary(batch: BatchIntake): BatchSummary {
  const counts: Record<BatchItemOutcome, number> = {
    saved: 0,
    duplicate: 0,
    needs_review: 0,
    failed: 0,
    pending: 0,
  };
  for (const sessionId of batch.sessionIds) {
    counts[batch.outcomes[sessionId] ?? 'pending'] += 1;
  }
  return {
    processed: counts.saved + counts.duplicate + counts.needs_review + counts.failed,
    saved: counts.saved,
    duplicate: counts.duplicate,
    needsReview: counts.needs_review,
    failed: counts.failed,
    pending: counts.pending,
  };
}

/* ── CSV export (spec §13) ───────────────────────────────────────────────── */

/**
 * Export columns — EVERY header is a canonical key of the EXISTING catalog
 * HEADER_ALIASES vocabulary (asserted by test), so the exported CSV parses back
 * through parseProductTable / mapRowToProductInsert unchanged.
 */
export const BATCH_EXPORT_HEADERS = [
  'brand',
  'product_name',
  'ean',
  'package_size',
  'country',
  'supplier',
  'category',
  'subcategory',
  'kcal_per_100g',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
  'fibre',
  'allergens',
] as const;

export type BatchExportHeader = (typeof BATCH_EXPORT_HEADERS)[number];

/** insert-field readers per export header (unknown → '' — never an invented 0). */
const HEADER_VALUE: Record<BatchExportHeader, (insert: ProductInsert) => string | number | null | undefined> = {
  brand: (i) => i.brand,
  product_name: (i) => i.product_name_display ?? i.product_name_internal,
  ean: (i) => i.ean_code,
  package_size: (i) => i.package_size,
  country: (i) => i.country,
  supplier: (i) => i.supplier,
  category: (i) => i.product_category,
  subcategory: (i) => i.product_subcategory,
  kcal_per_100g: (i) => i.kcal_per_100g,
  fat: (i) => i.fat_percent,
  saturated_fat: (i) => i.saturated_fat_percent,
  carbohydrate: (i) => i.carbohydrate_percent,
  sugars: (i) => i.total_sugars_percent,
  protein: (i) => i.protein_percent,
  salt: (i) => i.salt_percent,
  fibre: (i) => i.fiber_percent,
  allergens: (i) => i.allergens,
};

/** Compile-time + runtime guarantee that every export header resolves in the alias map. */
export function exportHeadersAreAliasConsistent(): boolean {
  return BATCH_EXPORT_HEADERS.every((h) => HEADER_ALIASES[normalizeHeader(h)] !== undefined);
}

/** RFC-4180 cell escaping (matches what lib/csv parseCsv reads back). */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? String(value) : value;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export interface BatchExportItem {
  sessionId: string;
  /** the session's built candidate insert (label-scan honest values, null = unknown). */
  insert: ProductInsert;
}

export interface BatchCsvOptions {
  /** which outcomes to include (default: saved + needs_review). */
  outcomes?: readonly BatchItemOutcome[];
}

/**
 * Export the batch's saved / needs-review rows as CSV, in QUEUE ORDER (stable). Items
 * are matched strictly by sessionId: a foreign item and a missing item for an included
 * session are both TYPED refusals — a row can never carry another product's data.
 */
export function exportBatchCsv(
  batch: BatchIntake,
  items: readonly BatchExportItem[],
  options: BatchCsvOptions = {},
): string {
  const include = new Set<BatchItemOutcome>(options.outcomes ?? ['saved', 'needs_review']);

  const byId = new Map<string, BatchExportItem>();
  for (const item of items) {
    if (!(item.sessionId in batch.outcomes)) {
      refuse('unknown_session', `export item for session "${item.sessionId}" — not part of batch ${batch.batchId}`);
    }
    if (byId.has(item.sessionId)) {
      refuse('duplicate_export_item', `two export items for session "${item.sessionId}"`);
    }
    byId.set(item.sessionId, item);
  }

  const lines: string[] = [BATCH_EXPORT_HEADERS.join(',')];
  for (const sessionId of batch.sessionIds) {
    const outcome = batch.outcomes[sessionId] ?? 'pending';
    if (!include.has(outcome)) continue;
    const item = byId.get(sessionId);
    if (!item) {
      refuse('missing_export_item', `session "${sessionId}" has outcome '${outcome}' but no export item was provided`);
    }
    const insert = (item as BatchExportItem).insert;
    lines.push(BATCH_EXPORT_HEADERS.map((h) => csvCell(HEADER_VALUE[h](insert))).join(','));
  }
  return `${lines.join('\n')}\n`;
}
