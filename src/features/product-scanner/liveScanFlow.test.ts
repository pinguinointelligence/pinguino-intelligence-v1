import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_REQUEST,
  scanEvidenceState,
  type ScanEvidenceInput,
  type ScanEvidenceKind,
} from './evidenceState';
import {
  DUPLICATE_HAMMING_DISTANCE,
  frameHash,
  liveCaptureDecision,
  textDensity,
  type CapturedFrame,
  type FrameSignals,
} from './liveCapture';
import { consumesNewProductAllowance, routeScan, scanShowsResult } from './scanRouting';
import type { FrameQuality } from './frameQuality';

const goodQuality: FrameQuality = {
  exposure: 0.8,
  sharpness: 0.6,
  glare: 0.05,
  labelFill: 0.72,
  score: 74,
  acceptableForAutoCapture: true,
};

const signals = (overrides: Partial<FrameSignals> = {}): FrameSignals => ({
  quality: goodQuality,
  barcode: null,
  hash: 0x0f0f0f0f0f0f0f0fn,
  textDensity: 0.4,
  ...overrides,
});

const evidence = (overrides: Partial<ScanEvidenceInput> = {}) =>
  scanEvidenceState({
    localBarcode: null,
    catalogMatch: false,
    resolvedByLookup: [],
    resolvedByCamera: [],
    missingCriticalFields: [],
    shownViews: [],
    analysisExhausted: false,
    ...overrides,
  });

const routing = (overrides: Partial<Parameters<typeof routeScan>[0]> = {}) =>
  routeScan({
    catalogMatch: false,
    barcode: null,
    eanLookupDone: false,
    frameCount: 0,
    analyzedFrameCount: 0,
    liveBarcodeSearchActive: false,
    visionCalls: 0,
    maxVisionCalls: 2,
    evidence: evidence(),
    ...overrides,
  });

const ALL: ScanEvidenceKind[] = ['identity', 'barcode', 'nutrition', 'ingredients'];

describe('A. a known EAN resolves to the canonical product with nothing spent', () => {
  it('routes to the existing product instead of analysing anything', () => {
    const route = routing({ catalogMatch: true, barcode: '5449000131805' });
    expect(route).toEqual({ kind: 'existing_product' });
    expect(scanShowsResult(route)).toBe(true);
  });

  it('charges no new-product allowance for a product that already existed', () => {
    expect(consumesNewProductAllowance('existing_product')).toBe(false);
  });

  it('reports every kind as known once the catalogue answered', () => {
    const state = evidence({ catalogMatch: true, localBarcode: '5449000131805' });
    expect(state.complete).toBe(true);
    expect(state.requestView).toBeNull();
    expect(state.entries.every((entry) => entry.provenance === 'catalog')).toBe(true);
  });
});

describe('B. a new EAN whose exact source answers everything needs no photographs', () => {
  it('asks the GTIN source before anything else', () => {
    expect(routing({ barcode: '5449000131805', frameCount: 1 })).toEqual({ kind: 'ean_lookup' });
  });

  it('goes straight to the result when the lookup resolved every kind', () => {
    const state = evidence({
      localBarcode: '5449000131805',
      resolvedByLookup: ALL,
    });
    const route = routing({
      barcode: '5449000131805',
      eanLookupDone: true,
      frameCount: 1,
      evidence: state,
    });
    expect(route).toEqual({ kind: 'ready' });
    expect(state.entries.find((entry) => entry.kind === 'nutrition')?.provenance).toBe(
      'ean_lookup',
    );
  });

  it('never spends a vision call to confirm what the exact source already gave', () => {
    const route = routing({
      barcode: '5449000131805',
      eanLookupDone: true,
      frameCount: 4,
      analyzedFrameCount: 0,
      evidence: evidence({ localBarcode: '5449000131805', resolvedByLookup: ALL }),
    });
    expect(route.kind).not.toBe('analyze_label');
  });
});

