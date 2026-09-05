import { describe, expect, it } from 'vitest';
import { PolicyState, THRESHOLDS, type Candidate, type FrameSignals } from '../policy';
import { moduleNativePx, planeSizes, type CameraProfile } from '../profile';

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
const webcam720: CameraProfile = {
  formFactor: 'desktop',
  sourceW: 1280,
  sourceH: 720,
  fps: 30,
  autofocus: false,
  zoomMax: null,
  torch: false,
  startSharpness: 800,
};

const cand = (fill: number, sourceW = 1080, cx = 540, cy = 960): Candidate => ({
  fill,
  widthPx: fill * sourceW,
  heightPx: fill * sourceW * 0.3,
  angleDeg: 0,
  cx,
  cy,
});
const sig = (i: number, over: Partial<FrameSignals>): FrameSignals => ({
  frameIndex: i,
  tMs: i * 33,
  candidate: null,
  sharpness: 2000,
  meanLuma: 140,
  clippedRatio: 0,
  workerDuty: 0.3,
  zoomApplied: false,
  ...over,
});

describe('planes', () => {
  it('derives LOW/MEDIUM/NATIVE from one source', () => {
    expect(planeSizes(phone)).toEqual({
      low: { w: 360, h: 640, factor: 3 },
      medium: { w: 540, h: 960, factor: 2 },
      native: { w: 1080, h: 1920, factor: 1 },
    });
    expect(planeSizes(webcam720).low).toEqual({ w: 426, h: 240, factor: 3 });
  });
  it('module estimate matches the corpus (fill 0.20 on 1080 ≈ 2.3 px)', () => {
    expect(moduleNativePx(0.2, 1080)).toBeCloseTo(2.27, 2);
  });
});

describe('path selection (evidence-derived thresholds)', () => {
  it('large close code → LOW_MEDIUM crop on the medium plane', () => {
    const p = new PolicyState(phone);
    const d = p.decide(sig(1, { candidate: cand(0.4) }));
    expect(d.path).toBe('LOW_MEDIUM');
    expect(d.roi?.plane).toBe('medium');
    expect(d.roi!.w).toBeGreaterThan(200);
  });
  it('25 cm class (fill 0.20) → NATIVE_ROI with the narrow margin', () => {
    const d = new PolicyState(phone).decide(sig(1, { candidate: cand(0.2) }));
    expect(d.path).toBe('NATIVE_ROI');
    expect(d.roi?.plane).toBe('native');
    expect(d.moduleNative).toBeCloseTo(2.27, 2);
  });
  it('small fill below 0.2 widens the crop margin (table 3: ROI 0 % below fill 0.12 at 12 %)', () => {
    const narrow = new PolicyState(phone).decide(sig(1, { candidate: cand(0.25) })).roi!;
    const wide = new PolicyState(phone).decide(sig(1, { candidate: cand(0.18) })).roi!;
    expect(wide.w / (0.18 * 1080)).toBeGreaterThan(narrow.w / (0.25 * 1080));
  });
  it('far code (module < 1.7 px) → FAR_NATIVE_ROI, harder, zoom only when approved', () => {
    const noZoom = new PolicyState(phone).decide(sig(1, { candidate: cand(0.1) }));
    expect(noZoom.path).toBe('FAR_NATIVE_ROI');
    expect(noZoom.harder).toBe(true);
    expect(noZoom.requestZoom).toBe(false);
    expect(noZoom.guidance).toBe('move_closer');
    const zoom = new PolicyState(phone, true).decide(sig(1, { candidate: cand(0.1) }));
    expect(zoom.requestZoom).toBe(true);
  });
  it('blur below 0.5× the running median skips decoding; persistent blur guides by fill', () => {
    const p = new PolicyState(phone);
    for (let i = 0; i < 10; i += 1) p.decide(sig(i, { candidate: cand(0.2), sharpness: 2000 }));
    const d1 = p.decide(sig(10, { candidate: cand(0.35), sharpness: 600 }));
    expect(d1.path).toBe('SKIP_BLUR');
    expect(d1.guidance).toBe('none');
    const d2 = p.decide(sig(30, { candidate: cand(0.35), sharpness: 600 }));
    expect(d2.guidance).toBe('move_away');
  });
  it('fixed-focus camera never waits for focus: blur → distance guidance immediately after the grace period', () => {
    const p = new PolicyState(webcam720);
    for (let i = 0; i < 10; i += 1)
      p.decide(sig(i, { candidate: cand(0.2, 1280), sharpness: 800 }));
    const d = p.decide(sig(40, { candidate: cand(0.2, 1280), sharpness: 200 }));
    expect(d.path).toBe('SKIP_BLUR');
    expect(d.guidance).toBe('move_closer');
  });
  it('instability (≥ 0.2) is a modifier: same plane, no harder retry, no zoom, hold-steady guidance', () => {
    const p = new PolicyState(phone, true);
    p.decide(sig(1, { candidate: cand(0.2, 1080, 300, 900) }));
    p.noteMiss();
    p.noteMiss();
    const d = p.decide(sig(2, { candidate: cand(0.2, 1080, 700, 900) }));
    expect(d.path).toBe('NATIVE_ROI');
    expect(d.harder).toBe(false);
    expect(d.guidance).toBe('hold_steady');
    expect(d.stab!).toBeGreaterThanOrEqual(THRESHOLDS.motionStab);
    const far = new PolicyState(phone, true);
    far.decide(sig(1, { candidate: cand(0.1, 1080, 300, 900) }));
    expect(far.decide(sig(2, { candidate: cand(0.1, 1080, 700, 900) })).requestZoom).toBe(false);
  });
  it('a large candidate that vanishes with the sharpness → move_away (too close for the lens)', () => {
    const p = new PolicyState(phone);
    for (let i = 0; i < 10; i += 1) p.decide(sig(i, { candidate: cand(0.36), sharpness: 2000 }));
    const d = p.decide(sig(11, { candidate: null, sharpness: 300 }));
    expect(['SKIP_NO_CANDIDATE', 'RESCUE_FULL']).toContain(d.path);
    expect(d.guidance).toBe('move_away');
  });
  it('no candidate: rescue every 10th frame, every 20th under thermal pressure, guidance after 1.5 s', () => {
    const p = new PolicyState(phone);
    const paths = Array.from({ length: 30 }, (_, i) => p.decide(sig(i, {})).path);
    expect(paths.filter((x) => x === 'RESCUE_FULL')).toHaveLength(3);
    const hot = new PolicyState(phone);
    const hotPaths = Array.from(
      { length: 40 },
      (_, i) => hot.decide(sig(i, { workerDuty: 0.8 })).path,
    );
    expect(hotPaths.filter((x) => x === 'RESCUE_FULL')).toHaveLength(2);
    expect(p.decide(sig(60, {})).guidance).toBe('aim_in_frame');
  });
  it('escalates to harder options after two misses on a stable candidate', () => {
    const p = new PolicyState(phone);
    expect(p.decide(sig(1, { candidate: cand(0.2) })).harder).toBe(false);
    p.noteMiss();
    p.noteMiss();
    expect(p.decide(sig(2, { candidate: cand(0.2) })).harder).toBe(true);
    p.noteHit();
    expect(p.decide(sig(3, { candidate: cand(0.2) })).harder).toBe(false);
  });
});
