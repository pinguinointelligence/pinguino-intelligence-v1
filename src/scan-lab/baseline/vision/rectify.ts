import type { Point, Quad } from '../types';

/** Solves H mapping four source points to four destination points (row-major 3x3). */
export function homographyFromPoints(
  src: ReadonlyArray<Point>,
  dst: ReadonlyArray<Point>,
): Float64Array {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return new Float64Array([h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1]);
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r]![c]!) > Math.abs(M[pivot]![c]!)) pivot = r;
    const tmp = M[c]!;
    M[c] = M[pivot]!;
    M[pivot] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('singular homography');
    for (let k = c; k <= n; k += 1) M[c]![k] = M[c]![k]! / d;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k += 1) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  return M.map((row) => row[n]!);
}

export function applyHomography(H: Float64Array, x: number, y: number): Point {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return { x: (H[0]! * x + H[1]! * y + H[2]!) / w, y: (H[3]! * x + H[4]! * y + H[5]!) / w };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Expands a quad along its own axes: `along` fraction per side along edge p0→p1, `across` fraction per side along p0→p3. */
export function expandQuad(quad: Quad, along: number, across: number): Quad {
  const [p0, p1, p2, p3] = quad.points;
  const ux = p1.x - p0.x;
  const uy = p1.y - p0.y;
  const vx = p3.x - p0.x;
  const vy = p3.y - p0.y;
  const a = along;
  const c = across;
  return {
    points: [
      { x: p0.x - ux * a - vx * c, y: p0.y - uy * a - vy * c },
      { x: p1.x + ux * a - vx * c, y: p1.y + uy * a - vy * c },
      { x: p2.x + ux * a + vx * c, y: p2.y + uy * a + vy * c },
      { x: p3.x - ux * a + vx * c, y: p3.y - uy * a + vy * c },
    ],
  };
}

export interface RectifiedRegion {
  data: Uint8Array;
  width: number;
  height: number;
  durationMs: number;
}

/**
 * Samples the region inside `quad` (p0 top-left, p1 top-right, p2 bottom-right, p3 bottom-left, in source pixels)
 * into an axis-aligned luminance rectangle at native resolution along the code (max edge length), height capped.
 * Bilinear sampling; reusable output buffer when sizes match.
 */
export function rectifyQuad(
  luma: Uint8Array,
  width: number,
  height: number,
  quad: Quad,
  out?: Uint8Array,
  maxHeight = 256,
): RectifiedRegion {
  const t0 = performance.now();
  const [p0, p1, p2, p3] = quad.points;
  const outW = Math.max(16, Math.round(Math.max(dist(p0, p1), dist(p3, p2))));
  const outH = Math.max(8, Math.min(maxHeight, Math.round(Math.max(dist(p0, p3), dist(p1, p2)))));
  const H = homographyFromPoints(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    [p0, p1, p2, p3],
  );
  const size = outW * outH;
  const target = out && out.length === size ? out : new Uint8Array(size);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const { x: sx, y: sy } = applyHomography(H, x + 0.5, y + 0.5);
      let v = 255;
      if (sx >= 0 && sy >= 0 && sx <= width - 1 && sy <= height - 1) {
        const x0 = sx | 0;
        const y0 = sy | 0;
        const x1 = Math.min(width - 1, x0 + 1);
        const y1 = Math.min(height - 1, y0 + 1);
        const fx = sx - x0;
        const fy = sy - y0;
        const top = luma[y0 * width + x0]! * (1 - fx) + luma[y0 * width + x1]! * fx;
        const bottom = luma[y1 * width + x0]! * (1 - fx) + luma[y1 * width + x1]! * fx;
        v = top * (1 - fy) + bottom * fy;
      }
      target[y * outW + x] = v;
    }
  }
  return { data: target, width: outW, height: outH, durationMs: performance.now() - t0 };
}

/** Expands a luminance rectangle into RGBA (R=G=B=Y, A=255) for decoders that only accept RGBA; reusable buffer. */
export function lumaToRgba(luma: Uint8Array, out?: Uint8ClampedArray): Uint8ClampedArray {
  const size = luma.length * 4;
  const target = out && out.length === size ? out : new Uint8ClampedArray(size);
  for (let i = 0, o = 0; i < luma.length; i += 1, o += 4) {
    const v = luma[i]!;
    target[o] = v;
    target[o + 1] = v;
    target[o + 2] = v;
    target[o + 3] = 255;
  }
  return target;
}
