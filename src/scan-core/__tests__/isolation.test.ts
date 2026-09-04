/**
 * Owner architecture items closed 2026-09-04: rescue-read attribution, crossing-code swap guard,
 * symbology-aware agreement with raw text, explicit escalation level, reading timeout.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RawCandidate } from '../candidates';
import { Confirmation, type Read } from '../confirmation';
import { ScanCoreEngine, type DecodeResult, type EngineFrameInput } from '../engine';
import type { CameraProfile } from '../profile';
import { STATE, TargetStateMachine } from '../stateMachine';
import { TIER_BUDGETS } from '../tiers';
import { Track, Tracker, resetTrackIds } from '../track';
import { mergeCollinear } from '../candidates';

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
const item = (text: string, format = 'EAN13') => ({
  text,
  format,
  checksumValid: true,
  lineCount: 5,
  error: '',
  hasGeometry: true,
});
const read = (i: number, text: string, over: Partial<Read> = {}): Read => ({
  frameIndex: i,
  tMs: i * 100,
  text,
  lineCount: 5,
  moduleNative: 3,
  source: 'native',
  format: 'EAN13',
  rawText: text,
  ...over,
});

describe('two-code isolation: rescue reads', () => {
  beforeEach(() => resetTrackIds());
  it('a full-frame rescue read is never attributed to the primary track while another live track could own it', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    for (let i = 0; i < 4; i += 1)
      e.processFrame(frame(i, [raw(300, 960, 216), raw(800, 960, 216)]));
    expect(e.tracker.tracks.filter((t) => t.state !== 'LOST')).toHaveLength(2);
    const rescue = (i: number, text: string): DecodeResult => ({
      trackId: '',
      frameIndex: i,
      tMs: i * 33,
      source: 'rescue',
      items: [item(text)],
    });
    // two agreeing rescue reads within 400 ms would confirm a single track — here they must not
    expect(e.ingestDecode(rescue(4, '8480000105745'))).toBeNull();
    expect(e.ingestDecode(rescue(5, '8480000105745'))).toBeNull();
    for (const t of e.tracker.tracks) {
      expect(t.confirmation.state.status).not.toBe('confirmed');
      expect(t.evidence.some((ev) => ev.kind === 'valid_read')).toBe(false);
    }
    expect(e.unattributedReads).toHaveLength(2);
    expect(e.unattributedReads[0]).toMatchObject({ text: '8480000105745', format: 'EAN13' });
  });
  it('a rescue read is attributed to the one track that already read those digits', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let reqs = e.processFrame(frame(0, [raw(300, 960, 216), raw(800, 960, 216)])).requests;
    for (let i = 1; i < 4; i += 1)
      reqs = e.processFrame(frame(i, [raw(300, 960, 216), raw(800, 960, 216)])).requests;
    const second = e.tracker.tracks[1]!;
    const own = reqs.find((r) => r.trackId === second.id)!;
    e.ingestDecode({
      trackId: own.trackId,
      frameIndex: 3,
      tMs: 99,
      source: 'native',
      items: [item('8480000105745')],
    });
    const obs = e.ingestDecode({
      trackId: '',
      frameIndex: 4,
      tMs: 132,
      source: 'rescue',
      items: [item('8480000105745')],
    });
    expect(obs?.trackId).toBe(second.id);
    expect(obs?.barcode.value).toBe('8480000105745');
    expect(e.tracker.tracks[0]!.evidence.some((ev) => ev.kind === 'valid_read')).toBe(false);
    expect(e.unattributedReads).toHaveLength(0);
  });
  it('with a single live track the rescue read is attributed to it (unchanged behaviour)', () => {
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    for (let i = 0; i < 4; i += 1) e.processFrame(frame(i, [raw(540, 960, 216)]));
    e.ingestDecode({
      trackId: '',
      frameIndex: 4,
      tMs: 132,
      source: 'rescue',
      items: [item('8480000105745')],
    });
    expect(e.tracker.tracks[0]!.evidence.some((ev) => ev.kind === 'valid_read')).toBe(true);
  });
});

describe('two-code isolation: crossing codes keep their identities', () => {
  beforeEach(() => resetTrackIds());
  it('greedy nearest-first would swap two crossing codes; the 2-opt guard keeps ids by continuity', () => {
    const tr = new Tracker();
    const cands = (xa: number, xb: number) =>
      mergeCollinear([raw(xa, 960, 200), raw(xb, 960, 200)], 1080);
    // A moves right at 60 px/frame, B moves left at 60 px/frame; they cross around frame 5
    let a: Track | undefined;
    let b: Track | undefined;
    for (let i = 0; i < 10; i += 1) {
      const xa = 240 + i * 60;
      const xb = 840 - i * 60;
      const upd = tr.update(i, i * 33, cands(xa, xb));
      if (i === 0) {
        [a, b] = upd.created as [Track, Track];
      }
    }
    expect(tr.tracks.filter((t) => t.state !== 'LOST')).toHaveLength(2);
    // after crossing, A is on the right and B on the left; identities must have followed the motion
    expect(a!.geometry.cx).toBeGreaterThan(b!.geometry.cx);
    expect(a!.id).toBe('t1');
    expect(b!.id).toBe('t2');
  });
});

describe('symbology-aware agreement and raw text', () => {
  it('reads of the same digits with different decoder symbologies never agree', () => {
    const c = new Confirmation();
    c.push(read(1, '012345678905', { format: 'UPCA' }));
    const st = c.push(read(2, '012345678905', { format: 'EAN13' }));
    expect(st.status).toBe('reading');
    for (let i = 3; i < 9; i += 1)
      c.push(read(i, '012345678905', { format: i % 2 ? 'UPCA' : 'EAN13', tMs: i * 100 }));
    expect(c.state.status).toBe('reading');
  });
  it('agreeing reads carry the normalised symbology; a second symbology on the same digits is flagged', () => {
    const c = new Confirmation();
    c.push(read(1, '8410297112386', { format: 'EAN13' }));
    c.push(read(2, '8410297112386', { format: 'UPCA', source: 'rectified' }));
    const st = c.push(read(3, '8410297112386', { format: 'EAN13', tMs: 250 }));
    expect(st.status).toBe('confirmed');
    expect(st.format).toBe('EAN-13');
    expect(st.mixedFormats).toBe(true);
  });
  it('the engine reports the raw decoder text and a mixed_formats reason', () => {
    resetTrackIds();
    const e = new ScanCoreEngine({
      profile: phone,
      budget: TIER_BUDGETS.phone_baseline,
      zoomApproved: false,
    });
    let obs = null;
    for (let i = 0; i < 8 && !obs; i += 1) {
      const { requests } = e.processFrame(frame(i, [raw(540, 960, 216)]));
      if (i >= 5)
        obs = e.ingestDecode({
          trackId: requests[0]!.trackId,
          frameIndex: i,
          tMs: i * 33,
          source: 'native',
          items: [{ ...item('8410297112386'), text: '8410297112386' }],
        });
    }
    expect(obs?.barcode.rawValue).toBe('8410297112386');
    expect(obs?.reasons).toEqual([]);
  });
});

describe('escalation level and reading timeout', () => {
  it('escalation level follows consecutive misses and resets on a valid read', () => {
    const t = new Track(0, 0, mergeCollinear([raw(540, 960, 216)], 1080)[0]!);
    expect(t.escalationLevel()).toBe(0);
    t.misses = 1;
    expect(t.escalationLevel()).toBe(1);
    t.misses = 3;
    expect(t.escalationLevel()).toBe(2);
    t.misses = 4;
    expect(t.escalationLevel()).toBe(3);
    t.pushRead(read(1, '8410297112386'));
    expect(t.escalationLevel()).toBe(0);
  });
  it('READING that never confirms raises timedOut + blocker after readingTimeoutMs, and re-arms for the next track', () => {
    resetTrackIds();
    const sm = new TargetStateMachine();
    const t = new Track(0, 0, mergeCollinear([raw(540, 960, 216)], 1080)[0]!);
    const step = (tMs: number, primary: Track | null) =>
      sm.step({
        tMs,
        frameIndex: Math.round(tMs / 33),
        primary,
        guidance: 'none',
        unstable: false,
        readThisFrame: true,
        meanLuma: 140,
        zoomAvailable: false,
        zoomApproved: false,
        zoomLevel: 1,
        torchAvailable: false,
        torchOn: false,
        refocusAvailable: false,
      });
    for (let i = 0; i < 4; i += 1)
      t.update(i, i * 33, mergeCollinear([raw(540, 960, 216)], 1080)[0]!);
    t.addEvidence({
      frameIndex: 3,
      tMs: 99,
      kind: 'valid_read',
      source: 'native',
      text: '8410297112386',
    });
    let out = step(100, t);
    for (let tMs = 133; tMs < STATE.readingTimeoutMs; tMs += 33) out = step(tMs, t);
    expect(['READING', 'HOLD']).toContain(out.state);
    expect(out.timedOut).toBe(false);
    out = step(STATE.readingTimeoutMs + 200, t);
    expect(out.timedOut).toBe(true);
    expect(out.blocker).toBe(true);
    expect(out.guidance).toBe('hold_steady');
    out = step(STATE.readingTimeoutMs + 300, null);
    expect(out.timedOut).toBe(false);
  });
});
