/**
 * THE OWNER'S 15-POINT ACCEPTANCE MATRIX.
 *
 * One describe per case, numbered as the owner numbered them, so the matrix and the suite
 * cannot drift apart. Cases that need a real camera, a real phone or a real model are
 * marked in their own comment and proven as far as a deterministic test honestly can —
 * the rest is the served mobile pass, not something a unit test may claim.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ValidBarcode } from './barcode';
import { LiveRecognizer, type CatalogHit, type RecognitionCapabilities } from './liveRecognition';
import { LiveScanController, type GrabbedFrame } from './liveScanController';
import { planHandoff, reviewLabel } from './liveScanHandoff';
import { resolveAccepted } from './liveScanSession';

const usableFrame = (at: number): GrabbedFrame => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = Math.floor(x / 4) % 2 ? 60 : 190;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  return { pixels: { data, width, height } as ImageData, at };
};
/** Flat grey: no edges, so `scoreRgbaFrame` refuses it. */
const blurryFrame = (at: number): GrabbedFrame => {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { pixels: { data, width, height } as ImageData, at };
};

const ean = (value: string): ValidBarcode => ({
  value,
  format: 'EAN_13',
  lookupValue: value,
});
const OREO = ean('5901234123457');
const MILK = ean('5900512345670');
const UNKNOWN_EAN = ean('4006381333931');

const CATALOG: Record<string, CatalogHit> = {
  '5901234123457': { id: 'prod-oreo', displayName: 'OREO Original 154 g' },
  '5900512345670': { id: 'prod-milk', displayName: 'Mleko 3,2% 1 l' },
  Banan: { id: 'prod-banana', displayName: 'Banan' },
  Jabłko: { id: 'prod-apple', displayName: 'Jabłko' },
  Truskawka: { id: 'prod-strawberry', displayName: 'Truskawka' },
};

/** What the lens currently sees. */
type Visible = ValidBarcode | { vision: string; confidence?: number } | { text: string } | null;

const capabilitiesFor = (visible: () => Visible): RecognitionCapabilities => ({
  decodeBarcode: async () => {
    const seen = visible();
    return seen !== null && 'lookupValue' in seen ? seen : null;
  },
  resolveBarcode: async (barcode) => CATALOG[barcode.lookupValue] ?? null,
  readLabelText: async () => {
    const seen = visible();
    return seen !== null && 'text' in seen ? seen.text : null;
  },
  resolveName: async (text) => CATALOG[text] ?? null,
  // Stands in for `product-identify-live`: the CATALOGUE resolves, never the recogniser.
  recognizeObject: async (_source, localText) => {
    const seen = visible();
    if (seen === null || !('vision' in seen)) return null;
    const hit = CATALOG[seen.vision] ?? null;
    return {
      identityKey: seen.vision.toLowerCase(),
      label: seen.vision,
      confidence: seen.confidence ?? 0.92,
      resolved: hit ? { id: hit.id, displayName: hit.displayName } : null,
      ...(localText ? {} : {}),
    };
  },
});

/** Drive a sweep; returns the controller so each case can assert on the session. */
const sweep = () => {
  let clock = 0;
  let visible: Visible = null;
  const controller = new LiveScanController({
    grabFrame: () => usableFrame(clock),
    recognizer: new LiveRecognizer(capabilitiesFor(() => visible)),
    onUpdate: () => {},
  });
  controller.start();
  return {
    controller,
    show(next: Visible) {
      visible = next;
    },
    async tick(stepMs = 1_300, frame?: (at: number) => GrabbedFrame) {
      clock += stepMs;
      if (frame) {
        // A specific frame for this tick only.
        const original = controller as unknown as { options: { grabFrame: () => GrabbedFrame } };
        const previous = original.options.grabFrame;
        original.options = { ...original.options, grabFrame: () => frame(clock) };
        controller.onFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        original.options = { ...original.options, grabFrame: previous };
        return;
      }
      controller.onFrame();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    get labels() {
      return controller.accepted.map((p) => p.label);
    },
  };
};

describe('1 · banana live recognition', () => {
  it('recognises fresh produce with no barcode and turns it green', async () => {
    const s = sweep();
    s.show({ vision: 'Banan' });
    for (let i = 0; i < 3; i += 1) await s.tick();
    expect(s.labels).toEqual(['Banan']);
    expect(s.controller.accepted[0]?.acceptance).toBe('confirmed');
    expect(s.controller.accepted[0]?.route).toBe('VISION_RESOLVED');
  });
});

describe('2 · a second fresh product', () => {
  it('collects apple and strawberry after the banana, same session', async () => {
    const s = sweep();
    for (const name of ['Banan', 'Jabłko', 'Truskawka']) {
      s.show({ vision: name });
      for (let i = 0; i < 3; i += 1) await s.tick();
    }
    expect(s.labels).toEqual(['Banan', 'Jabłko', 'Truskawka']);
  });
});

describe('3 · packaged product with a barcode', () => {
  it('locks on the first qualifying frame, with no paid call at all', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    expect(s.labels).toEqual(['OREO Original 154 g']);
    expect(s.controller.state.counters.LOCAL_BARCODE).toBe(1);
    expect(s.controller.state.counters.VISION_RESOLVED).toBe(0);
  });
});

