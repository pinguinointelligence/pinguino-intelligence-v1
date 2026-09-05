/**
 * ORIENTATION / PACKAGE-SHAPE EVIDENCE for the shared scanner (owner QA, 2026-09-05): the SAME pipeline
 * the worker runs on a phone — bar saliency → Scan Core engine (tracks, policy, confirmation) → zxing on
 * the crops the engine asks for — fed with synthetic frames of a real EAN-13 painted at 0°, 90°, 180°,
 * 270°, warped as on a cylinder (bottle / tin), and placed near the frame edge. A code counts as read
 * only when Scan Core CONFIRMS it (checksum-valid, two agreeing frames), never on a single decode.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ScanObservation } from '../../../scan-core';
import { lumaQuality } from '../vision/luminance';
import { BarSaliency } from '../vision/saliency';
import { ScanCoreLane } from '../worker/scanCoreLane';
import { createZxingDecoder } from '../worker/zxingAdapter';
import { noisePlane, paintEan13, type Plane } from './synthetic';

const wasmBinary = readFileSync(
  createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'),
);
const decoder = createZxingDecoder({ wasmBinary });

/** the owner's Vitamin Well code — a real, checksum-valid EAN-13 */
export const OWNER_EAN = '7340222800464';
const W = 1080;
const H = 1440;

/** cylinder projection along the reading axis: modules compress towards the edges, as on a bottle */
export function warpCylinder(
  plane: Plane,
  cx: number,
  cy: number,
  halfSpan: number,
  radius: number,
): Plane {
  const out = new Uint8Array(plane.data);
  const x0 = Math.max(0, Math.floor(cx - halfSpan));
  const x1 = Math.min(plane.width - 1, Math.ceil(cx + halfSpan));
  const y0 = Math.max(0, Math.floor(cy - halfSpan));
  const y1 = Math.min(plane.height - 1, Math.ceil(cy + halfSpan));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      // x is the projected (seen) coordinate; the flat label coordinate is radius * asin((x - cx) / radius)
      const s = (x - cx) / radius;
      if (s <= -1 || s >= 1) {
        out[y * plane.width + x] = 128;
        continue;
      }
      const flat = cx + radius * Math.asin(s);
      const fx = Math.max(0, Math.min(plane.width - 1, Math.round(flat)));
      out[y * plane.width + x] = plane.data[y * plane.width + fx]!;
    }
  }
  return { data: out, width: plane.width, height: plane.height };
}

interface Scene {
  name: string;
  angleDeg: number;
  cx: number;
  cy: number;
  modulePx: number;
  curved?: { radius: number };
}

const SCENES: Scene[] = [
  { name: 'horizontal 0°', angleDeg: 0, cx: W / 2, cy: H / 2, modulePx: 4 },
  { name: 'upside down 180°', angleDeg: 180, cx: W / 2, cy: H / 2, modulePx: 4 },
  { name: 'vertical 90°', angleDeg: 90, cx: W / 2, cy: H / 2, modulePx: 4 },
  { name: 'vertical 270°', angleDeg: 270, cx: W / 2, cy: H / 2, modulePx: 4 },
  {
    name: 'curved bottle (r≈1.6×code)',
    angleDeg: 0,
    cx: W / 2,
    cy: H / 2,
    modulePx: 4,
    curved: { radius: 420 },
  },
  {
    name: 'tighter tin (r≈1.2×code)',
    angleDeg: 0,
    cx: W / 2,
    cy: H / 2,
    modulePx: 4,
    curved: { radius: 320 },
  },
  { name: 'near the frame edge', angleDeg: 0, cx: 260, cy: 300, modulePx: 4 },
  { name: 'small / far (2.2 px modules)', angleDeg: 0, cx: W / 2, cy: H / 2, modulePx: 2.2 },
];

function frameFor(scene: Scene, seed: number): Plane {
  const plane = noisePlane(W, H, seed, 150, 18);
  paintEan13(plane, OWNER_EAN, scene.cx, scene.cy, scene.modulePx, 140, scene.angleDeg);
  if (scene.curved) {
    const codeHalf = (95 * scene.modulePx) / 2 + 40;
    return warpCylinder(plane, scene.cx, scene.cy, codeHalf + 20, scene.curved.radius);
  }
  return plane;
}

export async function runScene(scene: Scene, frames = 14) {
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
  let states: string[] = [];
  let decodes = 0;
  let firstReadFrame: number | null = null;
  for (let i = 0; i < frames && !confirmed; i += 1) {
    const plane = frameFor(scene, 1 + i);
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
    states.push(core.decision.scanState);
    if (
      firstReadFrame === null &&
      core.decodes.some((d) => d.results.some((r) => r.checksumValid && r.text === OWNER_EAN))
    )
      firstReadFrame = i;
    if (core.observation?.state === 'COMPLETE' && core.observation.barcode.verified)
      confirmed = core.observation;
  }
  states = states.filter((v, i, a) => i === 0 || v !== a[i - 1]);
  return { confirmed, states, decodes, firstReadFrame };
}

describe('Scan Core lane — orientation and package-shape evidence', () => {
  for (const scene of SCENES) {
    it(`confirms the owner EAN-13 painted as: ${scene.name}`, async () => {
      const r = await runScene(scene);
      expect(
        r.confirmed?.barcode.value,
        `${scene.name}: states ${r.states.join('→')}, decodes ${r.decodes}, first read frame ${r.firstReadFrame}`,
      ).toBe(OWNER_EAN);
    }, 60_000);
  }

  it('never confirms a checksum-invalid code', async () => {
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
    const bad = '7340222800465';
    let confirmed = false;
    for (let i = 0; i < 10; i += 1) {
      const plane = noisePlane(W, H, 20 + i, 150, 18);
      paintEan13(plane, bad, W / 2, H / 2, 4, 140, 0);
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
      if (core.observation?.state === 'COMPLETE' && core.observation.barcode.verified)
        confirmed = true;
    }
    expect(confirmed).toBe(false);
  }, 60_000);
});
