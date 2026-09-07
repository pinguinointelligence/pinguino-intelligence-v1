/** Synthetic luminance planes for vision + decoder tests (no DOM). */
import type { Quad } from '../types';

/** EAN-13 encoder (L/G/R patterns) → module array (1 = dark). */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const R = L.map((p) => p.replace(/[01]/g, (c) => (c === '0' ? '1' : '0')));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

export function ean13Modules(digits: string): number[] {
  if (!/^\d{13}$/.test(digits)) throw new Error('need 13 digits');
  const first = Number(digits[0]);
  const parity = PARITY[first]!;
  let bits = '101';
  for (let i = 1; i <= 6; i += 1) {
    const d = Number(digits[i]);
    bits += parity[i - 1] === 'L' ? L[d]! : G[d]!;
  }
  bits += '01010';
  for (let i = 7; i <= 12; i += 1) bits += R[Number(digits[i])]!;
  bits += '101';
  return [...bits].map((b) => Number(b));
}

export interface Plane {
  data: Uint8Array;
  width: number;
  height: number;
}

export function noisePlane(width: number, height: number, seed = 1, base = 128, amp = 20): Plane {
  const data = new Uint8Array(width * height);
  let s = seed;
  for (let i = 0; i < data.length; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = Math.max(0, Math.min(255, base + Math.round(((s / 0x7fffffff) * 2 - 1) * amp)));
  }
  return { data, width, height };
}

/**
 * Paints an EAN-13 (with quiet zones) rotated by `angleDeg` about (cx, cy) into the plane, `modulePx` wide
 * modules, `barHeight` tall. Returns the code's quad in plane pixels (p0 top-left … p3 bottom-left along the
 * reading axis) so tests can compare geometry.
 */
export function paintEan13(
  plane: Plane,
  digits: string,
  cx: number,
  cy: number,
  modulePx: number,
  barHeight: number,
  angleDeg: number,
  labelMarginPx = 60,
): Quad {
  const modules = ean13Modules(digits);
  const quiet = 9;
  const totalModules = modules.length + 2 * quiet;
  const w = totalModules * modulePx;
  const h = barHeight;
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  // inverse mapping per pixel (nearest sample of the ideal code) inside the bounding box
  const lw = w + 2 * labelMarginPx;
  const lh = h + 2 * labelMarginPx;
  const half = Math.hypot(lw, lh) / 2 + 2;
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(plane.width - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(plane.height - 1, Math.ceil(cy + half));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * ux + dy * uy + w / 2;
      const v = dx * vx + dy * vy + h / 2;
      // white label around the code (a real quiet zone continues into the label, not into the scene)
      if (
        u >= -labelMarginPx &&
        u < w + labelMarginPx &&
        v >= -labelMarginPx &&
        v < h + labelMarginPx
      ) {
        plane.data[y * plane.width + x] = 235;
      }
      if (u < 0 || u >= w || v < 0 || v >= h) continue;
      const m = Math.floor(u / modulePx) - quiet;
      const dark = m >= 0 && m < modules.length ? modules[m] === 1 : false;
      plane.data[y * plane.width + x] = dark ? 25 : 235;
    }
  }
  const corner = (su: number, sv: number) => ({
    x: cx + su * ux + sv * vx,
    y: cy + su * uy + sv * vy,
  });
  const cw = (modules.length * modulePx) / 2;
  const ch = h / 2;
  return { points: [corner(-cw, -ch), corner(cw, -ch), corner(cw, ch), corner(-cw, ch)] };
}

export function quadBBox(q: Quad) {
  const xs = q.points.map((p) => p.x);
  const ys = q.points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function iou(a: Quad, b: Quad): number {
  const A = quadBBox(a);
  const B = quadBBox(b);
  const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
  const iy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
  const inter = ix * iy;
  const union = (A.x1 - A.x0) * (A.y1 - A.y0) + (B.x1 - B.x0) * (B.y1 - B.y0) - inter;
  return union > 0 ? inter / union : 0;
}
