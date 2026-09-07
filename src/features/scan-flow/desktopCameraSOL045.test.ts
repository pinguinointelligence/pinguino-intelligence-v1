/**
 * SOL-045 — the desktop camera, from the owner's own words:
 * "obraz pozostaje rozmyty; kamera zajmuje zbyt dużą część ekranu; nie wiadomo, gdzie umieścić kod;
 *  ruch obrazu jest lustrzany i odwrócony: lewo zachowuje się jak prawo, góra jak dół".
 *
 * Left/right and up/down turned out to be TWO different defects with two different causes, which is
 * why the previous attempt fixed neither:
 *
 *   - HORIZONTAL is the image. The capture asks for `facingMode: 'environment'` as an IDEAL (rightly
 *     — `exact` would fail on a laptop), a computer has no environment camera, so the browser
 *     delivers the USER-facing one and nothing mirrored it. An un-mirrored front camera is the view
 *     another person has of you: the product travels the wrong way.
 *   - VERTICAL is the sentence. Nothing in the pipeline inverts y. Every hint was phrased as an
 *     instruction to move the CAMERA — "Unieś telefon wyżej" — and on a computer the camera is
 *     bolted to the lid while the customer moves the PRODUCT, so the instruction reads backwards.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PolicyState, THRESHOLDS, type Candidate, type FrameSignals } from '@/scan-core/policy';
import type { CameraProfile } from '@/scan-core/profile';
import { scanFeedbackText } from './scanFlowLogic';

const FLOW = readFileSync('src/features/scan-flow/ScanFlow.tsx', 'utf8');
const CAPTURE = readFileSync('src/features/scan-flow/scanCoreCapture.ts', 'utf8');

describe('the preview moves the way the product moves', () => {
  it('mirrors the preview only when the delivered camera faces the customer', () => {
    expect(CAPTURE).toMatch(/facingUser\s*=\s*\n?\s*delivered\.facingMode === 'user'/);
    expect(CAPTURE).toMatch(/onMirror\?\.\(this\.facingUser\)/);
    expect(FLOW).toMatch(/onMirror: \(m\) => setMirrorPreview\(m\)/);
    expect(FLOW).toMatch(/mirrorPreview \? \{ transform: 'scaleX\(-1\)' \} : undefined/);
  });

  it('mirrors the OVERLAY LAYER too, so the tracked-code box does not point at the wrong edge', () => {
    // flipping the box itself would only flip its content; the LAYER is what moves its position
    const layer = FLOW.slice(FLOW.indexOf('{roiBox ? ('), FLOW.indexOf('{roiBox ? (') + 1400);
    expect(layer).toMatch(/className="pointer-events-none absolute inset-0"/);
    expect(layer).toMatch(/mirrorPreview \? \{ transform: 'scaleX\(-1\)' \} : undefined/);
  });

  it('never mirrors what the decoder reads — a mirrored barcode does not decode', () => {
    // the flip is a style on the <video> and on the overlay; it must not reach the frame path
    expect(CAPTURE).not.toMatch(/scaleX|transform/);
  });
});

describe('the customer is told what to move, not what to lift', () => {
  const base = { state: 'FOUND' as const, timedOut: false, guidance: 'none' as const };

  it('speaks about the phone when the camera is the thing that moves', () => {
    expect(scanFeedbackText({ ...base, position: 'up' })).toBe('Unieś telefon wyżej');
    expect(scanFeedbackText({ ...base, position: 'left' })).toBe('Przesuń telefon w lewo');
    expect(scanFeedbackText({ ...base, guidance: 'move_closer', position: null })).toBe(
      'Przybliż telefon do kodu',
    );
  });

  it('speaks about the PRODUCT when the camera cannot move', () => {
    const fixed = { ...base, fixedCamera: true };
    expect(scanFeedbackText({ ...fixed, position: 'up' })).toBe('Przesuń produkt wyżej');
    expect(scanFeedbackText({ ...fixed, position: 'down' })).toBe('Przesuń produkt niżej');
    expect(scanFeedbackText({ ...fixed, position: 'left' })).toBe('Przesuń produkt w lewo');
    expect(scanFeedbackText({ ...fixed, position: 'right' })).toBe('Przesuń produkt w prawo');
    expect(scanFeedbackText({ ...fixed, guidance: 'move_closer', position: null })).toBe(
      'Przysuń produkt bliżej kamery',
    );
  });

  it('keeps the DIRECTION identical in both voices — only the noun changes', () => {
    for (const position of ['left', 'right', 'up', 'down'] as const) {
      const phone = scanFeedbackText({ ...base, position });
      const fixed = scanFeedbackText({ ...base, position, fixedCamera: true });
      const side = { left: 'lewo', right: 'prawo', up: 'wyż', down: 'niż' }[position];
      expect(phone.toLowerCase(), position).toContain(side);
      expect(fixed.toLowerCase(), position).toContain(side);
    }
  });

  it('says something neutral when there is no code to point at', () => {
    expect(
      scanFeedbackText({
        state: 'SEARCHING',
        guidance: 'none',
        timedOut: false,
        position: null,
        fixedCamera: true,
      }),
    ).toBe('Umieść kod w ramce');
  });
});

describe('the preview is a window, not the whole screen', () => {
  it('is bounded and stops forcing a portrait box onto a landscape webcam', () => {
    expect(FLOW).toMatch(/max-w-\[420px\]/);
    expect(FLOW).toMatch(/aspect-\[3\/4\] w-full object-cover sm:aspect-video/);
  });
});

const PROFILE = (over: Partial<CameraProfile> = {}): CameraProfile => ({
  formFactor: 'desktop',
  sourceW: 1280,
  sourceH: 720,
  fps: 30,
  autofocus: null,
  zoomMax: null,
  torch: false,
  startSharpness: null,
  ...over,
});

const candidate = (): Candidate => ({
  cx: 640,
  cy: 360,
  widthPx: 300,
  heightPx: 90,
  angleDeg: 0,
  fill: 300 / 1280,
});

const signals = (over: Partial<FrameSignals> = {}): FrameSignals => ({
  frameIndex: 1,
  tMs: 0,
  candidate: candidate(),
  sharpness: 400,
  meanLuma: 130,
  clippedRatio: 0,
  workerDuty: 0,
  zoomApplied: false,
  ...over,
});

describe('a blurred desktop session cannot normalise its own blur away', () => {
  it('an absolute floor catches a session that was never in focus', () => {
    // every frame equally blurred: the RELATIVE test can never fire, because the median IS the blur
    const policy = new PolicyState(PROFILE());
    let out = policy.decide(signals({ tMs: 0, sharpness: 12 }));
    for (let i = 1; i < 20; i += 1) out = policy.decide(signals({ tMs: i * 60, sharpness: 12 }));
    expect(out.sharpRel).not.toBeNull();
    expect(out.sharpRel!).toBeGreaterThan(THRESHOLDS.blurRel); // relative test says "fine"
    expect(out.guidance).not.toBe('none'); // ...and the customer is still told
  });

  it('the sharpness history is fed by frames with NO candidate too', () => {
    // a blurred frame is exactly the frame that yields no candidate, so excluding those built the
    // statistic from the sharpest frames in the session
    const policy = new PolicyState(PROFILE());
    policy.decide(signals({ tMs: 0, candidate: null, sharpness: 8 }));
    policy.decide(signals({ tMs: 60, candidate: null, sharpness: 8 }));
    const out = policy.decide(signals({ tMs: 120, sharpness: 400 }));
    // the median now knows about the blurred frames, so a sharp frame reads as far above it
    expect(out.sharpRel).not.toBeNull();
    expect(out.sharpRel!).toBeGreaterThan(1);
  });

  it('a desktop that will not report focusMode is treated as fixed focus, and guided at once', () => {
    // `autofocus === false` never happens on desktop — browsers expose neither capability nor
    // setting — so the branch meant for fixed-focus cameras was unreachable where they live
    const policy = new PolicyState(PROFILE({ autofocus: null }));
    const out = policy.decide(signals({ sharpness: 10 }));
    expect(out.guidance).toBe('move_closer'); // fill is small, so: come closer — immediately
  });

  it('and a phone with real autofocus still gets its grace period', () => {
    const policy = new PolicyState(PROFILE({ formFactor: 'mobile', autofocus: true }));
    const out = policy.decide(signals({ tMs: 0, sharpness: 10 }));
    expect(out.guidance).toBe('none'); // let the lens hunt before saying anything
  });
});
