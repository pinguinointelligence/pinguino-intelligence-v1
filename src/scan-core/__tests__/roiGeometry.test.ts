/**
 * Coordinate defects on the VERTICAL / ROTATED reading path (owner QA 2026-09-06). Each of these made the
 * crop wrong even when the axis decision was right, so turning the tin was the only thing that worked.
 *
 *  1. a fractional ROI reached the worker, which truncates it inside `plane.subarray(...)` — the crop was
 *     taken half a row off, on the vertical path only;
 *  2. the ROI was clamped against the PROFILE's dimensions (`track.getSettings()`), which on a portrait
 *     phone are transposed relative to the frame the worker actually holds — the crop floored to nothing;
 *  3. the crop was always shaped for a HORIZONTAL code (widthPx on x, heightPx on y) with no reference to
 *     the candidate's angle, so a diagonal code was never inside its own ROI.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RawCandidate } from '../candidates';
import { ScanCoreEngine, swapRoiAboutCentre, type EngineFrameInput } from '../engine';
import type { CameraProfile } from '../profile';
import { TIER_BUDGETS } from '../tiers';
import { resetTrackIds } from '../track';

const raw = (cx: number, cy: number, len: number, angle: number, bar: number): RawCandidate => {
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  const p = (a: number, b: number) => ({ x: cx + ux * a + vx * b, y: cy + uy * a + vy * b });
  return {
    quad: {
      points: [
        p(-len / 2, -bar / 2),
        p(len / 2, -bar / 2),
        p(len / 2, bar / 2),
        p(-len / 2, bar / 2),
      ],
    },
    orientationDeg: angle,
    score: 1,
    blockCount: 12,
  };
};

const frame = (
  i: number,
  cands: RawCandidate[],
  over: Partial<EngineFrameInput> = {},
): EngineFrameInput => ({
  frameIndex: i,
  tMs: i * 33,
  sourceW: 1080,
  sourceH: 1920,
  candidates: cands,
  sharpness: 2000,
  meanLuma: 140,
  clippedRatio: 0,
  workerDuty: 0.3,
  zoomLevel: 1,
  torchOn: false,
  zoomAvailable: true,
  torchAvailable: true,
  refocusAvailable: false,
  ...over,
});

const portrait: CameraProfile = {
  formFactor: 'mobile',
  sourceW: 1080,
  sourceH: 1920,
  fps: 30,
  autofocus: true,
  zoomMax: 8,
  torch: true,
  startSharpness: 2000,
};

describe('DEFECT 1 — a fractional ROI reaches the worker and is truncated mid-row', () => {
  beforeEach(() => resetTrackIds());

  it('never emits a decode request whose ROI is not whole pixels, at any orientation or size', () => {
    for (const angle of [0, 30, 44, 45, 60, 90, 135, 200, 270]) {
      for (let len = 200; len <= 260; len += 7) {
        for (let bar = 55; bar <= 105; bar += 9) {
          resetTrackIds();
          const e = new ScanCoreEngine({
            profile: portrait,
            budget: TIER_BUDGETS.phone_fast,
            zoomApproved: false,
          });
          const { requests } = e.processFrame(frame(0, [raw(540, 960, len, angle, bar)]));
          for (const r of requests) {
            const label = `angle ${angle} len ${len} bar ${bar} → ${JSON.stringify(r.roi)}`;
            expect(Number.isInteger(r.roi.x), label).toBe(true);
            expect(Number.isInteger(r.roi.y), label).toBe(true);
            expect(Number.isInteger(r.roi.w), label).toBe(true);
            expect(Number.isInteger(r.roi.h), label).toBe(true);
          }
        }
      }
    }
  });

  it('swapRoiAboutCentre returns whole pixels inside the plane even when w − h is odd', () => {
    const r = swapRoiAboutCentre({ x: 10, y: 20, w: 101, h: 40, plane: 'native' }, 1080, 1920);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(Number.isInteger(r.y)).toBe(true);
    expect(r.w).toBe(40);
    expect(r.h).toBe(101);
    // and it must not leave the plane
    const edge = swapRoiAboutCentre({ x: 0, y: 0, w: 401, h: 20, plane: 'native' }, 1080, 1920);
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.w).toBeLessThanOrEqual(1080);
    expect(edge.y + edge.h).toBeLessThanOrEqual(1920);
  });
});

describe('DEFECT 2 — the profile dimensions are transposed relative to the frame', () => {
  beforeEach(() => resetTrackIds());

  /**
   * `track.getSettings()` reports 1920×1080 while `video.videoWidth/Height` (what the worker holds)
   * is 1080×1920. The policy clamped the ROI against the profile, so a candidate in the lower half of
   * the frame produced y1 < y0 → h = 0 and the lane floored it to a ONE-PIXEL-TALL crop.
   */
  const landscapeSettings: CameraProfile = { ...portrait, sourceW: 1920, sourceH: 1080 };

  it('sizes the ROI against the FRAME, so a candidate low in a portrait frame is not floored away', () => {
    const e = new ScanCoreEngine({
      profile: landscapeSettings,
      budget: TIER_BUDGETS.phone_fast,
      zoomApproved: false,
    });
    const { record, requests } = e.processFrame(
      frame(0, [raw(540, 1500, 216, 0, 80)], { sourceW: 1080, sourceH: 1920 }),
    );
    expect(requests.length).toBeGreaterThan(0);
    const roi = requests[0]!.roi;
    expect(roi.h).toBeGreaterThan(1);
    expect(roi.w).toBeGreaterThan(1);
    // the ROI must contain the candidate centre and stay inside the real frame
    expect(roi.y).toBeLessThan(1500);
    expect(roi.y + roi.h).toBeGreaterThan(1500);
    expect(roi.x + roi.w).toBeLessThanOrEqual(1080);
    expect(roi.y + roi.h).toBeLessThanOrEqual(1920);
    // and the module estimate must be read off the frame width, not the transposed one
    expect(record.tracks[0]!.moduleNative).toBeCloseTo((216 / 1080) * (1080 / 95), 2);
  });
});

