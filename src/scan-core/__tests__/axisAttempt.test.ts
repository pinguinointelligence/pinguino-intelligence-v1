/**
 * OWNER QA 2026-09-06: "a barcode that is vertical or sideways is not read — I have to turn the tin
 * until the digits point downward."
 *
 * Root cause at engine level: the reading axis was a DECISION (one boolean, one DecodeRequest) and never
 * an ATTEMPT. When the estimate was wrong the same wrong estimate was reproduced every frame, so the
 * customer saw no progress at all and the only lever left was rotating the product.
 *
 * These tests prove the engine now ATTEMPTS both axes when the estimate is not trustworthy, and LATCHES
 * onto the axis that actually reads so the work returns to one decode per frame.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mergeCollinear, type RawCandidate } from '../candidates';
import { ScanCoreEngine, type DecodeRequest, type EngineFrameInput } from '../engine';
import type { CameraProfile } from '../profile';
import { TIER_BUDGETS } from '../tiers';
import { resetTrackIds } from '../track';

const phone: CameraProfile = {
  formFactor: 'mobile',
  sourceW: 1080,
  sourceH: 1920,
  fps: 30,
  autofocus: true,
  zoomMax: 8,
  torch: true,
  startSharpness: 2000,
};

/** a saliency fragment of length `len` at `angle`, centred on (cx, cy) */
const raw = (cx: number, cy: number, len: number, angle = 0, bar = 80): RawCandidate => {
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

const newEngine = () =>
  new ScanCoreEngine({ profile: phone, budget: TIER_BUDGETS.phone_fast, zoomApproved: false });

const EAN = '8410297112386';
const validItem = {
  text: EAN,
  format: 'EAN13',
  checksumValid: true,
  lineCount: 5,
  error: '',
  hasGeometry: true,
};

/** every request came back with nothing readable — the miss the live lane would report */
const missAll = (e: ScanCoreEngine, reqs: DecodeRequest[], i: number) => {
  for (const r of reqs)
    e.ingestDecode({
      trackId: r.trackId,
      frameIndex: i,
      tMs: i * 33,
      source: r.source,
      rotate90: r.rotate90,
      items: [],
    });
};

describe('reading axis: attempt, not bet', () => {
  beforeEach(() => resetTrackIds());

  it('a diagonal code (near the 45° axis boundary) is attempted on BOTH axes in the same frame', () => {
    const e = newEngine();
    const { requests } = e.processFrame(frame(0, [raw(540, 960, 216, 44)]));
    expect(requests.length).toBe(2);
    expect(requests.map((r) => r.rotate90).sort()).toEqual([false, true]);
    // one code, one crop: both attempts read the same pixels, only the scan axis differs
    expect(requests[0]!.trackId).toBe(requests[1]!.trackId);
    expect(requests[1]!.roi).toEqual(requests[0]!.roi);
  });

  it('a confident axis estimate still costs exactly one decode per frame', () => {
    const e = newEngine();
    for (let i = 0; i < 5; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 960, 216, 0)]));
      expect(requests).toHaveLength(1);
      expect(requests[0]!.rotate90).toBe(false);
    }
  });

  it('a WRONG but confident axis estimate is corrected within a bounded number of frames', () => {
    // The candidate reports 0° (bars vertical → scan horizontally) and is perfectly confident, but the
    // physical code is turned: every horizontal decode misses. Before this change the engine emitted the
    // same horizontal request forever. It must now probe the other axis.
    const e = newEngine();
    let transposedAt: number | null = null;
    for (let i = 0; i < 6 && transposedAt === null; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 960, 216, 0)]));
      if (requests.some((r) => r.rotate90)) transposedAt = i;
      else missAll(e, requests, i);
    }
    expect(transposedAt).not.toBeNull();
    expect(transposedAt!).toBeLessThanOrEqual(4);
  });

  it('latches on the axis that reads and stops the other attempt, then confirms on that axis', () => {
    const e = newEngine();
    // frames 0-2: horizontal estimate, all misses → the engine starts probing both axes
    let reqs: DecodeRequest[] = [];
    for (let i = 0; i < 4; i += 1) {
      reqs = e.processFrame(frame(i, [raw(540, 960, 216, 0)])).requests;
      if (reqs.some((r) => r.rotate90)) break;
      missAll(e, reqs, i);
    }
    const probe = reqs.find((r) => r.rotate90)!;
    expect(probe).toBeDefined();
    // the transposed attempt is the one that reads
    for (const r of reqs)
      e.ingestDecode({
        trackId: r.trackId,
        frameIndex: 4,
        tMs: 4 * 33,
        source: r.source,
        rotate90: r.rotate90,
        items: r.rotate90 ? [validItem] : [],
      });
    // next frame: one attempt only, and it is the winning axis
    const after = e.processFrame(frame(5, [raw(540, 960, 216, 0)]));
    expect(after.requests).toHaveLength(1);
    expect(after.requests[0]!.rotate90).toBe(true);
    // a second agreeing read on the latched axis confirms through the unchanged contract
    const obs = e.ingestDecode({
      trackId: after.requests[0]!.trackId,
      frameIndex: 5,
      tMs: 5 * 33,
      source: after.requests[0]!.source,
      rotate90: true,
      items: [validItem],
    });
    expect(obs?.barcode.value).toBe(EAN);
    expect(obs?.barcode.verified).toBe(true);
  });

  it('the latch is self-healing: if the latched axis stops reading, the probe re-opens', () => {
    const e = newEngine();
    let reqs = e.processFrame(frame(0, [raw(540, 960, 216, 0)])).requests;
    e.ingestDecode({
      trackId: reqs[0]!.trackId,
      frameIndex: 0,
      tMs: 0,
      source: reqs[0]!.source,
      rotate90: false,
      items: [validItem],
    });
    reqs = e.processFrame(frame(1, [raw(540, 960, 216, 0)])).requests;
    expect(reqs).toHaveLength(1);
    for (let i = 1; i < 6; i += 1) {
      missAll(e, reqs, i);
      reqs = e.processFrame(frame(i + 1, [raw(540, 960, 216, 0)])).requests;
      if (reqs.length > 1) break;
    }
    expect(reqs.map((r) => r.rotate90).sort()).toEqual([false, true]);
  });

  it('successive full-frame rescue passes alternate the axis instead of always scanning rows', () => {
    const e = newEngine();
    const rescues: boolean[] = [];
    for (let i = 0; i < 40; i += 1)
      for (const r of e.processFrame(frame(i, [])).requests)
        if (r.source === 'rescue') rescues.push(r.rotate90);
    expect(rescues.length).toBeGreaterThanOrEqual(2);
    expect(new Set(rescues).size).toBe(2);
  });

  it('a track that only ever reads through the rectified crop escalates its RAW attempts', () => {
    /* §17 of the confirmation contract needs one non-rectified agreeing read, so a rectified-only track
       can never confirm — and every rectified read resets the miss ladder that would have escalated the
       raw crop, so it used to sit there reading the same value until the reading timeout. */
    const e = newEngine();
    let reqs = e.processFrame(frame(0, [raw(540, 960, 216, 30)])).requests;
    let sawRectified = false;
    const rawAfterFirstRead: DecodeRequest[] = [];
    const rectifiedRequests: DecodeRequest[] = [];
    for (let i = 0; i < 8; i += 1) {
      for (const r of reqs) {
        if (r.source === 'rectified') rectifiedRequests.push(r);
        else if (sawRectified) rawAfterFirstRead.push(r);
        e.ingestDecode({
          trackId: r.trackId,
          frameIndex: i,
          tMs: i * 33,
          source: r.source,
          rotate90: r.rotate90,
          // only the rectified crop ever reads
          items: r.source === 'rectified' ? [validItem] : [],
        });
        if (r.source === 'rectified') sawRectified = true;
      }
      reqs = e.processFrame(frame(i + 1, [raw(540, 960, 216, 30)])).requests;
    }
    expect(rectifiedRequests.length).toBeGreaterThan(0);
    expect(rawAfterFirstRead.length).toBeGreaterThan(0);
    // the raw attempts get zxing's own retry ladder; the rectified one, which already reads, does not
    expect(rawAfterFirstRead.every((r) => r.harder)).toBe(true);
    expect(rectifiedRequests.every((r) => !r.harder)).toBe(true);
    // and the track never confirms from rectified reads alone (§17 untouched)
    expect(e.tracker.tracks[0]!.confirmation.state.status).not.toBe('confirmed');
  });

  it('both attempts spend the tier ROI budget, so probing never raises decodes per second', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_weak,
      zoomApproved: false,
    });
    let native = 0;
    for (let i = 0; i < 30; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 960, 216, 44)]));
      native += requests.filter((r) => r.roi.plane === 'native').length;
      missAll(e, requests, i);
    }
    expect(native).toBeLessThanOrEqual(TIER_BUDGETS.phone_weak.nativeRoiPerSecond);
  });
});