describe('C. external nutrition but no ingredients — ask for ingredients only', () => {
  const state = evidence({
    localBarcode: '5449000131805',
    resolvedByLookup: ['identity', 'nutrition'],
    resolvedByCamera: ['identity', 'nutrition'],
    missingCriticalFields: ['ingredientsText'],
  });

  it('names the one missing kind and nothing else', () => {
    expect(state.missingKinds).toEqual(['ingredients']);
    expect(state.requestMessage).toBe(EVIDENCE_REQUEST.ingredients);
  });

  it('does not ask for the nutrition table it already has', () => {
    expect(state.requestMessage).not.toBe(EVIDENCE_REQUEST.nutrition);
  });

  it('requests that view rather than re-analysing the same frames', () => {
    expect(
      routing({
        barcode: '5449000131805',
        eanLookupDone: true,
        frameCount: 2,
        analyzedFrameCount: 2,
        visionCalls: 1,
        evidence: state,
      }),
    ).toEqual({
      kind: 'request_evidence',
      view: 'ingredients',
      message: EVIDENCE_REQUEST.ingredients,
    });
  });
});

describe('D. a barcode in front of the camera is detected before any result appears', () => {
  it('keeps the frame that carried the code, without waiting for stability', () => {
    expect(
      liveCaptureDecision({
        wanted: ['barcode', 'identity'],
        captured: [],
        bestFrameReady: false,
        signals: signals({
          barcode: '5449000131805',
          quality: { ...goodQuality, sharpness: 0.36 },
        }),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'capture', view: 'barcode', reason: 'barcode_read' });
  });

  it('treats a locally read code as present evidence, before any analysis', () => {
    const state = evidence({ localBarcode: '5449000131805' });
    expect(state.entries.find((entry) => entry.kind === 'barcode')).toEqual({
      kind: 'barcode',
      present: true,
      provenance: 'camera',
    });
  });

  it('gives a live barcode one rotated surface before spending the first Vision call', () => {
    expect(
      routing({
        frameCount: 1,
        analyzedFrameCount: 0,
        liveBarcodeSearchActive: true,
      }),
    ).toEqual({ kind: 'collect' });
    expect(
      routing({
        barcode: '5449000131805',
        frameCount: 1,
        analyzedFrameCount: 0,
        liveBarcodeSearchActive: true,
      }),
    ).toEqual({ kind: 'ean_lookup' });
  });

  it('keeps a one-image upload session on the same pipeline without making it wait for a camera', () => {
    expect(
      routing({
        frameCount: 1,
        analyzedFrameCount: 0,
        liveBarcodeSearchActive: false,
      }),
    ).toEqual({ kind: 'analyze_label', accurateRetry: false });
  });
});

describe('E. turning the package captures the views on its own', () => {
  it('captures the requested best frame once the rolling window is ready', () => {
    const held = liveCaptureDecision({
      wanted: ['nutrition'],
      captured: [],
      bestFrameReady: false,
      signals: signals(),
      maxFrames: 4,
    });
    expect(held.kind).toBe('hold');
    expect(
      liveCaptureDecision({
        wanted: ['nutrition'],
        captured: [],
        bestFrameReady: true,
        signals: signals(),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'capture', view: 'nutrition', reason: 'best_readable' });
  });

  it('progresses with a medium readable frame even when no perfect frame arrives', () => {
    expect(
      liveCaptureDecision({
        wanted: ['ingredients'],
        captured: [],
        bestFrameReady: true,
        signals: signals({
          quality: {
            ...goodQuality,
            score: 48,
            sharpness: 0.22,
            acceptableForAutoCapture: false,
          },
        }),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'capture', view: 'ingredients', reason: 'best_readable' });
  });

  it('refuses a blurred, dark or glaring frame with a reason the owner can act on', () => {
    const blurred = liveCaptureDecision({
      wanted: ['ingredients'],
      captured: [],
      bestFrameReady: false,
      signals: signals({
        quality: { ...goodQuality, sharpness: 0.1, acceptableForAutoCapture: false },
      }),
      maxFrames: 4,
    });
    expect(blurred).toMatchObject({ kind: 'hold', reason: 'blurred' });
    expect(
      liveCaptureDecision({
        wanted: ['ingredients'],
        captured: [],
        bestFrameReady: false,
        signals: signals({ quality: { ...goodQuality, glare: 0.4 } }),
        maxFrames: 4,
      }),
    ).toMatchObject({ kind: 'hold', reason: 'glare' });
  });

  it('will not accept a blank surface as a nutrition table', () => {
    expect(
      liveCaptureDecision({
        wanted: ['nutrition'],
        captured: [],
        bestFrameReady: false,
        signals: signals({ textDensity: 0.01 }),
        maxFrames: 4,
      }),
    ).toMatchObject({ kind: 'hold', reason: 'no_text' });
  });
});

describe('F. the same side held in front of the lens is one piece of evidence', () => {
  const captured: CapturedFrame[] = [{ view: 'identity', hash: 0x0f0f0f0f0f0f0f0fn, score: 80 }];

  it('ignores a frame that looks like one already kept', () => {
    expect(
      liveCaptureDecision({
        wanted: ['nutrition'],
        captured,
        bestFrameReady: false,
        signals: signals({ hash: 0x0f0f0f0f0f0f0f0dn }),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'duplicate' });
  });

  it('keeps a genuinely different surface', () => {
    expect(
      liveCaptureDecision({
        wanted: ['nutrition'],
        captured,
        bestFrameReady: true,
        signals: signals({ hash: 0xf0f0f0f00f0f0f0fn }),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'capture', view: 'nutrition', reason: 'best_readable' });
  });

  it('measures sameness on what the frame looks like', () => {
    const surface = new Uint8Array(64 * 64).fill(200);
    for (let index = 0; index < surface.length; index += 3) surface[index] = 40;
    const moved = Uint8Array.from(surface);
    moved[0] = 210;
    const other = new Uint8Array(64 * 64).fill(120);
    for (let index = 0; index < other.length; index += 7) other[index] = 250;
    const hash = frameHash(surface, 64, 64);
    expect(Number(hash ^ frameHash(moved, 64, 64))).toBeLessThanOrEqual(DUPLICATE_HAMMING_DISTANCE);
    expect(frameHash(other, 64, 64)).not.toBe(hash);
    expect(textDensity(surface, 64, 64)).toBeGreaterThan(
      textDensity(new Uint8Array(64 * 64).fill(200), 64, 64),
    );
  });

  it('shows the nutrition panel three times but keeps and analyses it only once', () => {
    const first = liveCaptureDecision({
      wanted: ['nutrition'],
      captured: [],
      bestFrameReady: true,
      signals: signals(),
      maxFrames: 4,
    });
    const kept: CapturedFrame[] =
      first.kind === 'capture' ? [{ view: first.view, hash: signals().hash, score: 74 }] : [];
    const repeatedDecisions = [1, 2].map(() =>
      liveCaptureDecision({
        wanted: ['nutrition'],
        captured: kept,
        bestFrameReady: true,
        signals: signals({ hash: 0x0f0f0f0f0f0f0f0dn }),
        maxFrames: 4,
      }),
    );
    const usableEvidenceCount = Number(first.kind === 'capture');
    const paidAnalysisCalls = usableEvidenceCount;
    const afterAnalysis = evidence({
      resolvedByCamera: ['nutrition'],
      missingCriticalFields: ['barcode', 'product_identity', 'ingredientsText'],
      shownViews: ['nutrition'],
    });

    expect(usableEvidenceCount).toBe(1);
    expect(paidAnalysisCalls).toBe(1);
    expect(repeatedDecisions).toEqual([{ kind: 'duplicate' }, { kind: 'duplicate' }]);
    expect(afterAnalysis.requestView).not.toBe('nutrition');
  });
});

describe('H. information that is not on the package never becomes another photo request', () => {
  it('stops asking once the owner has shown that view', () => {
    const state = evidence({
      localBarcode: '5449000131805',
      resolvedByLookup: ['identity', 'nutrition'],
      resolvedByCamera: ['identity', 'nutrition'],
      missingCriticalFields: ['ingredientsText'],
      shownViews: ['ingredients'],
    });
    expect(state.requestView).toBeNull();
    expect(state.packageEvidenceExhausted).toBe(true);
  });

  it('continues to estimation instead of looping', () => {
    const route = routing({
      barcode: '5449000131805',
      eanLookupDone: true,
      frameCount: 3,
      analyzedFrameCount: 3,
      visionCalls: 2,
      evidence: evidence({
        localBarcode: '5449000131805',
        resolvedByCamera: ['identity', 'nutrition'],
        missingCriticalFields: ['ingredientsText'],
        shownViews: ['ingredients'],
      }),
    });
    expect(route).toEqual({ kind: 'estimate' });
    expect(scanShowsResult(route)).toBe(true);
  });

  it('stops asking when no analysis is left to read a new frame with', () => {
    const state = evidence({
      missingCriticalFields: ['ingredientsText'],
      analysisExhausted: true,
    });
    expect(state.requestView).toBeNull();
    expect(state.packageEvidenceExhausted).toBe(true);
  });
});

describe('I. a follow-up view continues the same scan', () => {
  it('analyses the added frame as the accurate pass, not as a new scan', () => {
    expect(
      routing({
        barcode: '5449000131805',
        eanLookupDone: true,
        frameCount: 3,
        analyzedFrameCount: 2,
        visionCalls: 1,
        evidence: evidence({ missingCriticalFields: ['ingredientsText'] }),
      }),
    ).toEqual({ kind: 'analyze_label', accurateRetry: true });
  });

  it('charges no new-product allowance for the retry itself', () => {
    expect(consumesNewProductAllowance('incomplete_awaiting_evidence')).toBe(false);
  });
});

describe('L. a failed or abandoned scan costs the owner nothing', () => {
  it.each(['cancelled', 'analysis_failed', 'duplicate_of_existing'] as const)(
    'does not charge a %s scan',
    (outcome) => {
      expect(consumesNewProductAllowance(outcome)).toBe(false);
    },
  );

  it('charges exactly one allowance when a new product is really created', () => {
    expect(consumesNewProductAllowance('product_created')).toBe(true);
  });
});

describe('the result card waits for collection to finish (§20)', () => {
  it('is hidden while evidence is still being gathered or requested', () => {
    expect(scanShowsResult({ kind: 'collect' })).toBe(false);
    expect(scanShowsResult({ kind: 'ean_lookup' })).toBe(false);
    expect(scanShowsResult({ kind: 'analyze_label', accurateRetry: false })).toBe(false);
    expect(scanShowsResult({ kind: 'request_evidence', view: 'ingredients', message: 'x' })).toBe(
      false,
    );
  });
});

describe('capture stops when the evidence is enough (§28)', () => {
  it('keeps nothing further once every wanted view is held', () => {
    expect(
      liveCaptureDecision({
        wanted: [],
        captured: [],
        bestFrameReady: true,
        signals: signals(),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'enough' });
  });

  it('never exceeds the session frame ceiling', () => {
    expect(
      liveCaptureDecision({
        wanted: ['ingredients'],
        captured: [
          { view: 'identity', hash: 1n, score: 70 },
          { view: 'barcode', hash: 2n, score: 70 },
          { view: 'nutrition', hash: 4n, score: 70 },
          { view: 'ingredients', hash: 8n, score: 70 },
        ],
        bestFrameReady: true,
        signals: signals(),
        maxFrames: 4,
      }),
    ).toEqual({ kind: 'enough' });
  });
});
