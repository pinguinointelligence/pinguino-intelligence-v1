/**
 * Worker-lane coordinate regressions for the turned-code defect (owner QA 2026-09-06). A recording
 * decoder stub captures exactly what the lane hands to zxing — dimensions and pixels — so each defect is
 * proved on the buffer itself rather than inferred from a decode that happened to fail.
 */
import { describe, expect, it } from 'vitest';
import type { DecodeOutcome, SaliencyResult } from '../../types';
import type { ZxingDecoder } from '../zxingAdapter';
import { ScanCoreLane } from '../scanCoreLane';

interface Handed {
  width: number;
  height: number;
  luma: Uint8Array;
}

/** Never decodes anything; records every buffer the lane submits. */
function recorder(): { dec: ZxingDecoder; handed: Handed[] } {
  const handed: Handed[] = [];
  const dec: ZxingDecoder = {
    version: 'stub',
    warmup: () => Promise.resolve(0),
    decodeLuma: (luma, width, height, variant) => {
      handed.push({ width, height, luma: luma.slice(0, width * height) });
      const out: DecodeOutcome = {
        variant,
        inputWidth: width,
        inputHeight: height,
        durationMs: 0,
        results: [],
        errorResultsWithGeometry: 0,
      };
      return Promise.resolve(out);
    },
  };
  return { dec, handed };
}

/** A luma plane whose every pixel encodes its own column, so a crop can be located by its content. */
function rampPlane(w: number, h: number): Uint8Array {
  const p = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) p[y * w + x] = (x * 251) % 256;
  return p;
}

const saliency = (
  cx: number,
  cy: number,
  len: number,
  bar: number,
  w: number,
  angleDeg = 0,
): SaliencyResult => {
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const p = (a: number, b: number) => ({ x: cx + ux * a - uy * b, y: cy + uy * a + ux * b });
  return {
    durationMs: 0,
    candidates: [
      {
        quad: {
          points: [
            p(-len / 2, -bar / 2),
            p(len / 2, -bar / 2),
            p(len / 2, bar / 2),
            p(-len / 2, bar / 2),
          ],
        },
        orientationDeg: angleDeg,
        score: 1,
        blockCount: 20,
        moduleEstimatePx: len / 95,
        fillRatio: len / w,
      },
    ],
    downscaledWidth: w,
    downscaledHeight: 0,
  };
};

const laneFor = (w: number, h: number) => {
  const lane = new ScanCoreLane();
  lane.setProfile(
    {
      formFactor: 'mobile',
      sourceW: w,
      sourceH: h,
      fps: 30,
      autofocus: true,
      zoomMax: null,
      torch: false,
      startSharpness: null,
    },
    4,
    false,
    8,
  );
  return lane;
};

const quality = { laplacianVar: 2000, meanLuma: 140, clippedHighRatio: 0 };

describe('DEFECT — the lane assumed the MEDIUM plane is always a ÷2 downscale', () => {
  /**
   * `planeSizes` returns factor 1 below a 960-px long edge, but the lane always downscaled by 2. The
   * policy sizes a 'medium' ROI in that plane's own coordinates, so on a small webcam the crop was taken
   * from a half-size plane with full-size coordinates: clamped, shrunken and in the wrong place.
   */
  it('crops a 640×480 frame from the FULL-resolution plane, at the requested size and position', async () => {
    const W = 640;
    const H = 480;
    const lane = laneFor(W, H);
    const { dec, handed } = recorder();
    const plane = rampPlane(W, H);
    // fill 0.55 → the LOW_MEDIUM path, which on this frame means factor 1
    const r = await lane.process(
      dec,
      plane,
      W,
      H,
      0,
      0,
      saliency(320, 240, 352, 90, W),
      null,
      quality,
    );
    const roi = r.decision.tracks[0]!.roi!;
    expect(roi.plane).toBe('medium');
    expect(handed).toHaveLength(1);
    expect(handed[0]!.width).toBe(roi.w);
    expect(handed[0]!.height).toBe(roi.h);
    // the ramp identifies the source column: first pixel of the crop must be column roi.x of the SOURCE
    expect(handed[0]!.luma[0]).toBe((roi.x * 251) % 256);
    expect(handed[0]!.luma[1]).toBe(((roi.x + 1) * 251) % 256);
  });

  it('still uses the ÷2 plane when the frame is large enough to have one', async () => {
    const W = 1080;
    const H = 1920;
    const lane = laneFor(W, H);
    const { dec, handed } = recorder();
    const r = await lane.process(
      dec,
      rampPlane(W, H),
      W,
      H,
      0,
      0,
      saliency(540, 960, 600, 150, W),
      null,
      quality,
    );
    const roi = r.decision.tracks[0]!.roi!;
    expect(roi.plane).toBe('medium');
    expect(handed[0]!.width).toBe(roi.w);
    // on the ÷2 plane a source column pair is averaged: column roi.x of the crop is source column 2·roi.x
    const src = 2 * roi.x;
    const expected = Math.round((((src * 251) % 256) + (((src + 1) * 251) % 256)) / 2);
    expect(Math.abs(handed[0]!.luma[0]! - expected)).toBeLessThanOrEqual(1);
  });
});

describe('DEFECT — the full-plane shortcut silently dropped the transpose', () => {
  /**
   * RESCUE_FULL is the only pass that runs when nothing is located at all, and the lane's full-plane
   * shortcut ignored `rotate90` — so a code the locator could not see was only ever scanned as rows.
   */
  it('hands the decoder a transposed plane when a full-plane request asks for it', async () => {
    const W = 640;
    const H = 480;
    const lane = laneFor(W, H);
    const { dec, handed } = recorder();
    const plane = rampPlane(W, H);
    const empty: SaliencyResult = {
      durationMs: 0,
      candidates: [],
      downscaledWidth: W,
      downscaledHeight: H,
    };
    // no candidate → rescue at the tier cadence; run enough frames to see both alternating axes
    for (let i = 0; i < 40; i += 1)
      await lane.process(dec, plane, W, H, i, i * 33, empty, null, quality);
    expect(handed.length).toBeGreaterThanOrEqual(2);
    const asCaptured = handed.filter((x) => x.width === W && x.height === H);
    const transposed = handed.filter((x) => x.width === H && x.height === W);
    expect(asCaptured.length).toBeGreaterThan(0);
    expect(transposed.length).toBeGreaterThan(0);
    // a 90° clockwise turn maps source (x, y) → (h−1−y, x): row 0 of the turned plane is source column 0
    const t = transposed[0]!;
    expect(t.luma[0]).toBe(plane[(H - 1) * W]);
    expect(t.luma[H]).toBe(plane[(H - 1) * W + 1]);
  });
});

describe('one crop, two axes', () => {
  it('copies the ROI once when both axis attempts share it', async () => {
    const W = 1080;
    const H = 1920;
    const lane = laneFor(W, H);
    const { dec, handed } = recorder();
    // 44° → unconfident axis → the engine attempts both axes on the same crop
    const r = await lane.process(
      dec,
      rampPlane(W, H),
      W,
      H,
      0,
      0,
      saliency(540, 960, 216, 80, W, 44),
      null,
      quality,
    );
    expect(r.decision.tracks[0]!.axisProbe).toBe(true);
    expect(handed).toHaveLength(2);
    const [a, b] = handed as [Handed, Handed];
    expect(a.width).toBe(b.height);
    expect(a.height).toBe(b.width);
  });
});
