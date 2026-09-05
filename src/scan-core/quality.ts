/**
 * Scan Core — candidate quality metrics the audit lists (§5.5 Locate) beyond frame-level sharpness:
 * edge contact (cut-off code), glare on the target, tilt from the quad, local contrast. Pure; the caller passes
 * the luma plane and the candidate geometry.
 */
import type { Geometry } from './track';

export type CutEdge = 'top' | 'right' | 'bottom' | 'left';

export interface CandidateQuality {
  cutEdges: CutEdge[];
  /** share of pixels ≥ 250 inside the candidate box (glare ON the code, not in the scene) */
  glareOnTarget: number;
  /** |angle| folded to 0..45 */
  tiltDeg: number;
  /** p95 − p5 luma inside the box (bar/space separation proxy) */
  contrast: number;
  meanLuma: number;
}

/** Axis-aligned box of the candidate with margin, clamped to the plane. */
export function candidateBox(g: Geometry, planeW: number, planeH: number, margin = 0.1) {
  const rad = (g.angleDeg * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(rad)) * g.widthPx + Math.abs(Math.sin(rad)) * g.heightPx) / 2;
  const hh = (Math.abs(Math.sin(rad)) * g.widthPx + Math.abs(Math.cos(rad)) * g.heightPx) / 2;
  const x0 = Math.max(0, Math.floor(g.cx - hw * (1 + margin)));
  const y0 = Math.max(0, Math.floor(g.cy - hh * (1 + margin)));
  const x1 = Math.min(planeW, Math.ceil(g.cx + hw * (1 + margin)));
  const y1 = Math.min(planeH, Math.ceil(g.cy + hh * (1 + margin)));
  return { x0, y0, x1, y1 };
}

export function candidateQuality(
  luma: Uint8Array,
  planeW: number,
  planeH: number,
  g: Geometry,
  edgeTolerancePx = 4,
): CandidateQuality {
  const rad = (g.angleDeg * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(rad)) * g.widthPx + Math.abs(Math.sin(rad)) * g.heightPx) / 2;
  const hh = (Math.abs(Math.sin(rad)) * g.widthPx + Math.abs(Math.cos(rad)) * g.heightPx) / 2;
  const cutEdges: CutEdge[] = [];
  if (g.cx - hw <= edgeTolerancePx) cutEdges.push('left');
  if (g.cx + hw >= planeW - edgeTolerancePx) cutEdges.push('right');
  if (g.cy - hh <= edgeTolerancePx) cutEdges.push('top');
  if (g.cy + hh >= planeH - edgeTolerancePx) cutEdges.push('bottom');
  const b = candidateBox(g, planeW, planeH, 0);
  const hist = new Uint32Array(256);
  let n = 0;
  let clipped = 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(((b.x1 - b.x0) * (b.y1 - b.y0)) / 4096)));
  for (let y = b.y0; y < b.y1; y += step) {
    const row = y * planeW;
    for (let x = b.x0; x < b.x1; x += step) {
      const v = luma[row + x]!;
      hist[v] = (hist[v] ?? 0) + 1;
      n += 1;
      sum += v;
      if (v >= 250) clipped += 1;
    }
  }
  let p5 = 0;
  let p95 = 255;
  if (n > 0) {
    let acc = 0;
    for (let v = 0; v < 256; v += 1) {
      acc += hist[v]!;
      if (acc >= n * 0.05) {
        p5 = v;
        break;
      }
    }
    acc = 0;
    for (let v = 255; v >= 0; v -= 1) {
      acc += hist[v]!;
      if (acc >= n * 0.05) {
        p95 = v;
        break;
      }
    }
  }
  let tilt = Math.abs(g.angleDeg) % 90;
  if (tilt > 45) tilt = 90 - tilt;
  return {
    cutEdges,
    glareOnTarget: n ? clipped / n : 0,
    tiltDeg: tilt,
    contrast: n ? p95 - p5 : 0,
    meanLuma: n ? sum / n : 0,
  };
}
