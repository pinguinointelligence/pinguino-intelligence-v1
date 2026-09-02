/**
 * A GTIN decoder that does not depend on `BarcodeDetector`.
 *
 * The owner's real defect — a barcode plainly visible in the submitted photos and
 * „Kod: Brak" in the result — was not a recognition failure. It was an ABSENT
 * recognizer: the live scanner detected codes only through `window.BarcodeDetector`,
 * which Safari does not implement. On the owner's iPhone nothing ever ran, the
 * session reached the paid analysis with `barcode: null`, and the exact-product
 * routing that is supposed to happen FIRST could not happen at all.
 *
 * This module is the fallback: a scanline EAN-13 / EAN-8 / UPC-A reader over the
 * luminance of a frame the browser already gives us. It is deliberately small and
 * pure — no worker, no wasm, no new dependency, no OCR. Digit recognition uses the
 * standard run-length variance match, so a digit is accepted only when its four
 * bar/space widths fit one pattern and no other.
 */

/** L patterns (odd parity). Right-hand digits share these run widths inverted. */
const L_PATTERNS: readonly (readonly number[])[] = [
  [3, 2, 1, 1],
  [2, 2, 2, 1],
  [2, 1, 2, 2],
  [1, 4, 1, 1],
  [1, 1, 3, 2],
  [1, 2, 3, 1],
  [1, 1, 1, 4],
  [1, 3, 1, 2],
  [1, 2, 1, 3],
  [3, 1, 1, 2],
];
/** G patterns are the L patterns read backwards (even parity). */
const G_PATTERNS: readonly (readonly number[])[] = L_PATTERNS.map((pattern) => [...pattern].reverse());
/** Bit i set = digit i of the left half is G-encoded. Decides the 13th digit. */
const FIRST_DIGIT_PARITY = [0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a];

const MAX_INDIVIDUAL_VARIANCE = 0.7;
const MAX_AVERAGE_VARIANCE = 0.48;

export interface Run {
  /** true = dark module run. */
  dark: boolean;
  width: number;
}

/** Rec. 709 luminance of an RGBA buffer, one byte per pixel. */
export function luminanceFromRgba(
  pixels: Uint8ClampedArray | Uint8Array | readonly number[],
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let index = 0; index < out.length; index += 1) {
    const offset = index * 4;
    out[index] = Math.round(
      (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722,
    );
  }
  return out;
}

/**
 * Runs of one scanline. The threshold is local to the row (midpoint between its
 * darkest and brightest pixel) so a gradient across the package cannot swallow the
 * code the way a single global threshold would.
 */
export function scanlineRuns(row: Uint8Array | readonly number[]): Run[] {
  let min = 255;
  let max = 0;
  for (const value of row) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  // A flat row carries no bars. Refusing here keeps noise from decoding as digits.
  if (max - min < 40) return [];
  const threshold = (min + max) / 2;
  const runs: Run[] = [];
  let dark = (row[0] ?? 0) < threshold;
  let width = 0;
  for (const value of row) {
    const isDark = value < threshold;
    if (isDark === dark) width += 1;
    else {
      runs.push({ dark, width });
      dark = isDark;
      width = 1;
    }
  }
  runs.push({ dark, width });
  return runs;
}

/**
 * How badly `counters` fit `pattern`, normalized by the total width so the match is
 * independent of how far away the camera was. `null` = no fit.
 */
function patternVariance(counters: readonly number[], pattern: readonly number[]): number | null {
  const total = counters.reduce((sum, value) => sum + value, 0);
  const patternTotal = pattern.reduce((sum, value) => sum + value, 0);
  if (total < patternTotal) return null;
  const unit = total / patternTotal;
  const maxVariance = unit * MAX_INDIVIDUAL_VARIANCE;
  let totalVariance = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = (pattern[index] ?? 0) * unit;
    const variance = Math.abs((counters[index] ?? 0) - expected);
    if (variance > maxVariance) return null;
    totalVariance += variance;
  }
  return totalVariance / total;
}

interface DigitMatch {
  digit: number;
  parity: 'L' | 'G';
}

function matchDigit(counters: readonly number[], sets: readonly ('L' | 'G')[]): DigitMatch | null {
  let best: DigitMatch | null = null;
  let bestVariance = MAX_AVERAGE_VARIANCE;
  for (const parity of sets) {
    const patterns = parity === 'L' ? L_PATTERNS : G_PATTERNS;
    for (let digit = 0; digit < patterns.length; digit += 1) {
      const variance = patternVariance(counters, patterns[digit]!);
      if (variance !== null && variance < bestVariance) {
        bestVariance = variance;
        best = { digit, parity };
      }
    }
  }
  return best;
}

const widthsAt = (runs: readonly Run[], start: number, count: number): number[] | null =>
  start + count > runs.length ? null : runs.slice(start, start + count).map((run) => run.width);

