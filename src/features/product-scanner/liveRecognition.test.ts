/**
 * LIVE SCANNER — the recognition ladder.
 *
 * Two things are proven here: that green is earned only through the catalogue, and that
 * a long sweep cannot run up a bill.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ValidBarcode } from './barcode';
import type { FrameQuality } from './frameQuality';
import {
  LiveRecognizer,
  OCR_MIN_INTERVAL_MS,
  VISION_MAX_CALLS,
  VISION_MIN_INTERVAL_MS,
  nextFallbackAttempt,
  nextRecognitionAttempt,
  type CatalogHit,
  type LadderInput,
  type RecognitionCapabilities,
} from './liveRecognition';
import { EVIDENCE_WINDOW_MS, RECOGNITION_EVIDENCE_REQUIRED } from './liveScanSession';

const good: FrameQuality = {
  exposure: 0.8,
  sharpness: 0.6,
  glare: 0.05,
  labelFill: 0.5,
  score: 80,
  acceptableForAutoCapture: true,
};
const unusable: FrameQuality = { ...good, score: 10, acceptableForAutoCapture: false };

const OREO: ValidBarcode = {
  value: '5901234123457',
  format: 'EAN_13',
  lookupValue: '5901234123457',
};
const OREO_HIT: CatalogHit = { id: 'prod-oreo', displayName: 'OREO Original 154 g', brand: 'OREO' };

// A frame is opaque to this layer; the capabilities are what get exercised.
const frame = {} as ImageData;

const ladder = (over: Partial<LadderInput> = {}): LadderInput => ({
  at: 10_000,
  quality: good,
  busy: false,
  hasOcr: false,
  hasVision: false,
  lastOcrAt: null,
  lastVisionAt: null,
  visionCalls: 0,
  ...over,
});

describe('the ladder spends nothing it does not have to', () => {
  it('does not even decode an unusable frame', () => {
    expect(nextRecognitionAttempt(ladder({ quality: unusable }))).toBe('NONE');
  });

  it('never stacks work while a resolution is in flight', () => {
    expect(nextRecognitionAttempt(ladder({ busy: true }))).toBe('NONE');
  });

  it('prefers the free local rung over the paid one', () => {
    expect(nextFallbackAttempt(ladder({ hasOcr: true, hasVision: true }))).toBe('OCR');
  });

  it('throttles paid recognition', () => {
    const base = { hasVision: true, lastVisionAt: 10_000 };
    expect(nextFallbackAttempt(ladder({ ...base, at: 10_000 + VISION_MIN_INTERVAL_MS - 1 }))).toBe(
      'NONE',
    );
    expect(nextFallbackAttempt(ladder({ ...base, at: 10_000 + VISION_MIN_INTERVAL_MS }))).toBe(
      'VISION',
    );
  });

  it('stops paying once the session cap is reached', () => {
    expect(nextFallbackAttempt(ladder({ hasVision: true, visionCalls: VISION_MAX_CALLS }))).toBe(
      'NONE',
    );
  });
});

describe('the throttle and the evidence window must stay compatible', () => {
  it('leaves room for a full set of paid observations inside one window', () => {
    // Three agreeing observations at the throttled cadence, plus slack for a camera that
    // does not deliver frames on a metronome. Without this, fresh produce never confirms.
    const spread = (RECOGNITION_EVIDENCE_REQUIRED - 1) * VISION_MIN_INTERVAL_MS;
    expect(spread).toBeLessThan(EVIDENCE_WINDOW_MS);
    expect(EVIDENCE_WINDOW_MS - spread).toBeGreaterThanOrEqual(VISION_MIN_INTERVAL_MS);
  });
});

describe('OWNER RULE · the catalogue decides what is green', () => {
  it('names a product only when the SKU resolves', async () => {
    const capabilities: RecognitionCapabilities = {
      decodeBarcode: vi.fn().mockResolvedValue(OREO),
      resolveBarcode: vi.fn().mockResolvedValue(OREO_HIT),
    };
    const observation = await new LiveRecognizer(capabilities).observe(frame, good, 0);
    expect(observation.route).toBe('LOCAL_BARCODE');
    expect(observation.catalogResolved).toBe(true);
    expect(observation.identityKey).toBe('prod-oreo');
    expect(observation.label).toBe('OREO Original 154 g');
  });

  it('refuses to name a valid barcode the catalogue does not know', async () => {
    const capabilities: RecognitionCapabilities = {
      decodeBarcode: vi.fn().mockResolvedValue(OREO),
      resolveBarcode: vi.fn().mockResolvedValue(null),
    };
    const observation = await new LiveRecognizer(capabilities).observe(frame, good, 0);
    expect(observation.barcodeValidated).toBe(true);
    expect(observation.catalogResolved).toBe(false);
    // Carried for the contribution flow, but never presented as a product.
    expect(observation.route).toBe('UNKNOWN');
    expect(observation.label).toBeNull();
  });

  it('does not name a recognised object that Gellatti does not stock', async () => {
    const capabilities: RecognitionCapabilities = {
      decodeBarcode: vi.fn().mockResolvedValue(null),
      resolveBarcode: vi.fn(),
      recognizeObject: vi.fn().mockResolvedValue({
        identityKey: 'dragonfruit',
        label: 'Pitaja',
        confidence: 0.93,
      }),
      resolveName: vi.fn().mockResolvedValue(null),
    };
    const observation = await new LiveRecognizer(capabilities).observe(frame, good, 0);
    expect(observation.catalogResolved).toBe(false);
    expect(observation.route).toBe('UNKNOWN');
    expect(observation.label).toBeNull();
  });
});

describe('holding a product in view is not billed per frame', () => {
  it('resolves a known SKU once, however many frames see it', async () => {
    const resolveBarcode = vi.fn().mockResolvedValue(OREO_HIT);
    const recognizer = new LiveRecognizer({
      decodeBarcode: vi.fn().mockResolvedValue(OREO),
      resolveBarcode,
    });
    for (let at = 0; at < 30; at += 33) await recognizer.observe(frame, good, at);
    expect(resolveBarcode).toHaveBeenCalledTimes(1);
    expect(recognizer.spent.catalogLookups).toBe(1);
  });

  it('remembers a MISS too, so an unknown code is looked up once', async () => {
    const resolveBarcode = vi.fn().mockResolvedValue(null);
    const recognizer = new LiveRecognizer({
      decodeBarcode: vi.fn().mockResolvedValue(OREO),
      resolveBarcode,
    });
    for (let at = 0; at < 30; at += 33) await recognizer.observe(frame, good, at);
    expect(resolveBarcode).toHaveBeenCalledTimes(1);
  });

  it('never exceeds the paid ceiling over a long sweep', async () => {
    const recognizer = new LiveRecognizer({
      decodeBarcode: vi.fn().mockResolvedValue(null),
      resolveBarcode: vi.fn(),
      recognizeObject: vi.fn().mockResolvedValue(null),
      resolveName: vi.fn(),
    });
    for (let at = 0; at < 120_000; at += VISION_MIN_INTERVAL_MS)
      await recognizer.observe(frame, good, at);
    expect(recognizer.spent.visionCalls).toBe(VISION_MAX_CALLS);
  });
});

describe('a sweep survives its own failures', () => {
  it('says nothing when a rung throws, instead of ending the session', async () => {
    const recognizer = new LiveRecognizer({
      decodeBarcode: vi.fn().mockRejectedValue(new Error('decoder gone')),
      resolveBarcode: vi.fn(),
    });
    const observation = await recognizer.observe(frame, good, 0);
    expect(observation.identityKey).toBeNull();
    // And the next frame is still served.
    expect((await recognizer.observe(frame, good, 100)).identityKey).toBeNull();
  });
});

describe('local text is evidence, not a lock', () => {
  it('carries a catalogue-matched name at recognition strength', async () => {
    const recognizer = new LiveRecognizer({
      decodeBarcode: vi.fn().mockResolvedValue(null),
      resolveBarcode: vi.fn(),
      readLabelText: vi.fn().mockResolvedValue('Mleko 3,2%'),
      resolveName: vi.fn().mockResolvedValue({ id: 'prod-milk', displayName: 'Mleko 3,2%' }),
    });
    const observation = await recognizer.observe(frame, good, OCR_MIN_INTERVAL_MS);
    expect(observation.route).toBe('LOCAL_OCR');
    expect(observation.catalogResolved).toBe(true);
    // Below a barcode's certainty, so the session still demands agreeing frames.
    expect(observation.confidence).toBeLessThan(1);
  });
});
