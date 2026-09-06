/**
 * Candidate merging: bar-texture saliency splits one barcode into collinear pieces (guard bars, quiet
 * zones, print gaps); the pieces jitter frame to frame and under-report the code's width (D3 18 cm: a
 * 121-px piece of a ~250-px code sent the policy into the FAR regime). Merge pieces that share an
 * orientation and lie on the same reading axis before deriving fill / module.
 */
export interface RawCandidate {
  quad: { points: Array<{ x: number; y: number }> };
  orientationDeg: number;
  score: number;
  blockCount: number;
}

export interface MergedCandidate {
  fill: number;
  widthPx: number;
  heightPx: number;
  angleDeg: number;
  cx: number;
  cy: number;
  pieces: number;
  score: number;
}

const MERGE = { angleTolDeg: 12, gapFactor: 0.6, lateralFactor: 0.8 } as const;

function axisOf(c: RawCandidate): {
  ux: number;
  uy: number;
  cx: number;
  cy: number;
  len: number;
  height: number;
} {
  const p = c.quad.points;
  const cx = (p[0]!.x + p[1]!.x + p[2]!.x + p[3]!.x) / 4;
  const cy = (p[0]!.y + p[1]!.y + p[2]!.y + p[3]!.y) / 4;
  const dx = p[1]!.x - p[0]!.x;
  const dy = p[1]!.y - p[0]!.y;
  const len = Math.hypot(dx, dy) || 1;
  const height = Math.hypot(p[3]!.x - p[0]!.x, p[3]!.y - p[0]!.y);
  return { ux: dx / len, uy: dy / len, cx, cy, len, height };
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

export function mergeCollinear(
  candidates: readonly RawCandidate[],
  sourceW: number,
): MergedCandidate[] {
  const items = candidates.map((c) => ({ c, a: axisOf(c), used: false }));
  const out: MergedCandidate[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]!;
    if (it.used) continue;
    it.used = true;
    const group = [it];
    for (let j = i + 1; j < items.length; j += 1) {
      const other = items[j]!;
      if (other.used) continue;
      if (angleDiff(it.c.orientationDeg, other.c.orientationDeg) > MERGE.angleTolDeg) continue;
      // project the other's centre onto this candidate's axis
      const dx = other.a.cx - it.a.cx;
      const dy = other.a.cy - it.a.cy;
      const along = dx * it.a.ux + dy * it.a.uy;
      const lateral = Math.abs(-dx * it.a.uy + dy * it.a.ux);
      const gap = Math.abs(along) - (it.a.len + other.a.len) / 2;
      if (
        lateral <= MERGE.lateralFactor * Math.max(it.a.height, other.a.height) &&
        gap <= MERGE.gapFactor * Math.max(it.a.len, other.a.len)
      ) {
        other.used = true;
        group.push(other);
      }
    }
    // union extent along the anchor axis
    let minU = Infinity;
    let maxU = -Infinity;
    let height = 0;
    let score = 0;
    for (const g of group) {
      const dx = g.a.cx - it.a.cx;
      const dy = g.a.cy - it.a.cy;
      const along = dx * it.a.ux + dy * it.a.uy;
      minU = Math.min(minU, along - g.a.len / 2);
      maxU = Math.max(maxU, along + g.a.len / 2);
      height = Math.max(height, g.a.height);
      score += g.c.score * g.c.blockCount;
    }
    const len = maxU - minU;
    const mid = (minU + maxU) / 2;
    out.push({
      fill: len / sourceW,
      widthPx: len,
      heightPx: height,
      angleDeg: it.c.orientationDeg,
      cx: it.a.cx + it.a.ux * mid,
      cy: it.a.cy + it.a.uy * mid,
      pieces: group.length,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