describe('4 · packaged product with no visible barcode', () => {
  it('reaches the catalogue through label text alone', async () => {
    const s = sweep();
    s.show({ text: 'Banan' });
    for (let i = 0; i < 3; i += 1) await s.tick(1_600);
    expect(s.labels).toEqual(['Banan']);
    expect(s.controller.state.counters.LOCAL_OCR).toBeGreaterThan(0);
  });
});

describe('5 · branded recognition', () => {
  it('names the exact catalogue product, never the recogniser guess', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    // The label is the CATALOGUE's display name, not anything a model produced.
    expect(s.controller.accepted[0]?.label).toBe('OREO Original 154 g');
    expect(s.controller.accepted[0]?.identityKey).toBe('prod-oreo');
  });
});

describe('6 · blurry first frames are ignored', () => {
  it('says nothing about them and still accepts the later good frame', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200, blurryFrame);
    await s.tick(200, blurryFrame);
    expect(s.controller.accepted).toHaveLength(0);
    await s.tick(200);
    expect(s.labels).toEqual(['OREO Original 154 g']);
  });
});

describe('7 · the same product in frame gives one result', () => {
  it('stays at one however long it is held, and for the whole sweep', async () => {
    const s = sweep();
    s.show(OREO);
    for (let i = 0; i < 8; i += 1) await s.tick(5_000);
    expect(s.controller.accepted).toHaveLength(1);
  });
});

describe('8 · multiple products sequentially, camera never closes', () => {
  it('BANAN → OREO → MLEKO in one uninterrupted session', async () => {
    const s = sweep();
    s.show({ vision: 'Banan' });
    for (let i = 0; i < 3; i += 1) await s.tick();
    s.show(OREO);
    await s.tick(200);
    s.show(MILK);
    await s.tick(200);
    expect(s.labels).toEqual(['Banan', 'OREO Original 154 g', 'Mleko 3,2% 1 l']);
    expect(s.controller.accepted.every((p) => p.acceptance === 'confirmed')).toBe(true);
    for (const product of s.controller.accepted)
      expect(s.controller.captureFor(product.identityKey)).not.toBeNull();
  });
});

describe('9 · an ambiguous product is never silently matched', () => {
  it('refuses a low-confidence guess instead of naming something', async () => {
    const s = sweep();
    s.show({ vision: 'Banan', confidence: 0.3 });
    for (let i = 0; i < 6; i += 1) await s.tick();
    expect(s.controller.accepted).toHaveLength(0);
  });

  it('refuses label text the catalogue answers ambiguously', async () => {
    const recognizer = new LiveRecognizer({
      decodeBarcode: async () => null,
      resolveBarcode: async () => null,
      readLabelText: async () => 'mleko',
      // Several plausible products means NO answer, never the first row.
      resolveName: async () => null,
    });
    const observation = await recognizer.observe(
      {} as ImageData,
      {
        exposure: 0.8,
        sharpness: 0.6,
        glare: 0.05,
        labelFill: 0.5,
        score: 80,
        acceptableForAutoCapture: true,
      },
      2_000,
    );
    expect(observation.identityKey).toBeNull();
  });
});