/** 101 / 01010: three or five equal modules. */
function isGuard(runs: readonly Run[], start: number, count: number): boolean {
  const widths = widthsAt(runs, start, count);
  if (!widths) return false;
  return patternVariance(widths, Array.from({ length: count }, () => 1)) !== null;
}

function checkDigit(payload: string): number {
  const sum = [...payload]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

const checksumHolds = (value: string): boolean =>
  checkDigit(value.slice(0, -1)) === Number(value.at(-1));

/** EAN-13 (and therefore UPC-A) from runs whose first run is the start guard's bar. */
function decodeEan13(runs: readonly Run[], start: number): string | null {
  if (!isGuard(runs, start, 3)) return null;
  let cursor = start + 3;
  const left: DigitMatch[] = [];
  for (let index = 0; index < 6; index += 1) {
    const widths = widthsAt(runs, cursor, 4);
    if (!widths) return null;
    const match = matchDigit(widths, ['L', 'G']);
    if (!match) return null;
    left.push(match);
    cursor += 4;
  }
  if (!isGuard(runs, cursor, 5)) return null;
  cursor += 5;
  const right: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const widths = widthsAt(runs, cursor, 4);
    if (!widths) return null;
    const match = matchDigit(widths, ['L']);
    if (!match) return null;
    right.push(match.digit);
    cursor += 4;
  }
  if (!isGuard(runs, cursor, 3)) return null;
  const parityBits = left.reduce(
    (bits, match, index) => bits | (match.parity === 'G' ? 1 << (5 - index) : 0),
    0,
  );
  const firstDigit = FIRST_DIGIT_PARITY.indexOf(parityBits);
  if (firstDigit < 0) return null;
  const value = `${firstDigit}${left.map((match) => match.digit).join('')}${right.join('')}`;
  return checksumHolds(value) ? value : null;
}

/** EAN-8: four L digits, middle guard, four R digits. */
function decodeEan8(runs: readonly Run[], start: number): string | null {
  if (!isGuard(runs, start, 3)) return null;
  let cursor = start + 3;
  const digits: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const widths = widthsAt(runs, cursor, 4);
    if (!widths) return null;
    const match = matchDigit(widths, ['L']);
    if (!match) return null;
    digits.push(match.digit);
    cursor += 4;
  }
  if (!isGuard(runs, cursor, 5)) return null;
  cursor += 5;
  for (let index = 0; index < 4; index += 1) {
    const widths = widthsAt(runs, cursor, 4);
    if (!widths) return null;
    const match = matchDigit(widths, ['L']);
    if (!match) return null;
    digits.push(match.digit);
    cursor += 4;
  }
  if (!isGuard(runs, cursor, 3)) return null;
  const value = digits.join('');
  return checksumHolds(value) ? value : null;
}

/**
 * Every dark run is a candidate start guard, in both reading directions — a package
 * held upside down is the normal case, not an error the user should be asked to fix.
 */
export function decodeGtinFromRuns(runs: readonly Run[]): string | null {
  const directions: Run[][] = [[...runs], [...runs].reverse()];
  for (const oriented of directions) {
    for (let start = 0; start < oriented.length; start += 1) {
      if (!oriented[start]?.dark) continue;
      const thirteen = decodeEan13(oriented, start);
      if (thirteen) return thirteen;
      const eight = decodeEan8(oriented, start);
      if (eight) return eight;
    }
  }
  return null;
}

export function decodeGtinFromRow(row: Uint8Array | readonly number[]): string | null {
  const runs = scanlineRuns(row);
  return runs.length < 20 ? null : decodeGtinFromRuns(runs);
}

/**
 * Sweep a frame. Rows are tried from the middle outwards because a hand-held package
 * is usually centred, and the first row that decodes wins — a GTIN carries its own
 * check digit, so a single agreeing scanline is already a verified read.
 */
export function decodeGtinFromLuminance(
  luminance: Uint8Array,
  width: number,
  height: number,
  rowsToTry = 21,
): string | null {
  if (width < 60 || height < 1 || luminance.length < width * height) return null;
  const step = Math.max(1, Math.floor(height / (rowsToTry + 1)));
  const offsets: number[] = [];
  for (let index = 1; index <= rowsToTry; index += 1) {
    const row = index * step;
    if (row < height) offsets.push(row);
  }
  if (offsets.length === 0) offsets.push(Math.floor(height / 2));
  offsets.sort((left, right) => Math.abs(left - height / 2) - Math.abs(right - height / 2));
  for (const y of offsets) {
    const row = luminance.subarray(y * width, y * width + width);
    const decoded = decodeGtinFromRow(row);
    if (decoded) return decoded;
  }
  return null;
}

/** The frame path the camera loop uses: RGBA in, validated GTIN digits out. */
export function decodeGtinFromRgba(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): string | null {
  return decodeGtinFromLuminance(luminanceFromRgba(pixels, width, height), width, height);
}
