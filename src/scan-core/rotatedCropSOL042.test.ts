/**
 * SOL-042 — the decode crop must contain the WHOLE code at every orientation.
 *
 * Owner QA, twice: a barcode held normally often does not read, and turning the can until the
 * digits sit at the bottom reads almost instantly. The asymmetry has a period of 90 degrees, not
 * 180 — 0 and 180 are indistinguishable to a linear decoder and both worked; 90 and 270 are
 * indistinguishable and both failed.
 *
 * The cause was arithmetic, not the decoder. `cropOn` used the candidate's `widthPx` (its length
 * along its OWN reading axis) as the crop's X extent and `heightPx` as its Y extent, ignoring
 * `angleDeg`. For a vertical code that produced a transposed box: a short wide slice ACROSS the
 * middle of a tall code, holding bars but neither guard pattern. No decoder can read that, at any
 * options, at any rotation — which is why adding a rotation loop downstream would not have helped.
 *
 * These are geometry contracts, not decoder tests: they assert the crop the decoder is HANDED.
 */
import { describe, expect, it } from 'vitest';
import { PolicyState, type Candidate, type FrameSignals } from './policy';
import type { CameraProfile } from './profile';

/** a real EAN-13 on a flat pack, as the localizer reports it: long in its reading axis, short across */
const CODE_LEN = 380;
const CODE_BAR = 120;

const candidateAt = (angleDeg: number, over: Partial<Candidate> = {}): Candidate => ({
  cx: 960,
  cy: 540,
  widthPx: CODE_LEN,
  heightPx: CODE_BAR,
  angleDeg,
  fill: CODE_LEN / 1920,
  ...over,
});

const PROFILE: CameraProfile = {
  formFactor: 'mobile',
  sourceW: 1920,
  sourceH: 1080,
  fps: 30,
  autofocus: true,
  zoomMax: null,
  torch: false,
  startSharpness: 400,
};

const frame = (candidate: Candidate): FrameSignals => ({
  frameIndex: 10,
  tMs: 1000,
  candidate,
  sharpness: 400,
  meanLuma: 130,
  clippedRatio: 0,
  workerDuty: 0,
  zoomApplied: false,
});

/** the crop the policy hands the decoder, in SOURCE pixels */
function cropFor(angleDeg: number, over: Partial<Candidate> = {}) {
  const c = candidateAt(angleDeg, over);
  const policy = new PolicyState(PROFILE);
  const roi = policy.decide(frame(c)).roi;
  if (!roi) throw new Error(`no ROI at ${angleDeg} degrees`);
  const factor = roi.plane === 'medium' ? 2 : 1;
  return { w: roi.w * factor, h: roi.h * factor, plane: roi.plane };
}

describe('the decode crop contains the whole code at every orientation (SOL-042)', () => {
  for (const angle of [0, 90, 180, 270]) {
    it(`covers the code's full length at ${angle} degrees`, () => {
      const crop = cropFor(angle);
      // the code's reading axis lies along X at 0/180 and along Y at 90/270
      const alongX = angle % 180 === 0;
      const needAlong = CODE_LEN;
      const got = alongX ? crop.w : crop.h;
      // the crop must hold the whole code, not a slice of it
      expect(got).toBeGreaterThanOrEqual(needAlong);
    });
  }

  it('0 and 180 degrees are the same crop, and so are 90 and 270', () => {
    // a linear code is symmetric under a half turn, so two attempts cover all four orientations
    expect(cropFor(0)).toEqual(cropFor(180));
    expect(cropFor(90)).toEqual(cropFor(270));
  });

  it('the vertical crop is the transpose of the horizontal one, not a slice of it', () => {
    const flat = cropFor(0);
    const upright = cropFor(90);
    // THE REGRESSION: before the fix both came out with the SAME wide-and-short shape, because
    // widthPx was pasted onto X whatever the angle. If these are ever equal again, SOL-042 is back.
    expect(upright).not.toEqual(flat);
    expect(upright.w).toBeCloseTo(flat.h, 0);
    expect(upright.h).toBeCloseTo(flat.w, 0);
  });

  it('a horizontal code crops exactly as it always did — the fix is a no-op at 0 degrees', () => {
    const crop = cropFor(0);
    expect(crop.w).toBeGreaterThanOrEqual(CODE_LEN);
    expect(crop.h).toBeGreaterThanOrEqual(CODE_BAR);
    // and not absurdly larger: the projection adds nothing when sin(0)=0
    expect(crop.h).toBeLessThan(CODE_LEN);
  });

  it('a code on a curved can (shorter apparent length, tilted) still crops whole', () => {
    // a can foreshortens the code and tilts it; the projection must still cover both extents
    const crop = cropFor(75, { widthPx: 260, heightPx: 96, fill: 260 / 1920 });
    const rad = (75 * Math.PI) / 180;
    const needX = Math.abs(Math.cos(rad)) * 260 + Math.abs(Math.sin(rad)) * 96;
    const needY = Math.abs(Math.sin(rad)) * 260 + Math.abs(Math.cos(rad)) * 96;
    expect(crop.w).toBeGreaterThanOrEqual(Math.floor(needX));
    expect(crop.h).toBeGreaterThanOrEqual(Math.floor(needY));
  });
});
