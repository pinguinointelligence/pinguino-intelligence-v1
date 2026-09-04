import { beforeEach, describe, expect, it } from 'vitest';
import type { MergedCandidate } from '../candidates';
import { Tracker, resetTrackIds, TRACK } from '../track';

const cand = (cx: number, cy: number, w = 300, angle = 0): MergedCandidate => ({
  fill: w / 1080,
  widthPx: w,
  heightPx: w * 0.3,
  angleDeg: angle,
  cx,
  cy,
  pieces: 1,
  score: 1,
});

describe('Tracker', () => {
  beforeEach(() => resetTrackIds());

  it('keeps one identity for a barcode that moves at hand speed and reaches FOUND after 3 frames', () => {
    const tr = new Tracker();
    let t: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const u = tr.update(i, i * 33, [cand(500 + i * 12, 900 + i * 6)]);
      const track = u.assigned[0]?.track ?? u.created[0]!;
      t ??= track.id;
      expect(track.id).toBe(t);
    }
    expect(tr.tracks).toHaveLength(1);
    expect(tr.tracks[0]!.state).toBe('FOUND');
    expect(tr.tracks[0]!.frames).toBe(6);
  });

  it('isolates two physical barcodes into two tracks and never mixes their reads', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(300, 600), cand(300, 1300)]);
    const u = tr.update(1, 33, [cand(305, 605), cand(298, 1302)]);
    expect(tr.tracks).toHaveLength(2);
    const [a, b] = u.assigned.map((x) => x.track);
    a!.pushRead({
      frameIndex: 1,
      tMs: 33,
      text: '8410297112386',
      lineCount: 5,
      moduleNative: 2.5,
      source: 'native',
    });
    b!.pushRead({
      frameIndex: 1,
      tMs: 33,
      text: '8480000105745',
      lineCount: 5,
      moduleNative: 2.5,
      source: 'native',
    });
    a!.pushRead({
      frameIndex: 2,
      tMs: 66,
      text: '8410297112386',
      lineCount: 5,
      moduleNative: 2.5,
      source: 'native',
    });
    expect(a!.state).toBe('COMPLETE');
    expect(a!.confirmation.state.value).toBe('8410297112386');
    expect(b!.state).toBe('READING');
    expect(b!.confirmation.state.value).toBe('8480000105745');
  });

  it('marks a track LOST after 500 ms without observation and re-creates an id for a returning code', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(500, 900)]);
    tr.update(1, 33, [cand(500, 900)]);
    const u = tr.update(2, 600, []);
    expect(u.lost).toHaveLength(1);
    expect(tr.tracks[0]!.state).toBe('LOST');
    const back = tr.update(3, 700, [cand(500, 900)]);
    expect(back.created).toHaveLength(1);
    expect(back.created[0]!.id).not.toBe(u.lost[0]!.id);
  });

  it('predicts motion between observations (constant velocity)', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(100, 900)]);
    tr.update(1, 100, [cand(200, 900)]);
    const p = tr.tracks[0]!.predict(200);
    expect(p.cx).toBeGreaterThan(240);
    expect(p.cx).toBeLessThanOrEqual(300);
  });

  it('keeps bounded evidence and best-frame descriptors per track', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(500, 900)]);
    const t = tr.tracks[0]!;
    for (let i = 0; i < TRACK.evidenceCap + 20; i += 1)
      t.addEvidence({ frameIndex: i, tMs: i, kind: 'error_geometry', source: 'none' });
    expect(t.evidence).toHaveLength(TRACK.evidenceCap);
    t.considerBest(5, { sharpness: 1200, contrast: 80, moduleNative: 2.1, tiltDeg: 12 });
    t.considerBest(9, { sharpness: 2400, contrast: 60, moduleNative: 1.9, tiltDeg: 3 });
    expect(t.best.get('sharpest')!.frameIndex).toBe(9);
    expect(t.best.get('contrast')!.frameIndex).toBe(5);
    expect(t.best.get('largestModule')!.frameIndex).toBe(5);
    expect(t.best.get('leastTilt')!.frameIndex).toBe(9);
    expect(t.retryFrames()).toEqual([9, 5]);
  });

  it('invalid hypotheses are stored with provenance and never change the confirmation', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(500, 900)]);
    const t = tr.tracks[0]!;
    t.addEvidence({
      frameIndex: 1,
      tMs: 33,
      kind: 'invalid_hypothesis',
      source: 'native',
      text: '8410297112387',
      error: 'ChecksumError',
    });
    expect(t.confirmation.state.status).toBe('idle');
    expect(t.evidence[0]!.kind).toBe('invalid_hypothesis');
  });

  it('picks the primary track as the largest, most central one', () => {
    const tr = new Tracker();
    tr.update(0, 0, [cand(540, 960, 320), cand(150, 200, 200)]);
    expect(tr.primary(1080, 1920)!.geometry.widthPx).toBe(320);
  });
});
