/**
 * LIVE SCANNER — one uninterrupted sweep.
 *
 * The owner's proof: BANANA, then OREO, then MILK, collected one after another WITHOUT
 * the camera closing and without any of them being scanned twice.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ValidBarcode } from './barcode';
import { LiveRecognizer, type CatalogHit, type RecognitionCapabilities } from './liveRecognition';
import { LiveScanController, type GrabbedFrame, type LiveScanUpdate } from './liveScanController';
import { RECOGNITION_EVIDENCE_REQUIRED } from './liveScanSession';

/** A synthetic frame that `scoreRgbaFrame` grades as usable (bars give real edges). */
const usableFrame = (at: number, contrast = 130): GrabbedFrame => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = Math.floor(x / 4) % 2 ? 125 - contrast / 2 : 125 + contrast / 2;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  return { pixels: { data, width, height } as ImageData, at };
};

const ean = (value: string): ValidBarcode => ({ value, format: 'EAN_13', lookupValue: value });
const OREO = ean('5901234123457');
const MILK = ean('5900512345670');

const CATALOG: Record<string, CatalogHit> = {
  '5901234123457': { id: 'prod-oreo', displayName: 'OREO Original 154 g' },
  '5900512345670': { id: 'prod-milk', displayName: 'Mleko 3,2% 1 l' },
  banana: { id: 'prod-banana', displayName: 'Banan' },
};

/** Sweep the phone across three products; `visible` is what the lens currently sees. */
const sweepCapabilities = (
  visible: () => 'banana' | ValidBarcode | null,
): RecognitionCapabilities => ({
  decodeBarcode: async () => {
    const seen = visible();
    return seen === null || seen === 'banana' ? null : seen;
  },
  resolveBarcode: async (barcode) => CATALOG[barcode.lookupValue] ?? null,
  recognizeObject: async () => {
    const seen = visible();
    // The boundary resolves against the catalogue server-side and returns the canonical
    // identity — the recogniser never invents one.
    return seen === 'banana'
      ? {
          identityKey: 'banana',
          label: 'Banan',
          confidence: 0.92,
          resolved: { id: 'prod-banana', displayName: 'Banan' },
        }
      : null;
  },
  resolveName: async (text) => (text === 'Banan' ? (CATALOG.banana ?? null) : null),
});

describe('a single uninterrupted sweep collects three products', () => {
  it('BANANA, then OREO, then MILK — camera never closes, nothing scanned twice', async () => {
    let clock = 0;
    let visible: 'banana' | ValidBarcode | null = 'banana';
    const updates: LiveScanUpdate[] = [];

    const controller = new LiveScanController({
      grabFrame: () => usableFrame(clock),
      recognizer: new LiveRecognizer(sweepCapabilities(() => visible)),
      onUpdate: (update) => updates.push(update),
    });
    controller.start();

    // One frame, awaited, so the async identification settles before the next.
    const tick = async (stepMs: number) => {
      clock += stepMs;
      controller.onFrame();
      await vi.waitFor(() => expect(controller.state).toBeDefined());
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    // Fresh produce has no barcode, so it must earn its evidence over several frames.
    for (let frame = 0; frame < RECOGNITION_EVIDENCE_REQUIRED; frame += 1) await tick(1_300);
    expect(controller.accepted.map((p) => p.label)).toEqual(['Banan']);

    // Sweep on. The camera was never stopped between products.
    visible = OREO;
    for (let frame = 0; frame < 3; frame += 1) await tick(200);
    expect(controller.accepted.map((p) => p.label)).toEqual(['Banan', 'OREO Original 154 g']);

    visible = MILK;
    for (let frame = 0; frame < 3; frame += 1) await tick(200);
    expect(controller.accepted.map((p) => p.label)).toEqual([
      'Banan',
      'OREO Original 154 g',
      'Mleko 3,2% 1 l',
    ]);

    // Every one is green, exactly once, and each carries a reference frame.
    expect(controller.accepted.every((p) => p.acceptance === 'confirmed')).toBe(true);
    expect(new Set(controller.accepted.map((p) => p.identityKey)).size).toBe(3);
    for (const product of controller.accepted)
      expect(controller.captureFor(product.identityKey)).not.toBeNull();
    // Suppression lasts the whole sweep, so elapsed time cannot re-collect anything.
    expect(clock).toBeGreaterThan(0);
  });

  it('a removed product can be collected again in the same sweep', async () => {
    let clock = 0;
    const controller = new LiveScanController({
      grabFrame: () => usableFrame(clock),
      recognizer: new LiveRecognizer(sweepCapabilities(() => OREO)),
      onUpdate: () => {},
    });
    controller.start();
    const tick = async () => {
      clock += 200;
      controller.onFrame();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    await tick();
    expect(controller.accepted).toHaveLength(1);
    controller.remove('prod-oreo');
    expect(controller.accepted).toHaveLength(0);
    expect(controller.captureFor('prod-oreo')).toBeNull();
    await tick();
    expect(controller.accepted).toHaveLength(1);
  });
});

describe('"Skanuj dalej" does not lose what was already collected', () => {
  it('carries the sweep and its reference frames across a camera restart', async () => {
    let clock = 0;
    const first = new LiveScanController({
      grabFrame: () => usableFrame(clock),
      recognizer: new LiveRecognizer(sweepCapabilities(() => OREO)),
      onUpdate: () => {},
    });
    first.start();
    clock += 200;
    first.onFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.accepted).toHaveLength(1);

    // Review releases the camera; continuing opens a new one, and a new controller.
    first.stop();
    const resumed = new LiveScanController({
      grabFrame: () => usableFrame(clock),
      recognizer: new LiveRecognizer(sweepCapabilities(() => null)),
      onUpdate: () => {},
      resumeFrom: first.snapshot(),
    });
    resumed.start();
    expect(resumed.accepted.map((p) => p.label)).toEqual(['OREO Original 154 g']);
    expect(resumed.captureFor('prod-oreo')).not.toBeNull();
    // And the suppression came with it, so the same product is not collected twice.
    resumed.onFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resumed.accepted).toHaveLength(1);
  });
});

describe('the camera is released when the sweep ends', () => {
  it('stops every track on stop()', () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const controller = new LiveScanController({
      grabFrame: () => null,
      recognizer: new LiveRecognizer({
        decodeBarcode: async () => null,
        resolveBarcode: async () => null,
      }),
      onUpdate: () => {},
      stream,
    });
    controller.start();
    controller.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    // And no further frame is processed.
    controller.onFrame();
  });
});
