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
  /** evidence-weighted consensus orientation of the group (degrees; 0 = bars vertical, reads left→right) */
  angleDeg: number;
  /**
   * 0..1 — how safely `angleDeg` picks a READING AXIS (owner QA 2026-09-06). Two independent doubts are
   * folded in: how much the fragments AGREE (weighted by their bar-texture mass) and how far the consensus
   * sits from the 45°/135° boundary at which the axis flips. A tin held diagonally scores near 0, and the
   * engine then ATTEMPTS both axes instead of betting on one.
   */
  axisConfidence: number;
  cx: number;
  cy: number;
  pieces: number;
  score: number;
}

const MERGE = { angleTolDeg: 12, gapFactor: 0.6, lateralFactor: 0.8 } as const;

export const AXIS = {
  /** within this many degrees of the 45°/135° boundary the axis is a coin flip whatever the fragments agree on */
  boundaryMarginDeg: 15,
  /** at or above this the engine may attempt a single axis; below it, both */
  confidentAt: 0.6,
} as const;

/**
 * Axial (mod 180°) evidence-weighted mean and its resultant length. Orientation is an AXIS, not a
 * direction, so the statistics are done on the doubled angle: 179° and 1° are 2° apart, not 178°.
 */
function consensusAngle(group: ReadonlyArray<{ c: RawCandidate }>): { deg: number; agree: number } {
  let sx = 0;
  let sy = 0;
  let wsum = 0;
  for (const g of group) {
    // weight by bar-texture mass, so a faint one-block fragment cannot outvote the code itself
    const w = Math.max(1e-6, Math.abs(g.c.score) * Math.max(1, g.c.blockCount));
    const t = (2 * g.c.orientationDeg * Math.PI) / 180;
    sx += w * Math.cos(t);
    sy += w * Math.sin(t);
    wsum += w;
  }
  if (wsum <= 0) return { deg: group[0]?.c.orientationDeg ?? 0, agree: 0 };
  return {
    deg: (Math.atan2(sy, sx) * 180) / Math.PI / 2,
    agree: Math.min(1, Math.hypot(sx, sy) / wsum),
  };
}

/** How far `angleDeg` is from the axis boundary, as a 0..1 factor over AXIS.boundaryMarginDeg. */
export function axisBoundaryMargin(angleDeg: number): number {
  const a = ((angleDeg % 180) + 180) % 180;
  const d = Math.min(Math.abs(a - 45), Math.abs(a - 135));
  return Math.max(0, Math.min(1, d / AXIS.boundaryMarginDeg));
}

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
    /* The group's extent stays measured along the ANCHOR axis (unchanged geometry), but the reported
       orientation is the consensus of every fragment weighted by its bar evidence: the anchor is only
       whichever fragment came first, and letting it name the reading axis for the whole code turned a
       ±12° accident into a wrong axis whenever the code sat near the 45° boundary. */
    const consensus = consensusAngle(group);
    out.push({
      fill: len / sourceW,
      widthPx: len,
      heightPx: height,
      angleDeg: consensus.deg,
      axisConfidence: consensus.agree * axisBoundaryMargin(consensus.deg),
      cx: it.a.cx + it.a.ux * mid,
      cy: it.a.cy + it.a.uy * mid,
      pieces: group.length,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
