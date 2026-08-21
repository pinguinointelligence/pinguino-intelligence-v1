export interface FrameQuality {
  exposure: number;
  sharpness: number;
  glare: number;
  labelFill: number;
  score: number;
  acceptableForAutoCapture: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreRgbaFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): FrameQuality {
  if (width < 2 || height < 2 || pixels.length < width * height * 4) {
    return {
      exposure: 0,
      sharpness: 0,
      glare: 1,
      labelFill: 0,
      score: 0,
      acceptableForAutoCapture: false,
    };
  }
  const luminance = new Float32Array(width * height);
  let bright = 0;
  let wellExposed = 0;
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4;
    const value =
      ((pixels[offset] ?? 0) * 0.2126 +
        (pixels[offset + 1] ?? 0) * 0.7152 +
        (pixels[offset + 2] ?? 0) * 0.0722) /
      255;
    luminance[pixel] = value;
    if (value > 0.96) bright += 1;
    if (value >= 0.16 && value <= 0.92) wellExposed += 1;
  }
  let edges = 0;
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = luminance[y * width + x] ?? 0;
      const laplacian = Math.abs(
        4 * center -
          (luminance[y * width + x - 1] ?? 0) -
          (luminance[y * width + x + 1] ?? 0) -
          (luminance[(y - 1) * width + x] ?? 0) -
          (luminance[(y + 1) * width + x] ?? 0),
      );
      edges += laplacian;
      edgeCount += 1;
    }
  }
  const exposure = wellExposed / luminance.length;
  const glare = bright / luminance.length;
  const sharpness = clamp01((edges / Math.max(1, edgeCount)) * 5);
  // The capture guide occupies roughly the central 72% of the preview.
  const labelFill = 0.72;
  const score = Math.round(
    clamp01(exposure * 0.35 + sharpness * 0.45 + (1 - glare) * 0.15 + labelFill * 0.05) * 100,
  );
  return {
    exposure,
    sharpness,
    glare,
    labelFill,
    score,
    acceptableForAutoCapture: score >= 62 && sharpness >= 0.35 && glare <= 0.18,
  };
}

export function selectBestFrame<T extends { quality: FrameQuality }>(
  frames: readonly T[],
): T | null {
  return frames.reduce<T | null>(
    (best, frame) => (!best || frame.quality.score > best.quality.score ? frame : best),
    null,
  );
}
