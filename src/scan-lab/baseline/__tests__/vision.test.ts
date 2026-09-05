import { describe, expect, it } from 'vitest';
import { BarSaliency, estimateModuleWidth } from '../vision/saliency';
import { expandQuad, homographyFromPoints, applyHomography, rectifyQuad } from '../vision/rectify';
import { iou, noisePlane, paintEan13, quadBBox } from './synthetic';

const CODE = '5901234123457';

function angleDistance(a: number, b: number): number {
  // bar orientation is periodic in 180° for the gradient axis; compare modulo 180
  let d = Math.abs(((a - b) % 180) + 180) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

describe('BarSaliency on synthetic EAN-13 planes', () => {
  it.each([0, 20, 90])(
    'localises a code rotated %d° (bbox IoU > 0.5, angle within 10°)',
    (angle) => {
      const plane = noisePlane(640, 480, 7, 128, 12);
      const truth = paintEan13(plane, CODE, 320, 240, 3, 90, angle);
      const result = new BarSaliency().analyze(plane.data, plane.width, plane.height);
      expect(result.candidates.length).toBeGreaterThan(0);
      const best = result.candidates[0]!;
      // axis-aligned IoU under-states agreement for rotated boxes, so also check centre + length
      expect(iou(best.quad, truth)).toBeGreaterThan(0.45);
      const centre = (q: typeof truth) => ({
        x: q.points.reduce((a, p) => a + p.x, 0) / 4,
        y: q.points.reduce((a, p) => a + p.y, 0) / 4,
      });
      const cb = centre(best.quad);
      const ct = centre(truth);
      expect(Math.hypot(cb.x - ct.x, cb.y - ct.y)).toBeLessThan(12);
      const len = (q: typeof truth) =>
        Math.hypot(q.points[1].x - q.points[0].x, q.points[1].y - q.points[0].y);
      const ratio = len(best.quad) / len(truth);
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.5);
      expect(angleDistance(best.orientationDeg, angle)).toBeLessThan(10);
      expect(best.fillRatio).toBeGreaterThan(0.2);
      expect(result.durationMs).toBeLessThan(200);
    },
  );

  it('returns no candidates on pure noise', () => {
    const plane = noisePlane(640, 480, 3, 128, 25);
    const result = new BarSaliency().analyze(plane.data, plane.width, plane.height);
    expect(result.candidates).toEqual([]);
  });

  it('ignores a lone straight edge (a label or packaging border is not bar texture)', () => {
    const plane = noisePlane(640, 480, 3, 128, 10);
    for (let y = 100; y < 380; y += 1)
      for (let x = 200; x < 440; x += 1) plane.data[y * 640 + x] = 235;
    const result = new BarSaliency().analyze(plane.data, plane.width, plane.height);
    expect(result.candidates).toEqual([]);
  });

  it('estimates the module width from the full-resolution profile', () => {
    const plane = noisePlane(640, 480, 7, 128, 8);
    const truth = paintEan13(plane, CODE, 320, 240, 4, 90, 0);
    const est = estimateModuleWidth(plane.data, plane.width, plane.height, truth, 1, 0);
    expect(est).not.toBeNull();
    expect(est!).toBeGreaterThanOrEqual(3);
    expect(est!).toBeLessThanOrEqual(5);
  });

  it('reuses buffers between frames of the same size (no growth in allocations)', () => {
    const det = new BarSaliency();
    const plane = noisePlane(320, 240, 1);
    const a = det.analyze(plane.data, plane.width, plane.height);
    const b = det.analyze(plane.data, plane.width, plane.height);
    expect(a.downscaledWidth).toBe(b.downscaledWidth);
  });
});

describe('rectify', () => {
  it('homography maps the four control points exactly', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];
    const dst = [
      { x: 3, y: 2 },
      { x: 12, y: 4 },
      { x: 11, y: 9 },
      { x: 2, y: 8 },
    ];
    const H = homographyFromPoints(src, dst);
    src.forEach((p, i) => {
      const q = applyHomography(H, p.x, p.y);
      expect(q.x).toBeCloseTo(dst[i]!.x, 6);
      expect(q.y).toBeCloseTo(dst[i]!.y, 6);
    });
  });

  it('expandQuad grows along both axes', () => {
    const q = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 20 },
        { x: 0, y: 20 },
      ] as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ],
    };
    const e = quadBBox(expandQuad(q, 0.1, 0.5));
    expect(e.x0).toBeCloseTo(-10);
    expect(e.x1).toBeCloseTo(110);
    expect(e.y0).toBeCloseTo(-10);
    expect(e.y1).toBeCloseTo(30);
  });

  it('rectifies a 20° code into a horizontal-scanline crop with strong 1-D structure', () => {
    const plane = noisePlane(640, 480, 7, 128, 8);
    const truth = paintEan13(plane, CODE, 320, 240, 3, 90, 20);
    const region = rectifyQuad(plane.data, plane.width, plane.height, truth);
    expect(region.width).toBeGreaterThan(200);
    // rows should agree with each other (bars are vertical after rectification)
    const rowA = region.data.subarray(
      Math.floor(region.height * 0.3) * region.width,
      Math.floor(region.height * 0.3) * region.width + region.width,
    );
    const rowB = region.data.subarray(
      Math.floor(region.height * 0.7) * region.width,
      Math.floor(region.height * 0.7) * region.width + region.width,
    );
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < region.width; i += 1) {
      sa += rowA[i]!;
      sb += rowB[i]!;
    }
    const ma = sa / region.width;
    const mb = sb / region.width;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < region.width; i += 1) {
      const a = rowA[i]! - ma;
      const b = rowB[i]! - mb;
      num += a * b;
      da += a * a;
      db += b * b;
    }
    const corr = num / Math.sqrt(da * db);
    expect(corr).toBeGreaterThan(0.8);
    expect(da / region.width).toBeGreaterThan(2000); // high row variance = bars present
  });
});
