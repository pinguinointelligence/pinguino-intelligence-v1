import { describe, expect, it } from 'vitest';
import { candidateQuality } from '../quality';

const W = 640;
const H = 480;
function plane(fill: (x: number, y: number) => number): Uint8Array {
  const l = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) l[y * W + x] = fill(x, y);
  return l;
}

describe('candidateQuality', () => {
  it('reports cut edges when the candidate touches the frame border', () => {
    const l = plane(() => 128);
    const q = candidateQuality(l, W, H, {
      cx: 100,
      cy: 240,
      widthPx: 220,
      heightPx: 60,
      angleDeg: 0,
    });
    expect(q.cutEdges).toEqual(['left']);
    const q2 = candidateQuality(l, W, H, {
      cx: 320,
      cy: 20,
      widthPx: 200,
      heightPx: 60,
      angleDeg: 0,
    });
    expect(q2.cutEdges).toEqual(['top']);
    expect(
      candidateQuality(l, W, H, { cx: 320, cy: 240, widthPx: 200, heightPx: 60, angleDeg: 0 })
        .cutEdges,
    ).toEqual([]);
  });
  it('measures glare on the target and contrast inside the box, not in the scene', () => {
    const l = plane((x, y) => (y > 400 ? 255 : x % 6 < 3 ? 30 : 220));
    const q = candidateQuality(l, W, H, {
      cx: 320,
      cy: 200,
      widthPx: 300,
      heightPx: 80,
      angleDeg: 0,
    });
    expect(q.glareOnTarget).toBe(0);
    expect(q.contrast).toBeGreaterThan(150);
    const glare = candidateQuality(l, W, H, {
      cx: 320,
      cy: 440,
      widthPx: 300,
      heightPx: 60,
      angleDeg: 0,
    });
    expect(glare.glareOnTarget).toBeGreaterThan(0.9);
  });
  it('folds tilt into 0..45', () => {
    const l = plane(() => 128);
    expect(
      candidateQuality(l, W, H, { cx: 320, cy: 240, widthPx: 200, heightPx: 60, angleDeg: 100 })
        .tiltDeg,
    ).toBeCloseTo(10, 5);
    expect(
      candidateQuality(l, W, H, { cx: 320, cy: 240, widthPx: 200, heightPx: 60, angleDeg: -60 })
        .tiltDeg,
    ).toBeCloseTo(30, 5);
  });
});
