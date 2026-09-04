import type { Point, Quad, SaliencyCandidate, SaliencyResult } from '../types';
import { downscaleLuminance } from './luminance';

export interface SaliencyOptions {
  /** Target width of the analysis pyramid level (px). */
  targetWidth?: number;
  /** Block size in downscaled pixels. */
  blockSize?: number;
  /** Minimum coherence×energy score for a block to count as bar texture. */
  scoreThreshold?: number;
  /** Gradient energy (mean squared gradient per pixel) that saturates the energy term. */
  energyScale?: number;
  /** Minimum blocks per candidate. */
  minBlocks?: number;
  /** Max candidates returned. */
  maxCandidates?: number;
  /**
   * Minimum strong-gradient sign changes per block (along x OR along y), as a multiple of blockSize.
   * A lone straight edge yields one transition per row (= 1 × blockSize); bars yield several.
   */
  minTransitionsPerRow?: number;
  /** |gradient| on the downscaled plane that counts as a bar edge. */
  edgeThreshold?: number;
}

const DEFAULTS: Required<SaliencyOptions> = {
  targetWidth: 320,
  blockSize: 8,
  scoreThreshold: 0.35,
  energyScale: 400,
  minBlocks: 4,
  maxCandidates: 5,
  minTransitionsPerRow: 1.5,
  edgeThreshold: 14,
};

interface Buffers {
  down?: Uint8Array;
  jxx?: Float32Array;
  jyy?: Float32Array;
  jxy?: Float32Array;
  score?: Float32Array;
  theta?: Float32Array;
  labels?: Int32Array;
  transX?: Int32Array;
  transY?: Int32Array;
  lastSignY?: Int8Array;
}

/**
 * Bar-texture saliency: structure-tensor coherence per block on a downscaled luminance plane.
 * Barcodes are regions of high gradient energy with ONE dominant gradient orientation (high coherence);
 * text and clutter have energy but mixed orientations. Returns oriented candidate quads in full-resolution
 * pixel coordinates plus a module-width estimate from run lengths along the code axis.
 */
export class BarSaliency {
  private readonly opts: Required<SaliencyOptions>;
  private readonly buf: Buffers = {};

