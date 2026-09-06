/**
 * THE OWNER'S DEFECT, end to end (QA 2026-09-06): "a barcode that is vertical or sideways is not read —
 * I have to turn the tin until the digits point downward."
 *
 * The existing orientation evidence (../../__tests__/laneOrientation.test.ts) covers exactly 0°, 90°, 180°
 * and 270° — the four angles where the old single-boolean axis decision happens to be right. Nobody holds
 * a tin at exactly 90°. These scenes are the angles in between, where the 45°/135° cut is a coin flip and
 * the crop was shaped for a horizontal code, run through the SAME pipeline the phone runs: bar saliency →
 * Scan Core engine → zxing on the crops the engine asks for. A code counts as read only when Scan Core
 * CONFIRMS it: the confirmation contract is untouched.
 *
 * The code is painted with REAL EAN-13 proportions (31.35 mm × 22.85 mm). The 0-vs-90 fixtures use 140 px
 * bars under a 380 px code — an aspect of 2.7 against a real 1.37 — which no diagonal scan can cross.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ScanObservation } from '../../../../scan-core';
import { lumaQuality } from '../../vision/luminance';
import { BarSaliency } from '../../vision/saliency';
import { noisePlane, paintEan13 } from '../../__tests__/synthetic';
import { ScanCoreLane } from '../scanCoreLane';
import { createZxingDecoder } from '../zxingAdapter';

const wasmBinary = readFileSync(
  createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'),
);
const decoder = createZxingDecoder({ wasmBinary });

const OWNER_EAN = '7340222800464';
const W = 1080;
const H = 1440;
/** 95 modules of 4 px at the real 1.37 aspect ratio */
const BAR_H = 277;

async function runAngle(angleDeg: number, frames = 14) {
  await decoder.warmup();
  const saliency = new BarSaliency();
  const lane = new ScanCoreLane();
  lane.setProfile(
    {
      formFactor: 'mobile',
      sourceW: W,
      sourceH: H,
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
  let confirmed: ScanObservation | null = null;
  let decodes = 0;
  let validReads = 0;
  for (let i = 0; i < frames && !confirmed; i += 1) {
    const plane = noisePlane(W, H, 1 + i, 150, 18);
    paintEan13(plane, OWNER_EAN, W / 2, H / 2, 4, BAR_H, angleDeg);
    const s = saliency.analyze(plane.data, plane.width, plane.height);
    const core = await lane.process(
      decoder,
      plane.data,
      plane.width,
      plane.height,
      i,
      i * 66,
      s,
      saliency.lastLevel(),
      lumaQuality(plane.data, plane.width, plane.height, 4),
    );
    decodes += core.decodes.length;
    for (const d of core.decodes)
      for (const r of d.results) if (r.checksumValid && r.text === OWNER_EAN) validReads += 1;
    if (core.observation?.state === 'COMPLETE' && core.observation.barcode.verified)
      confirmed = core.observation;
  }
  return { confirmed, decodes, validReads };
}

describe('Scan Core lane — the code is not held at a right angle', () => {
  // 60° and 120° sit on the vertical side of the 45°/135° cut, 30° and 150° on the horizontal side. None
  // of them can be read by betting on one axis with a crop shaped for a horizontal code.
  for (const angle of [30, 60, 120, 150]) {
    it(`confirms the owner EAN-13 held at ${angle}°`, async () => {
      const r = await runAngle(angle);
      expect(r.confirmed?.barcode.value, `${angle}°: ${r.decodes} decodes`).toBe(OWNER_EAN);
    }, 60_000);
  }

  /**
   * KNOWN AND DELIBERATE LIMIT, pinned so nobody "fixes" it by weakening the confirmation contract.
   * At exactly 45° a straight scan line drifts w·sin45 ≈ 269 px while crossing a 277 px bar, so neither
   * axis — nor zxing's own tryRotate/tryHarder ladder — reads the raw crop; only the rectified crop does.
   * §17 of the confirmation contract refuses to confirm from rectified reads ALONE, because a homography
   * alias repeats identically frame after frame (corpus: the D3 can produced six consecutive aliases).
   * So the engine reads the code and correctly declines to promise it. Progressive guidance, not a
   * confirmation, is the honest answer here.
   */
  it('reads but deliberately does not confirm a code at exactly 45° (rectified-only, §17)', async () => {
    const r = await runAngle(45);
    expect(r.validReads).toBeGreaterThan(0);
    expect(r.confirmed).toBeNull();
  }, 60_000);
});