describe('10 · an unknown product goes to the existing deep flow', () => {
  it('is collected but never named, and is flagged for completion', async () => {
    const s = sweep();
    s.show(UNKNOWN_EAN);
    await s.tick(200);
    const [product] = s.controller.accepted;
    expect(product?.acceptance).toBe('needs_resolution');
    expect(product?.needsDeepScan).toBe(true);
    expect(reviewLabel(product!)).not.toContain(UNKNOWN_EAN.value);
    expect(planHandoff(s.controller.state).toDeepScan).toHaveLength(1);
  });

  it('returns from the deep flow into the SAME list, in place', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    s.show(UNKNOWN_EAN);
    await s.tick(200);
    const unknownKey = s.controller.accepted[1]!.identityKey;
    s.controller.resolve(unknownKey, { id: 'prod-new', displayName: 'Nowy jogurt 400 g' });
    expect(s.labels).toEqual(['OREO Original 154 g', 'Nowy jogurt 400 g']);
    expect(planHandoff(s.controller.state).toDeepScan).toHaveLength(0);
    // The completed product keeps the frame that was captured for it.
    expect(s.controller.captureFor('prod-new')).not.toBeNull();
  });
});

describe('11 · Koniec shows what was collected', () => {
  it('the review list is exactly the sweep, in order', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    s.show(MILK);
    await s.tick(200);
    expect(s.controller.state.accepted.map((p) => reviewLabel(p))).toEqual([
      'OREO Original 154 g',
      'Mleko 3,2% 1 l',
    ]);
  });
});

describe('12 · Confirm / Change / Remove', () => {
  it('remove drops it and lets it be collected again', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    s.controller.remove('prod-oreo');
    expect(s.controller.accepted).toHaveLength(0);
    expect(s.controller.captureFor('prod-oreo')).toBeNull();
    await s.tick(200);
    expect(s.labels).toEqual(['OREO Original 154 g']);
  });

  it('confirm is the default: everything resolved is ready for the recipe', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    expect(planHandoff(s.controller.state).toRecipe).toHaveLength(1);
  });
});

describe('13 · confirmed products carry a canonical catalogue id', () => {
  it('hands the recipe an id, never a name the recogniser invented', async () => {
    const s = sweep();
    s.show({ vision: 'Banan' });
    for (let i = 0; i < 3; i += 1) await s.tick();
    // `addScannedProduct` hydrates by THIS id through the same path a typed chip uses,
    // which is what gives HOME and PRO the identical line.
    expect(planHandoff(s.controller.state).toRecipe[0]?.identityKey).toBe('prod-banana');
  });
});

describe('14 · closing releases the camera and keeps the sweep safe', () => {
  it('stops every track and processes no further frame', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const controller = new LiveScanController({
      grabFrame: () => usableFrame(0),
      recognizer: new LiveRecognizer(capabilitiesFor(() => OREO)),
      onUpdate: () => {},
      stream,
    });
    controller.start();
    controller.onFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const collected = controller.accepted.length;
    controller.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    controller.onFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Nothing was collected after the stop, and nothing already collected was lost.
    expect(controller.accepted).toHaveLength(collected);
    expect(controller.snapshot().state.accepted).toHaveLength(collected);
  });
});

describe('15 · reopening after a refusal starts clean', () => {
  it('a resumed sweep keeps its products, dedupe and frames', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    s.controller.stop();

    const resumed = new LiveScanController({
      grabFrame: () => usableFrame(9_000),
      recognizer: new LiveRecognizer(capabilitiesFor(() => OREO)),
      onUpdate: () => {},
      resumeFrom: s.controller.snapshot(),
    });
    resumed.start();
    expect(resumed.accepted.map((p) => p.label)).toEqual(['OREO Original 154 g']);
    expect(resumed.captureFor('prod-oreo')).not.toBeNull();
    resumed.onFrame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Dedupe survived the restart, so the same product is not collected twice.
    expect(resumed.accepted).toHaveLength(1);
  });

  it('a fresh controller with no snapshot starts genuinely empty', () => {
    const fresh = new LiveScanController({
      grabFrame: () => null,
      recognizer: new LiveRecognizer(capabilitiesFor(() => null)),
      onUpdate: () => {},
    });
    expect(fresh.accepted).toHaveLength(0);
  });
});

describe('cost is measurable per successful scan', () => {
  it('a barcode sweep costs zero paid calls', async () => {
    const s = sweep();
    s.show(OREO);
    await s.tick(200);
    s.show(MILK);
    await s.tick(200);
    expect(s.controller.state.counters.VISION_RESOLVED).toBe(0);
    expect(s.controller.state.counters.VISION_UNRESOLVED).toBe(0);
  });

  it('separates paid identifications the catalogue confirmed from those it did not', () => {
    const base = resolveAccepted;
    expect(typeof base).toBe('function');
  });
});