  constructor(options: SaliencyOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  analyze(luma: Uint8Array, width: number, height: number): SaliencyResult {
    const t0 = performance.now();
    const o = this.opts;
    const factor = Math.max(1, Math.round(width / o.targetWidth));
    const level = downscaleLuminance(luma, width, height, factor, this.buf.down);
    this.buf.down = level.data;
    const { data, width: w, height: h } = level;
    const B = o.blockSize;
    const bw = Math.floor(w / B);
    const bh = Math.floor(h / B);
    const nb = bw * bh;
    const jxx = this.ensure('jxx', nb);
    const jyy = this.ensure('jyy', nb);
    const jxy = this.ensure('jxy', nb);
    const score = this.ensure('score', nb);
    const theta = this.ensure('theta', nb);
    jxx.fill(0);
    jyy.fill(0);
    jxy.fill(0);
    const transX = this.ensure('transX', nb, Int32Array);
    const transY = this.ensure('transY', nb, Int32Array);
    const lastSignY = this.ensure('lastSignY', w, Int8Array);
    transX.fill(0);
    transY.fill(0);
    lastSignY.fill(0);
    const edge = o.edgeThreshold;
    // structure tensor sums per block (central differences, interior pixels only) + bar-edge transitions
    for (let y = 1; y < h - 1; y += 1) {
      const by = Math.min(bh - 1, (y / B) | 0);
      if (y % B === 0) lastSignY.fill(0);
      const row = y * w;
      let lastSignX = 0;
      let lastBi = -1;
      for (let x = 1; x < w - 1; x += 1) {
        const gx = (data[row + x + 1]! - data[row + x - 1]!) * 0.5;
        const gy = (data[row + w + x]! - data[row - w + x]!) * 0.5;
        const bi = by * bw + Math.min(bw - 1, (x / B) | 0);
        if (bi !== lastBi) {
          lastSignX = 0;
          lastBi = bi;
        }
        jxx[bi] = jxx[bi]! + gx * gx;
        jyy[bi] = jyy[bi]! + gy * gy;
        jxy[bi] = jxy[bi]! + gx * gy;
        if (gx > edge || gx < -edge) {
          const sign = gx > 0 ? 1 : -1;
          if (lastSignX !== 0 && sign !== lastSignX) transX[bi] = transX[bi]! + 1;
          lastSignX = sign;
        }
        if (gy > edge || gy < -edge) {
          const sign = gy > 0 ? 1 : -1;
          const prev = lastSignY[x]!;
          if (prev !== 0 && sign !== prev) transY[bi] = transY[bi]! + 1;
          lastSignY[x] = sign;
        }
      }
    }
    const perBlock = B * B;
    for (let i = 0; i < nb; i += 1) {
      const a = jxx[i]!;
      const b = jyy[i]!;
      const c = jxy[i]!;
      const trace = a + b;
      const coherence = trace > 1e-6 ? Math.sqrt((a - b) * (a - b) + 4 * c * c) / trace : 0;
      const energy = Math.min(1, trace / perBlock / o.energyScale);
      const transitions = Math.max(transX[i]!, transY[i]!);
      // a lone straight edge saturates energy and coherence; bars are the only texture with repeated transitions
      score[i] = transitions >= o.minTransitionsPerRow * B ? coherence * energy : 0;
      theta[i] = 0.5 * Math.atan2(2 * c, a - b); // dominant gradient direction (radians), bars are perpendicular
    }
    // connected components over blocks above threshold with consistent orientation
    const labels = this.ensure('labels', nb, Int32Array);
    labels.fill(-1);
    const comps: Array<{ blocks: number[]; cos2: number; sin2: number; weight: number }> = [];
    const stack: number[] = [];
    for (let seed = 0; seed < nb; seed += 1) {
      if (labels[seed] !== -1 || score[seed]! < o.scoreThreshold) continue;
      const id = comps.length;
      const comp = { blocks: [] as number[], cos2: 0, sin2: 0, weight: 0 };
      comps.push(comp);
      labels[seed] = id;
      stack.push(seed);
      while (stack.length) {
        const i = stack.pop()!;
        comp.blocks.push(i);
        const wgt = score[i]!;
        comp.cos2 += Math.cos(2 * theta[i]!) * wgt;
        comp.sin2 += Math.sin(2 * theta[i]!) * wgt;
        comp.weight += wgt;
        const bx = i % bw;
        const by = (i / bw) | 0;
        const neighbours = [i - 1, i + 1, i - bw, i + bw];
        for (let k = 0; k < 4; k += 1) {
          const j = neighbours[k]!;
          if (j < 0 || j >= nb) continue;
          const jx = j % bw;
          if (k < 2 && Math.abs(jx - bx) !== 1) continue; // row wrap guard
          if (k >= 2 && jx !== bx) continue;
          if (labels[j] !== -1 || score[j]! < o.scoreThreshold) continue;
          // orientation agreement (double-angle distance)
          const d = Math.abs(angleDiff(2 * theta[j]!, 2 * theta[seed]!));
          if (d > (40 * Math.PI) / 180) continue;
          labels[j] = id;
          stack.push(j);
        }
        void by;
      }
    }
    const candidates: SaliencyCandidate[] = [];
    for (const comp of comps) {
      if (comp.blocks.length < o.minBlocks) continue;
      const thetaC = 0.5 * Math.atan2(comp.sin2, comp.cos2); // gradient direction = code reading axis
      const ux = Math.cos(thetaC);
      const uy = Math.sin(thetaC);
      const vx = -uy;
      const vy = ux;
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const i of comp.blocks) {
        const cx = ((i % bw) + 0.5) * B;
        const cy = (((i / bw) | 0) + 0.5) * B;
        const pu = cx * ux + cy * uy;
        const pv = cx * vx + cy * vy;
        if (pu < minU) minU = pu;
        if (pu > maxU) maxU = pu;
        if (pv < minV) minV = pv;
        if (pv > maxV) maxV = pv;
      }
      const half = B / 2;
      minU -= half;
      maxU += half;
      minV -= half;
      maxV += half;
      const corner = (pu: number, pv: number): Point => ({
        x: (pu * ux + pv * vx) * factor,
        y: (pu * uy + pv * vy) * factor,
      });
      const quad: Quad = {
        points: [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)],
      };
      const lengthPx = (maxU - minU) * factor;
      const moduleEstimatePx = estimateModuleWidth(luma, width, height, quad, ux, uy);
      candidates.push({
        quad,
        orientationDeg: (thetaC * 180) / Math.PI,
        score: comp.weight / comp.blocks.length,
        blockCount: comp.blocks.length,
        moduleEstimatePx,
        fillRatio: lengthPx / width,
      });
    }
    candidates.sort((a, b) => b.score * b.blockCount - a.score * a.blockCount);
    return {
      durationMs: performance.now() - t0,
      candidates: candidates.slice(0, o.maxCandidates),
      downscaledWidth: w,
      downscaledHeight: h,
    };
  }

  private ensure<T extends Float32Array | Int32Array | Int8Array>(
    key: keyof Buffers,
    size: number,
    Ctor: { new (n: number): T } = Float32Array as unknown as { new (n: number): T },
  ): T {
    const existing = this.buf[key] as T | undefined;
    if (existing && existing.length === size) return existing;
    const created = new Ctor(size);
    (this.buf as Record<string, unknown>)[key] = created;
    return created;
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Module-width estimate: sample the full-resolution luminance along the code axis through the candidate centre,
 * binarise against a sliding min/max midpoint, and take the 25th percentile of run widths (most runs are 1–2 modules).
 */
export function estimateModuleWidth(
  luma: Uint8Array,
  width: number,
  height: number,
  quad: Quad,
  ux: number,
  uy: number,
): number | null {
  const [p0, p1, p2, p3] = quad.points;
  const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
  const cy = (p0.y + p1.y + p2.y + p3.y) / 4;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const n = Math.max(8, Math.round(len));
  const profile = new Uint8Array(n);
  let valid = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i - n / 2;
    const x = Math.round(cx + ux * t);
    const y = Math.round(cy + uy * t);
    if (x < 0 || y < 0 || x >= width || y >= height) {
      profile[i] = 255;
      continue;
    }
    profile[i] = luma[y * width + x]!;
    valid += 1;
  }
  if (valid < 24) return null;
  const window = 12;
  const runs: number[] = [];
  let prev: boolean | null = null;
  let run = 0;
  for (let i = 0; i < n; i += 1) {
    let mn = 255;
    let mx = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(n - 1, i + window); j += 1) {
      const v = profile[j]!;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mx - mn < 30) {
      if (prev !== null && run > 0) runs.push(run);
      prev = null;
      run = 0;
      continue;
    }
    const dark = profile[i]! < (mn + mx) / 2;
    if (prev === null) {
      prev = dark;
      run = 1;
    } else if (dark === prev) run += 1;
    else {
      runs.push(run);
      prev = dark;
      run = 1;
    }
  }
  if (prev !== null && run > 0) runs.push(run);
  if (runs.length < 12) return null;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length * 0.25)] ?? null;
}
