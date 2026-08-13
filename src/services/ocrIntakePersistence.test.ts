import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntakeImage, ProductIntakeSession, RawOcrResult } from '@/features/ocr-intake/intakeContracts';
import type { SaveFlowResult } from '@/features/ocr-intake/session/saveFlow';

vi.mock('@/services/ocrIntakeSessions', () => ({
  createSession: vi.fn(async () => ({ id: 's1' })),
  saveImageMetadata: vi.fn(async () => ({ id: 'i1' })),
  updateSessionState: vi.fn(async (id: string, state: string) => ({ id, state })),
}));
vi.mock('@/services/ocrIntakeStorage', () => ({ uploadIntakeImage: vi.fn(async () => ({ path: 'p' })) }));
vi.mock('@/services/ocrIntakeEvidence', () => ({
  recordOcrRun: vi.fn(async () => ({ id: 'r1' })),
  saveEvidence: vi.fn(async () => []),
}));
vi.mock('@/features/ocr-intake/session/saveFlow', () => ({
  createSaveFlowState: vi.fn((sessionId: string) => ({ sessionId })),
  buildSessionCandidate: vi.fn(() => ({ candidate: { status: 'valid', insert: { product_name_display: 'Completed product' } } })),
  saveIntakeSession: vi.fn(),
}));
vi.mock('@/services/products', () => ({ updateProduct: vi.fn(async () => undefined) }));
vi.mock('@/services/globalCatalog', () => ({
  getCatalogMarketPreferences: vi.fn(async () => ({
    primaryMarket: 'ES', additionalMarkets: [], preferredRetailers: [], defaultScope: 'my_markets_and_global',
  })),
  submitOwnedOcrProductToGlobalCatalog: vi.fn(async () => ({
    kind: 'created', productId: 'catalog-1', status: 'verified', autoFavorited: true,
    duplicateCandidates: [], missingFields: [], reviewCaseKey: null, retryAt: null,
  })),
}));

import { createSession, saveImageMetadata, updateSessionState } from '@/services/ocrIntakeSessions';
import { uploadIntakeImage } from '@/services/ocrIntakeStorage';
import { recordOcrRun, saveEvidence } from '@/services/ocrIntakeEvidence';
import { saveIntakeSession } from '@/features/ocr-intake/session/saveFlow';
import { submitOwnedOcrProductToGlobalCatalog } from '@/services/globalCatalog';
import { updateProduct } from '@/services/products';
import { completeSavedOcrProductAndRetryCatalog, persistSessionAndSave } from './ocrIntakePersistence';

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
  ocrRuns: { i1: { ok: true, result: okRun }, i2: { ok: false, failure: { kind: 'unreadable_image' } } },
  fields: [],
  warnings: [],
  duplicate: null,
};
const bytes = () => new Map([['i1', new Uint8Array(10)]]);
const setSave = (result: SaveFlowResult) =>
  vi.mocked(saveIntakeSession).mockResolvedValue({ session, flow: { sessionId: 's1' } as never, result });

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
    expect(submitOwnedOcrProductToGlobalCatalog).toHaveBeenCalledWith(expect.objectContaining({
      privateProductId: 'PR-1',
      ocrSessionId: 's1',
      idempotencyKey: 'ocr:s1',
    }));
    expect(out.globalCatalogContribution).toMatchObject({ productId: 'catalog-1', autoFavorited: true });
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

  it('cancels the local intake on open_existing but still resolves the confirmed product through the shared catalog', async () => {
    setSave({ kind: 'open_existing', existingProductId: 'PR-9' });
    await persistSessionAndSave(session, bytes(), []);
    expect(updateSessionState).toHaveBeenCalledWith('s1', 'cancelled', { cancelledAt: expect.any(String) });
    expect(submitOwnedOcrProductToGlobalCatalog).toHaveBeenCalledWith(expect.objectContaining({
      privateProductId: 'PR-9',
      ocrSessionId: 's1',
      idempotencyKey: 'ocr:s1',
    }));
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
    expect(updateProduct).toHaveBeenCalledWith('PR-1', expect.objectContaining({ product_name_display: 'Completed product' }));
    expect(vi.mocked(saveEvidence).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(updateProduct).mock.invocationCallOrder[0]!);
    expect(submitOwnedOcrProductToGlobalCatalog).toHaveBeenCalledWith(expect.objectContaining({ resumeBlocked: true }));
  });
});