describe('DEFECT 3 — the crop was always shaped for a horizontal code', () => {
  beforeEach(() => resetTrackIds());

  const roiFor = (angle: number) => {
    resetTrackIds();
    const e = new ScanCoreEngine({
      profile: portrait,
      budget: TIER_BUDGETS.phone_fast,
      zoomApproved: false,
    });
    return e.processFrame(frame(0, [raw(540, 960, 216, angle, 80)])).requests[0]!.roi;
  };

  /** corners of the code box at `angle`, which every attempt's ROI must contain */
  const corners = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const out: Array<{ x: number; y: number }> = [];
    for (const a of [-108, 108])
      for (const b of [-40, 40]) out.push({ x: 540 + ux * a - uy * b, y: 960 + uy * a + ux * b });
    return out;
  };

  it('contains the whole code at 0°, 45° and 90°', () => {
    for (const angle of [0, 45, 90]) {
      const roi = roiFor(angle);
      for (const c of corners(angle)) {
        const label = `angle ${angle}: ${JSON.stringify(roi)} must contain ${JSON.stringify(c)}`;
        expect(roi.x, label).toBeLessThanOrEqual(c.x);
        expect(roi.x + roi.w, label).toBeGreaterThanOrEqual(c.x);
        expect(roi.y, label).toBeLessThanOrEqual(c.y);
        expect(roi.y + roi.h, label).toBeGreaterThanOrEqual(c.y);
      }
    }
  });

  it('leaves the horizontal crop exactly as it was (no regression for the common case)', () => {
    const roi = roiFor(0);
    // widthPx 216 with the narrow 0.15 margin, bar height 80
    expect(roi.w).toBe(282);
    expect(roi.h).toBe(104);
  });
});
