import { describe, expect, it } from 'vitest';
import { downscaleLuminance, lumaQuality, rgbaToLuminance } from '../vision/luminance';

const y = (r: number, g: number, b: number) => (r * 54 + g * 183 + b * 19 + 128) >> 8;

describe('rgbaToLuminance', () => {
  it('maps pure colours with the Rec.709 integer weights', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    const out = rgbaToLuminance(rgba, 5, 1);
    expect(Array.from(out)).toEqual([
      y(255, 0, 0),
      y(0, 255, 0),
      y(0, 0, 255),
      y(255, 255, 255),
      0,
    ]);
    expect(out[3]).toBe(255);
  });
  it('reuses the output buffer when the size matches', () => {
    const rgba = new Uint8ClampedArray(4 * 4);
    const buf = new Uint8Array(4);
    expect(rgbaToLuminance(rgba, 2, 2, buf)).toBe(buf);
    expect(rgbaToLuminance(rgba, 2, 2, new Uint8Array(3))).not.toBe(buf);
  });
});

describe('downscaleLuminance', () => {
  it('box-filters a 2x2 checkerboard to its mean', () => {
    const src = new Uint8Array([0, 255, 255, 0]);
    const level = downscaleLuminance(src, 2, 2, 2);
    expect(level.width).toBe(1);
    expect(level.height).toBe(1);
    expect(level.data[0]).toBe(128);
  });
  it('floors partial blocks away', () => {
    const level = downscaleLuminance(new Uint8Array(5 * 3), 5, 3, 2);
    expect([level.width, level.height]).toEqual([2, 1]);
  });
});

describe('lumaQuality', () => {
  const W = 64;
  const H = 32;
  it('scores a sharp step edge higher than a smooth ramp', () => {
    const step = new Uint8Array(W * H);
    const ramp = new Uint8Array(W * H);
    for (let yy = 0; yy < H; yy += 1) {
      for (let x = 0; x < W; x += 1) {
        step[yy * W + x] = x < W / 2 ? 20 : 220;
        ramp[yy * W + x] = Math.round((x / (W - 1)) * 200) + 20;
      }
    }
    expect(lumaQuality(step, W, H, 2).laplacianVar).toBeGreaterThan(
      lumaQuality(ramp, W, H, 2).laplacianVar,
    );
  });
  it('counts clipped highlights', () => {
    const bright = new Uint8Array(W * H).fill(255);
    const q = lumaQuality(bright, W, H, 4);
    expect(q.clippedHighRatio).toBe(1);
    expect(q.meanLuma).toBe(255);
    expect(lumaQuality(new Uint8Array(W * H).fill(100), W, H, 4).clippedHighRatio).toBe(0);
  });
});
