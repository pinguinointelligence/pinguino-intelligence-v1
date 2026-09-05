import { beforeEach, describe, expect, it } from 'vitest';
import type { RawCandidate } from '../candidates';
import { ScanCoreEngine, type EngineFrameInput } from '../engine';
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
const raw = (cx: number, cy: number, w: number, angle = 0): RawCandidate => ({
  quad: {
    points: [
      { x: cx - w / 2, y: cy - 40 },
      { x: cx + w / 2, y: cy - 40 },
      { x: cx + w / 2, y: cy + 40 },
      { x: cx - w / 2, y: cy + 40 },
    ],
  },
  orientationDeg: angle,
  score: 1,
  blockCount: 12,
});
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

describe('ScanCoreEngine', () => {
  beforeEach(() => resetTrackIds());

  it('tracks a 25 cm code, requests native ROI decodes, confirms on two agreeing frames and emits the decoder symbology', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let obs = null;
    for (let i = 0; i < 8 && !obs; i += 1) {
      const { record, requests } = e.processFrame(frame(i, [raw(540, 960, 216)]));
      expect(record.tracks[0]!.path).toBe('NATIVE_ROI');
      expect(requests).toHaveLength(1);
      expect(requests[0]!.source).toBe('native');
      if (i >= 5)
        obs = e.ingestDecode({
          trackId: requests[0]!.trackId,
          frameIndex: i,
          tMs: i * 33,
          source: 'native',
          items: [
            {
              text: '8410297112386',
              format: 'EAN13',
              checksumValid: true,
              lineCount: 5,
              error: '',
              hasGeometry: true,
            },
          ],
        });
    }
    expect(obs).not.toBeNull();
    expect(obs!.barcode.format).toBe('EAN-13');
    expect(obs!.barcode.value).toBe('8410297112386');
    expect(obs!.barcode.lane).toBe('fast');
    expect(obs!.barcode.sources).toEqual(['native']);
    const after = e.processFrame(frame(9, [raw(540, 960, 216)]));
    expect(after.record.scanState).toBe('COMPLETE');
    expect(after.requests).toHaveLength(0);
  });

  it('keeps two physical codes in separate tracks and confirms each independently', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_fast,
      zoomApproved: false,
    });
    const values = ['8410297112386', '8480000105745'];
    const seen = new Map<string, string>();
    for (let i = 0; i < 6 && seen.size < 2; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 600, 216), raw(540, 1400, 216)]));
      expect(requests.length).toBeGreaterThan(0);
      requests
        .sort((a, b) => a.roi.y - b.roi.y)
        .forEach((r, k) => {
          const obs = e.ingestDecode({
            trackId: r.trackId,
            frameIndex: i,
            tMs: i * 33,
            source: 'native',
            items: [
              {
                text: values[k]!,
                format: 'EAN13',
                checksumValid: true,
                lineCount: 5,
                error: '',
                hasGeometry: true,
              },
            ],
          });
          if (obs) seen.set(obs.trackId, obs.barcode.value!);
        });
    }
    expect([...seen.values()].sort()).toEqual(values.slice().sort());
    expect(seen.size).toBe(2);
  });

  it('records invalid hypotheses and error geometry as evidence without ever confirming', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let trackId = '';
    for (let i = 0; i < 4; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 960, 216)]));
      trackId = requests[0]!.trackId;
      const obs = e.ingestDecode({
        trackId,
        frameIndex: i,
        tMs: i * 33,
        source: 'native',
        items: [
          {
            text: '8410297112387',
            format: 'EAN13',
            checksumValid: false,
            lineCount: 2,
            error: 'ChecksumError',
            hasGeometry: true,
          },
          {
            text: '',
            format: '',
            checksumValid: false,
            lineCount: 0,
            error: 'FormatError',
            hasGeometry: true,
          },
        ],
      });
      expect(obs).toBeNull();
    }
    const t = e.tracker.tracks.find((x) => x.id === trackId)!;
    expect(t.evidence.filter((x) => x.kind === 'invalid_hypothesis')).toHaveLength(4);
    expect(t.evidence.filter((x) => x.kind === 'error_geometry')).toHaveLength(4);
    expect(t.confirmation.state.status).toBe('idle');
    expect(t.misses).toBe(4);
  });

  it('escalates per track: harder after two misses, retry against the best retained frames, rectify a tilted candidate after a miss', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let last = e.processFrame(frame(0, [raw(540, 960, 216, 25)]));
    expect(last.requests[0]!.harder).toBe(false);
    expect(last.requests[0]!.rectify).toBe(false);
    for (let i = 1; i <= 3; i += 1) {
      e.ingestDecode({
        trackId: last.requests[0]!.trackId,
        frameIndex: i - 1,
        tMs: (i - 1) * 33,
        source: last.requests[0]!.source,
        items: [],
      });
      last = e.processFrame(frame(i, [raw(540, 960, 216, 25)]));
    }
    expect(last.requests[0]!.harder).toBe(true);
    expect(last.requests[0]!.rectify).toBe(true);
    expect(last.requests[0]!.source).toBe('rectified');
    expect(last.requests[0]!.retryFrames.length).toBeGreaterThan(0);
  });

  it('with no candidate schedules a rescue full-frame decode at the tier cadence and keeps SEARCHING', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let rescues = 0;
    for (let i = 0; i < 30; i += 1) {
      const { record, requests } = e.processFrame(frame(i, []));
      rescues += requests.filter((r) => r.source === 'rescue').length;
      expect(record.scanState).toBe('SEARCHING');
    }
    expect(rescues).toBe(3);
  });

  it('respects the tier budget for native ROI decodes per second (weak phone)', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_weak,
      zoomApproved: false,
    });
    let native = 0;
    for (let i = 0; i < 30; i += 1)
      native += e
        .processFrame(frame(i, [raw(540, 960, 216)]))
        .requests.filter((r) => r.roi.plane === 'native').length;
    expect(native).toBeLessThanOrEqual(TIER_BUDGETS.phone_weak.nativeRoiPerSecond);
  });
});
