/** Rec. 709 luminance of an RGBA buffer into a reusable Uint8Array (allocates only when the size changes). */
export function rgbaToLuminance(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  out?: Uint8Array,
): Uint8Array {
  const size = width * height;
  const target = out && out.length === size ? out : new Uint8Array(size);
  for (let i = 0, o = 0; i < size; i += 1, o += 4) {
    target[i] = (rgba[o]! * 54 + rgba[o + 1]! * 183 + rgba[o + 2]! * 19 + 128) >> 8;
  }
  return target;
}

/** Box-filter downscale of a luminance plane by an integer factor into a reusable buffer. */
export function downscaleLuminance(
  src: Uint8Array,
  width: number,
  height: number,
  factor: number,
  out?: Uint8Array,
): { data: Uint8Array; width: number; height: number } {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const size = w * h;
  const target = out && out.length === size ? out : new Uint8Array(size);
  const inv = 1 / (factor * factor);
  for (let y = 0; y < h; y += 1) {
    const sy0 = y * factor;
    for (let x = 0; x < w; x += 1) {
      const sx0 = x * factor;
      let acc = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const row = (sy0 + dy) * width + sx0;
        for (let dx = 0; dx < factor; dx += 1) acc += src[row + dx]!;
      }
      target[y * w + x] = (acc * inv + 0.5) | 0;
    }
  }
  return { data: target, width: w, height: h };
}

/** Cheap frame-quality proxies on a luminance plane (subsampled): Laplacian variance, mean, clipped-highlight ratio. */
export function lumaQuality(
  luma: Uint8Array,
  width: number,
  height: number,
  step = 4,
): { laplacianVar: number; meanLuma: number; clippedHighRatio: number } {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let meanAcc = 0;
  let meanN = 0;
  let clipped = 0;
  for (let y = step; y < height - step; y += step) {
    const row = y * width;
    for (let x = step; x < width - step; x += step) {
      const c = luma[row + x]!;
      const lap =
        4 * c -
        luma[row + x - step]! -
        luma[row + x + step]! -
        luma[row - step * width + x]! -
        luma[row + step * width + x]!;
      sum += lap;
      sumSq += lap * lap;
      n += 1;
      meanAcc += c;
      meanN += 1;
      if (c >= 250) clipped += 1;
    }
  }
  if (n === 0) return { laplacianVar: 0, meanLuma: 0, clippedHighRatio: 0 };
  const mean = sum / n;
  return {
    laplacianVar: sumSq / n - mean * mean,
    meanLuma: meanAcc / meanN,
    clippedHighRatio: clipped / meanN,
  };
}
