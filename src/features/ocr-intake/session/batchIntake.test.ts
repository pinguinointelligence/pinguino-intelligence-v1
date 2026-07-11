/**
 * Batch workflow tests (spec §13, §16): the 40-item fixture, stable ordering forever,
 * mixed outcomes, retry ONLY of failed items, summary derivation, CSV export
 * consistent with the EXISTING catalog header aliases (round-trip proven through the
 * real parser), and the no-cross-product-mixing invariant under interleaved
 * processing. Pure — no IO, no services.
 */
import { describe, expect, it } from 'vitest';
import { HEADER_ALIASES, normalizeHeader, parseProductTable } from '@/data/products/productTableParser';
import type { ProductInsert } from '@/data/products/productRow';
import type { BatchIntake, BatchItemOutcome } from '../intakeContracts';
import {
  BATCH_EXPORT_HEADERS,
  BatchIntakeError,
  createBatch,
  deriveBatchSummary,
  enqueueSessions,
  exportBatchCsv,
  exportHeadersAreAliasConsistent,
  recordBatchOutcome,
  retryFailedBatchItems,
  type BatchExportItem,
} from './batchIntake';

const expectRefusal = (fn: () => unknown, code: BatchIntakeError['code']): void => {
  try {
    fn();
    expect.unreachable(`expected BatchIntakeError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(BatchIntakeError);
    expect((error as BatchIntakeError).code).toBe(code);
  }
};

/** ~40 sessions — the hotel-restaurant onboarding scale from the spec. */
const FORTY = Array.from({ length: 40 }, (_, i) => `session-${String(i + 1).padStart(2, '0')}`);

/** Deterministic outcome mix for the 40-item fixture. */
const outcomeFor = (i: number): BatchItemOutcome =>
  i % 5 === 0 ? 'failed' : i % 5 === 1 ? 'saved' : i % 5 === 2 ? 'duplicate' : i % 5 === 3 ? 'needs_review' : 'pending';

const mixedBatch = (): BatchIntake => {
  let batch = createBatch('batch-1', FORTY);
  FORTY.forEach((sessionId, i) => {
    batch = recordBatchOutcome(batch, sessionId, outcomeFor(i));
  });
  return batch;
};

/** Session-tagged insert so any cross-product mixing is immediately visible. */
const insertFor = (sessionId: string): ProductInsert => ({
  brand: `Brand ${sessionId}`,
  product_name_display: `Product of ${sessionId}`,
  ean_code: `84${sessionId.replaceAll(/\D+/g, '').padStart(11, '0')}`,
  package_size: '500 g',
  fat_percent: 10.5,
  salt_percent: 0.2,
  source_type: 'label_scan',
});

describe('createBatch / enqueueSessions — stable ordering forever', () => {
  it('creates the 40-item batch with every session pending, in exactly the given order', () => {
    const batch = createBatch('batch-1', FORTY);
    expect(batch.sessionIds).toEqual(FORTY);
    expect(Object.keys(batch.outcomes)).toHaveLength(40);
    expect(FORTY.every((s) => batch.outcomes[s] === 'pending')).toBe(true);
  });

  it('refuses a blank batchId and duplicate ids at creation', () => {
    expectRefusal(() => createBatch('  '), 'invalid_batch_id');
    expectRefusal(() => createBatch('b', ['s-1', 's-1']), 'duplicate_session');
  });

  it('enqueue APPENDS — existing queue positions never move', () => {
    const base = createBatch('batch-1', FORTY.slice(0, 10));
    const grown = enqueueSessions(base, FORTY.slice(10));
    expect(grown.sessionIds).toEqual(FORTY);
    expect(grown.sessionIds.slice(0, 10)).toEqual(base.sessionIds);
  });

  it('re-enqueueing a queued session is a typed refusal', () => {
    expectRefusal(() => enqueueSessions(createBatch('b', ['s-1']), ['s-1']), 'duplicate_session');
    expectRefusal(() => enqueueSessions(createBatch('b'), ['s-2', 's-2']), 'duplicate_session');
  });

  it('ordering survives outcomes AND retries (stable forever)', () => {
    const batch = mixedBatch();
    expect(batch.sessionIds).toEqual(FORTY);
    const { batch: retried } = retryFailedBatchItems(batch);
    expect(retried.sessionIds).toEqual(FORTY);
  });
});

describe('recordBatchOutcome — no cross-product mixing', () => {
  it('an unknown sessionId is a typed refusal, never a silent write', () => {
    expectRefusal(() => recordBatchOutcome(createBatch('b', ['s-1']), 'foreign-session', 'saved'), 'unknown_session');
  });

  it('INTERLEAVED processing keeps every item outcome isolated (40 sessions)', () => {
    let batch = createBatch('batch-1', FORTY);
    // deterministic interleave: stride-7 permutation of the queue
    const interleaved = Array.from({ length: 40 }, (_, k) => FORTY[(k * 7) % 40]!);
    for (const sessionId of interleaved) {
      batch = recordBatchOutcome(batch, sessionId, outcomeFor(FORTY.indexOf(sessionId)));
    }
    FORTY.forEach((sessionId, i) => {
      expect(batch.outcomes[sessionId]).toBe(outcomeFor(i));
    });
    expect(batch.sessionIds).toEqual(FORTY); // interleaving never reordered the queue
  });

  it('is immutable — recording returns a new batch', () => {
    const before = createBatch('b', ['s-1']);
    const after = recordBatchOutcome(before, 's-1', 'saved');
    expect(before.outcomes['s-1']).toBe('pending');
    expect(after.outcomes['s-1']).toBe('saved');
  });
});

describe('retryFailedBatchItems — ONLY failed items', () => {
  it('flips failed → pending and returns the retried ids in queue order', () => {
    const { batch, retriedSessionIds } = retryFailedBatchItems(mixedBatch());
    const failedIds = FORTY.filter((_, i) => outcomeFor(i) === 'failed');
    expect(retriedSessionIds).toEqual(failedIds);
    for (const sessionId of failedIds) expect(batch.outcomes[sessionId]).toBe('pending');
  });

  it('every non-failed outcome is UNTOUCHED', () => {
    const { batch } = retryFailedBatchItems(mixedBatch());
    FORTY.forEach((sessionId, i) => {
      const original = outcomeFor(i);
      if (original !== 'failed') expect(batch.outcomes[sessionId]).toBe(original);
    });
  });

  it('a batch with nothing failed comes back unchanged', () => {
    const clean = recordBatchOutcome(createBatch('b', ['s-1']), 's-1', 'saved');
    const { batch, retriedSessionIds } = retryFailedBatchItems(clean);
    expect(retriedSessionIds).toEqual([]);
    expect(batch).toBe(clean);
  });
});

describe('deriveBatchSummary', () => {
  it('derives the honest mixed-outcome summary over 40 items', () => {
    // i%5: 0→failed (8), 1→saved (8), 2→duplicate (8), 3→needs_review (8), 4→pending (8)
    expect(deriveBatchSummary(mixedBatch())).toEqual({
      processed: 32,
      saved: 8,
      duplicate: 8,
      needsReview: 8,
      failed: 8,
      pending: 8,
    });
  });

  it('a fresh batch is all pending, processed 0', () => {
    expect(deriveBatchSummary(createBatch('b', FORTY))).toEqual({
      processed: 0,
      saved: 0,
      duplicate: 0,
      needsReview: 0,
      failed: 0,
      pending: 40,
    });
  });

  it('retry moves failed back into pending in the summary', () => {
    const { batch } = retryFailedBatchItems(mixedBatch());
    expect(deriveBatchSummary(batch)).toEqual({
      processed: 24,
      saved: 8,
      duplicate: 8,
      needsReview: 8,
      failed: 0,
      pending: 16,
    });
  });
});

describe('CSV export — consistent with the EXISTING catalog header vocabulary', () => {
  it('EVERY export header resolves through the existing HEADER_ALIASES', () => {
    expect(exportHeadersAreAliasConsistent()).toBe(true);
    for (const header of BATCH_EXPORT_HEADERS) {
      expect(HEADER_ALIASES[normalizeHeader(header)], header).toBeDefined();
    }
  });

  it('exports saved + needs_review rows by default, in QUEUE order', () => {
    const batch = mixedBatch();
    const included = FORTY.filter((_, i) => ['saved', 'needs_review'].includes(outcomeFor(i)));
    const items: BatchExportItem[] = included.map((sessionId) => ({ sessionId, insert: insertFor(sessionId) }));
    const csv = exportBatchCsv(batch, items);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(BATCH_EXPORT_HEADERS.join(','));
    expect(lines).toHaveLength(1 + included.length);
    // queue order: line i corresponds to included[i]
    included.forEach((sessionId, i) => {
      expect(lines[i + 1]).toContain(`Product of ${sessionId}`);
    });
  });

  it('ROUND-TRIPS through the real import parser (one intake pipeline)', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01']), 's-01', 'saved');
    const insert = insertFor('s-01');
    const csv = exportBatchCsv(batch, [{ sessionId: 's-01', insert }]);
    const parsed = parseProductTable(csv, 'generic');
    expect(parsed.total).toBe(1);
    const back = parsed.candidates[0]!.insert;
    expect(back.brand).toBe(insert.brand);
    expect(back.product_name_display).toBe(insert.product_name_display);
    expect(back.ean_code).toBe(insert.ean_code); // string round-trip, leading zeros safe
    expect(back.package_size).toBe(insert.package_size);
    expect(back.fat_percent).toBe(10.5);
    expect(back.salt_percent).toBe(0.2);
  });

  it('a null/unknown value exports as an EMPTY cell and re-imports as absent — never 0', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01']), 's-01', 'saved');
    const insert: ProductInsert = { brand: 'Solo Brand', source_type: 'label_scan' };
    const csv = exportBatchCsv(batch, [{ sessionId: 's-01', insert }]);
    const parsed = parseProductTable(csv, 'generic');
    const back = parsed.candidates[0]!.insert;
    expect(back.brand).toBe('Solo Brand');
    expect(back.fat_percent).toBeUndefined();
    expect(back.kcal_per_100g).toBeUndefined();
    expect(csv.split('\n')[1]).toContain(',,'); // honest empty cells
  });

  it('escapes commas / quotes / newlines RFC-4180 style (and they survive the round-trip)', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01']), 's-01', 'saved');
    const insert: ProductInsert = {
      brand: 'Comma, Inc.',
      product_name_display: 'He said "vanilla"\nnew line',
      source_type: 'label_scan',
    };
    const csv = exportBatchCsv(batch, [{ sessionId: 's-01', insert }]);
    expect(csv).toContain('"Comma, Inc."');
    expect(csv).toContain('"He said ""vanilla""\nnew line"');
    const back = parseProductTable(csv, 'generic').candidates[0]!.insert;
    expect(back.brand).toBe('Comma, Inc.');
    expect(back.product_name_display).toBe('He said "vanilla"\nnew line');
  });

  it('custom outcome selection exports exactly those rows', () => {
    const batch = mixedBatch();
    const failedIds = FORTY.filter((_, i) => outcomeFor(i) === 'failed');
    const items = failedIds.map((sessionId) => ({ sessionId, insert: insertFor(sessionId) }));
    const csv = exportBatchCsv(batch, items, { outcomes: ['failed'] });
    expect(csv.trim().split('\n')).toHaveLength(1 + failedIds.length);
  });

  it('NO cross-product mixing: each row carries exactly its own session data', () => {
    const batch = mixedBatch();
    const included = FORTY.filter((_, i) => ['saved', 'needs_review'].includes(outcomeFor(i)));
    // provide the items INTERLEAVED (reverse order) — output must still align by queue
    const items = [...included].reverse().map((sessionId) => ({ sessionId, insert: insertFor(sessionId) }));
    const csv = exportBatchCsv(batch, items);
    const parsed = parseProductTable(csv, 'generic');
    parsed.candidates.forEach((candidate, i) => {
      const sessionId = included[i]!;
      expect(candidate.insert.product_name_display).toBe(`Product of ${sessionId}`);
      expect(candidate.insert.brand).toBe(`Brand ${sessionId}`);
      expect(candidate.insert.ean_code).toBe(insertFor(sessionId).ean_code);
    });
  });

  it('a missing item for an included session is a TYPED refusal (no silent omission)', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01', 's-02']), 's-01', 'saved');
    expectRefusal(() => exportBatchCsv(batch, []), 'missing_export_item');
  });

  it('a foreign item and a duplicate item are typed refusals', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01']), 's-01', 'saved');
    expectRefusal(
      () => exportBatchCsv(batch, [{ sessionId: 'foreign', insert: {} }]),
      'unknown_session',
    );
    expectRefusal(
      () =>
        exportBatchCsv(batch, [
          { sessionId: 's-01', insert: {} },
          { sessionId: 's-01', insert: {} },
        ]),
      'duplicate_export_item',
    );
  });

  it('numbers export as plain strings (a real 0 stays "0"; EU comma never emitted)', () => {
    const batch = recordBatchOutcome(createBatch('b', ['s-01']), 's-01', 'saved');
    const insert: ProductInsert = { brand: 'Zero Brand', salt_percent: 0, fat_percent: 12.5, source_type: 'label_scan' };
    const csv = exportBatchCsv(batch, [{ sessionId: 's-01', insert }]);
    const back = parseProductTable(csv, 'generic').candidates[0]!.insert;
    expect(back.salt_percent).toBe(0); // real zero survives — never dropped, never faked
    expect(back.fat_percent).toBe(12.5);
  });
});