describe('axis confidence comes from the bar evidence, not from whichever fragment anchored the group', () => {
  it('an unambiguous orientation is confident; one near the 45° boundary is not', () => {
    expect(mergeCollinear([raw(540, 960, 216, 0)], 1080)[0]!.axisConfidence).toBeGreaterThan(0.6);
    expect(mergeCollinear([raw(540, 960, 216, 90)], 1080)[0]!.axisConfidence).toBeGreaterThan(0.6);
    expect(mergeCollinear([raw(540, 960, 216, 44)], 1080)[0]!.axisConfidence).toBeLessThan(0.6);
  });

  it('the merged angle is the evidence-weighted consensus of the group, not the anchor fragment', () => {
    // two collinear pieces of one code, 10° apart; the weak anchor is listed first
    const anchor: RawCandidate = { ...raw(400, 960, 100, 38), score: 0.2, blockCount: 2 };
    const bulk: RawCandidate = { ...raw(510, 1046, 180, 48), score: 1, blockCount: 40 };
    const merged = mergeCollinear([anchor, bulk], 1080);
    expect(merged).toHaveLength(1);
    // the consensus must sit near the heavy fragment (48°), not at the anchor's 38°
    expect(merged[0]!.angleDeg).toBeGreaterThan(44);
  });
});
