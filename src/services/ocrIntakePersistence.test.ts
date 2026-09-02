import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  IntakeImage,
  ProductIntakeSession,
  RawOcrResult,
} from '@/features/ocr-intake/intakeContracts';
import type { SaveFlowResult } from '@/features/ocr-intake/session/saveFlow';

vi.mock('@/services/ocrIntakeSessions', () => ({
  createSession: vi.fn(async () => ({ id: 's1' })),
  saveImageMetadata: vi.fn(async () => ({ id: 'i1' })),
  updateSessionState: vi.fn(async (id: string, state: string) => ({ id, state })),
}));
vi.mock('@/services/ocrIntakeStorage', () => ({
  uploadIntakeImage: vi.fn(async () => ({ path: 'p' })),
}));
vi.mock('@/services/ocrIntakeEvidence', () => ({
  recordOcrRun: vi.fn(async () => ({ id: 'r1' })),
  saveEvidence: vi.fn(async () => []),
}));
vi.mock('@/features/ocr-intake/session/saveFlow', () => ({
  createSaveFlowState: vi.fn((sessionId: string) => ({ sessionId })),
  buildSessionCandidate: vi.fn(() => ({
    candidate: { status: 'valid', insert: { product_name_display: 'Completed product' } },
  })),
  saveIntakeSession: vi.fn(),
}));
vi.mock('@/services/productIngest', () => ({
  canonicalIngestFromLegacyProduct: vi.fn((insert: Record<string, unknown>) => ({
    source: 'ocr',
    input: { ...insert },
    privateOverlay: {},
  })),
  productIngestIdempotencyKey: vi.fn(async () => 'product:ocr:completion'),
  ingestProduct: vi.fn(async () => ({
    kind: 'created',
    productId: 'catalog-1',
    productVersionId: 'version-1',
    behaviorBindingId: 'binding-1',
    ingestEventId: 'event-1',
    status: 'manual_unverified',
    autoFavorited: true,
    duplicateCandidates: [],
    missingFields: [],
    invalidFields: [],
    reviewCaseKey: null,
    retryAt: null,
  })),
}));
vi.mock('@/services/globalCatalog', () => ({
  getCatalogMarketPreferences: vi.fn(async () => ({
    primaryMarket: 'ES',
    additionalMarkets: [],
    preferredRetailers: [],
    defaultScope: 'my_markets_and_global',
  })),
}));

import { createSession, saveImageMetadata, updateSessionState } from '@/services/ocrIntakeSessions';
import { uploadIntakeImage } from '@/services/ocrIntakeStorage';
import { recordOcrRun, saveEvidence } from '@/services/ocrIntakeEvidence';
import { saveIntakeSession } from '@/features/ocr-intake/session/saveFlow';
import { ingestProduct } from '@/services/productIngest';
import {
  completeSavedOcrProductAndRetryCatalog,
  persistSessionAndSave,
  retryGlobalCatalogContribution,
} from './ocrIntakePersistence';

const image: IntakeImage = {
  imageId: 'i1',
  role: 'nutrition_table',
  order: 0,
  fileName: 'n.png',
  mime: 'image/png',
  byteSize: 100,
  checksumSha256: 'a'.repeat(64),
  width: null,
  height: null,
  state: 'ready',
  failure: null,
};
const okRun: RawOcrResult = {
  providerId: 'tesseract',
  imageId: 'i1',
  fullText: 'x',
  lines: [],
  overallConfidence: 90,
  languageHints: ['eng'],
  durationMs: 1,
};
const session: ProductIntakeSession = {
  sessionId: 's1',
  state: 'ready_to_save',
  images: [image],
  manualEan: null,
  ocrRuns: {
    i1: { ok: true, result: okRun },
    i2: { ok: false, failure: { kind: 'unreadable_image' } },
  },
  fields: [],
  warnings: [],
  duplicate: null,
};
const bytes = () => new Map([['i1', new Uint8Array(10)]]);
const setSave = (result: SaveFlowResult) =>
  vi.mocked(saveIntakeSession).mockImplementation(async (_session, _flow, _existing, options) => {
    if (result.kind === 'saved' && options?.persistCandidate) {
      await options.persistCandidate({
        status: 'valid',
        insert: { product_name_display: 'Completed product' },
        warnings: [],
        skipReason: null,
        rowIndex: 0,
      });
    }
    return { session, flow: { sessionId: 's1' } as never, result };
  });

