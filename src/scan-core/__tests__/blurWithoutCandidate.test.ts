/**
 * SOL-045 — A LENS THAT CANNOT RESOLVE THE BARS MUST SAY SO.
 *
 * Owner, 2026-09-06: "on the computer the camera sees the barcode but the image is so blurry the
 * decoder has no real chance". A fixed-focus laptop webcam holding a code closer than its
 * hyperfocal distance never produces a candidate, so the no-candidate branch was the only one that
 * ran — and it fed no sharpness history, could not detect blur, and told the customer to aim the
 * code in the frame for as long as they tried.
 */
import { describe, expect, it } from 'vitest';
import { PolicyState } from '../policy';
import type { CameraProfile } from '../profile';

const profile = (autofocus: boolean): CameraProfile => ({
  formFactor: 'desktop',
  sourceW: 1920,
  sourceH: 1080,
  fps: 30,
  autofocus,
  zoomMax: null,
  torch: false,
  startSharpness: null,
});

/** frames with no candidate at all — the code is visible to the eye, never to the locator */
function runNoCandidate(policy: PolicyState, sharpnessSeries: readonly number[], startFrame = 0) {
  const out = [];
  for (let n = 0; n < sharpnessSeries.length; n += 1) {
    const i = startFrame + n;
    out.push(
      policy.decide({
        frameIndex: i,
        tMs: i * 66,
        candidate: null,
        sharpness: sharpnessSeries[n]!,
        meanLuma: 130,
        clippedRatio: 0.01,
        workerDuty: 0.2,
        zoomApplied: false,
      }),
    );
  }
  return out;
}

describe('SOL-045 — blur is reported even when no candidate ever forms', () => {
  it('a fixed-focus camera stuck out of focus guides the customer to move the product back', () => {
    const policy = new PolicyState(profile(false));
    // a dozen sharp frames establish the session median, then the product comes too close
    const decisions = runNoCandidate(policy, [
      ...Array.from({ length: 12 }, () => 100),
      ...Array.from({ length: 8 }, () => 20),
    ]);
    const last = decisions[decisions.length - 1]!;
    expect(last.guidance).toBe('move_away');
    expect(decisions.some((d) => d.reason.includes('unsharp'))).toBe(true);
    expect(last.sharpRel).not.toBeNull();
    expect(last.sharpRel!).toBeLessThan(0.5);
  });

  it('an autofocus camera is given a moment to focus before it says anything', () => {
    const policy = new PolicyState(profile(true));
    const early = runNoCandidate(policy, [...Array.from({ length: 12 }, () => 100), 20]);
    expect(early[early.length - 1]!.guidance).not.toBe('move_away');
    // once the blur persists, the customer is asked to hold steady while the lens focuses
    const later = runNoCandidate(policy, [20, 20, 20, 20, 20, 20, 20, 20], early.length);
    expect(later[later.length - 1]!.guidance).toBe('hold_steady');
  });

  it('a camera that is ALWAYS out of focus is not excused by its own blurry median', () => {
    // every frame equally blurry: a relative sharpness test can never fire, and that is exactly the
    // owner's desktop webcam. After the searching grace period the customer is still told what to do.
    const policy = new PolicyState(profile(false));
    const decisions = runNoCandidate(
      policy,
      Array.from({ length: 60 }, () => 20),
    );
    expect(decisions[decisions.length - 1]!.guidance).toBe('move_away');
  });

  it('too little light is named as light, not as distance', () => {
    const policy = new PolicyState(profile(false));
    const out = [];
    for (let i = 0; i < 60; i += 1)
      out.push(
        policy.decide({
          frameIndex: i,
          tMs: i * 66,
          candidate: null,
          sharpness: 20,
          meanLuma: 20,
          clippedRatio: 0.01,
          workerDuty: 0.2,
          zoomApplied: false,
        }),
      );
    expect(out[out.length - 1]!.guidance).toBe('improve_light');
  });

  it('a sharp frame on an autofocus camera still asks the customer to aim, not to move', () => {
    const policy = new PolicyState(profile(true));
    const decisions = runNoCandidate(
      policy,
      Array.from({ length: 40 }, () => 100),
    );
    const last = decisions[decisions.length - 1]!;
    expect(last.guidance).toBe('aim_in_frame');
    expect(last.reason).not.toContain('unsharp');
  });
});
