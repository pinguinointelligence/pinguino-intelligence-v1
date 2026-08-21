import { describe, expect, it } from 'vitest';
import { scoreRgbaFrame, selectBestFrame } from './frameQuality';

function checkerboard(width: number, height: number, low = 45, high = 215) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x + y) % 2 ? low : high;
      const offset = (y * width + x) * 4;
      pixels.set([value, value, value, 255], offset);
    }
  }
  return pixels;
}

describe('local camera frame quality', () => {
  it('accepts a sharp, exposed frame and rejects dark/flat evidence', () => {
    const sharp = scoreRgbaFrame(checkerboard(40, 40), 40, 40);
    const dark = scoreRgbaFrame(checkerboard(40, 40, 2, 4), 40, 40);
    expect(sharp.acceptableForAutoCapture).toBe(true);
    expect(dark.acceptableForAutoCapture).toBe(false);
    expect(sharp.score).toBeGreaterThan(dark.score);
  });

  it('chooses the best scored frame deterministically', () => {
    const first = { id: 'a', quality: scoreRgbaFrame(checkerboard(20, 20, 20, 30), 20, 20) };
    const second = { id: 'b', quality: scoreRgbaFrame(checkerboard(20, 20), 20, 20) };
    expect(selectBestFrame([first, second])?.id).toBe('b');
    expect(selectBestFrame([])).toBeNull();
  });

  it('rejects blurred and glare-dominated frames', () => {
    const blurred = scoreRgbaFrame(checkerboard(40, 40, 120, 121), 40, 40);
    const glare = scoreRgbaFrame(checkerboard(40, 40, 250, 255), 40, 40);
    expect(blurred.sharpness).toBeLessThan(0.35);
    expect(blurred.acceptableForAutoCapture).toBe(false);
    expect(glare.glare).toBeGreaterThan(0.18);
    expect(glare.acceptableForAutoCapture).toBe(false);
  });
});