afterEach(() => vi.clearAllMocks());

describe('persistSessionAndSave', () => {
  it('persists session → images → evidence, then saves, then records the terminal state', async () => {
    setSave({
      kind: 'saved',
      productId: 'PR-1',
      productCode: 'PR-ING-000001',
      alreadySaved: false,
      assessment: { verdict: 'valid' } as never,
      postSave: { step: 'run_existing_matcher', productId: 'PR-1', note: '' },
    });
    const out = await persistSessionAndSave(session, bytes(), []);

    expect(createSession).toHaveBeenCalledWith({ id: 's1', manualEan: null });
    expect(uploadIntakeImage).toHaveBeenCalledWith('s1', 'i1', expect.any(Uint8Array), 'image/png');
    expect(saveImageMetadata).toHaveBeenCalledWith('s1', image);
    // only the SUCCESSFUL run is recorded (the failed i2 run is skipped)
    expect(recordOcrRun).toHaveBeenCalledTimes(1);
    expect(recordOcrRun).toHaveBeenCalledWith('s1', 'i1', okRun);
    expect(saveEvidence).toHaveBeenCalledWith('s1', []);
    expect(saveIntakeSession).toHaveBeenCalledTimes(1);
    expect(updateSessionState).toHaveBeenCalledWith('s1', 'saved', { savedAt: expect.any(String) });
    // The service pipeline captured evidence and wrote the authoritative link.
    expect(out.savedProductLinkPending).toBe(false);
    expect(ingestProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ocr',
        ocrSessionId: 's1',
        idempotencyKey: 'ocr:s1',
      }),
    );
    expect(out.globalCatalogContribution).toMatchObject({
      productId: 'catalog-1',
      autoFavorited: true,
    });
  });

  it('reflects a duplicate_blocked outcome and does NOT claim a saved link', async () => {
    setSave({ kind: 'duplicate_blocked', assessment: { verdict: 'exact_duplicate' } as never });
    const out = await persistSessionAndSave(session, bytes(), []);
    expect(updateSessionState).toHaveBeenCalledWith('s1', 'duplicate_blocked', {});
    expect(out.savedProductLinkPending).toBe(false);
    expect(out.globalCatalogContribution).toBeNull();
  });

  it('reflects a failed save', async () => {
    setSave({ kind: 'failed', error: 'boom' });
    const out = await persistSessionAndSave(session, bytes(), []);
    expect(updateSessionState).toHaveBeenCalledWith('s1', 'failed', {});
    expect(out.savedProductLinkPending).toBe(false);
  });

  it('saves the intake on open_existing after resolving the confirmed shared product', async () => {
    setSave({ kind: 'open_existing', existingProductId: 'PR-9' });
    await persistSessionAndSave(session, bytes(), []);
    expect(updateSessionState).toHaveBeenCalledWith('s1', 'saved', {
      savedAt: expect.any(String),
    });
    expect(ingestProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: null,
        ocrSessionId: 's1',
        duplicateDecision: 'same',
        input: expect.objectContaining({ duplicateProductId: 'PR-9' }),
      }),
    );
    expect(vi.mocked(ingestProduct).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateSessionState).mock.invocationCallOrder.at(-1)!,
    );
  });

  it('keeps a failed open_existing contribution retryable instead of cancelling the OCR session', async () => {
    setSave({ kind: 'open_existing', existingProductId: 'PR-9' });
    vi.mocked(ingestProduct).mockRejectedValueOnce(new Error('temporary catalog failure'));

    const out = await persistSessionAndSave(session, bytes(), []);

    expect(updateSessionState).toHaveBeenCalledWith('s1', 'duplicate_blocked', {});
    expect(out.savedProductLinkPending).toBe(true);
    expect(out.globalCatalogContributionError).toBe('temporary catalog failure');
  });

  it('preserves the same-product decision when an existing contribution is retried', async () => {
    const result = {
      session: { id: 's1' },
      saveResult: { kind: 'open_existing', existingProductId: 'shared-product' },
      savedProductLinkPending: false,
      globalCatalogContribution: null,
      globalCatalogContributionError: 'temporary failure',
    } as never;

    await retryGlobalCatalogContribution(result, session);

    expect(ingestProduct).toHaveBeenCalledWith(expect.objectContaining({
      productId: null,
      duplicateDecision: 'same',
      input: expect.objectContaining({ duplicateProductId: 'shared-product' }),
    }));
  });

  it('keeps a rate-limited OCR session retryable and saves it after a successful retry', async () => {
    vi.mocked(ingestProduct).mockResolvedValueOnce({
      kind: 'rate_limited',
      productId: null,
      productVersionId: null,
      behaviorBindingId: null,
      ingestEventId: null,
      status: null,
      autoFavorited: false,
      duplicateCandidates: [],
      missingFields: [],
      invalidFields: [],
      reviewCaseKey: null,
      retryAt: '2026-08-14T12:00:00.000Z',
      challengeRequired: true,
    });
    vi.mocked(saveIntakeSession).mockImplementation(async (_session, _flow, _existing, options) => {
      try {
        await options!.persistCandidate!({
          status: 'valid',
          insert: { product_name_display: 'Completed product' },
          warnings: [],
          skipReason: null,
          rowIndex: 0,
        });
        throw new Error('expected the rate-limited ingest to reject persistence');
      } catch (error) {
        return {
          session,
          flow: { sessionId: 's1' } as never,
          result: { kind: 'failed', error: error instanceof Error ? error.message : String(error) },
        };
      }
    });

    const deferred = await persistSessionAndSave(session, bytes(), []);
    expect(deferred.globalCatalogContribution?.kind).toBe('rate_limited');
    expect(updateSessionState).toHaveBeenLastCalledWith('s1', 'ready_to_save', {});

    const completed = await retryGlobalCatalogContribution(deferred, session);
    expect(completed).toMatchObject({ kind: 'created', productId: 'catalog-1' });
    expect(updateSessionState).toHaveBeenLastCalledWith('s1', 'saved', {
      savedAt: expect.any(String),
    });
  });

  it('forwards the duplicate explicitly selected by the operator on retry', async () => {
    const result = {
      session: { id: 's1' },
      saveResult: { kind: 'failed', error: 'likely_duplicate' },
      savedProductLinkPending: false,
      globalCatalogContribution: {
        kind: 'likely_duplicate',
        productId: null,
        status: 'blocked',
        autoFavorited: false,
        duplicateCandidates: [
          { productId: 'candidate-a', reason: 'name' },
          { productId: 'candidate-b', reason: 'image' },
        ],
        missingFields: [],
        invalidFields: [],
        reviewCaseKey: null,
        retryAt: null,
      },
      globalCatalogContributionError: null,
    } as never;

    await retryGlobalCatalogContribution(result, session, {
      duplicateDecision: 'same',
      duplicateProductId: 'candidate-b',
    });
    expect(ingestProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateDecision: 'same',
        input: expect.objectContaining({ duplicateProductId: 'candidate-b' }),
      }),
    );
  });

  it('throws when an image has no provided bytes (never a silent partial persist)', async () => {
    setSave({ kind: 'failed', error: 'unused' });
    await expect(persistSessionAndSave(session, new Map(), [])).rejects.toThrow(/No bytes/);
  });

  it('appends reviewed evidence before RED → BLUE private-product completion and retry', async () => {
    const result = {
      session: { id: 's1' },
      saveResult: { kind: 'saved', productId: 'PR-1' },
      savedProductLinkPending: false,
      globalCatalogContribution: null,
      globalCatalogContributionError: null,
    } as never;
    await completeSavedOcrProductAndRetryCatalog(result, session, { market: 'ES' });
    expect(saveEvidence).toHaveBeenCalledWith('s1', session.fields);
    expect(ingestProduct).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'PR-1', resumeBlocked: true }),
    );
    expect(vi.mocked(saveEvidence).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ingestProduct).mock.invocationCallOrder[0]!,
    );
  });
});
