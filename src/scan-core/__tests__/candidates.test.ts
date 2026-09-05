import { describe, expect, it } from 'vitest';
import { mergeCollinear, type RawCandidate } from '../candidates';

const piece = (
  x0: number,
  x1: number,
  y0 = 100,
  y1 = 130,
  orientationDeg = 0,
  score = 1,
): RawCandidate => ({
  quad: {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  },
  orientationDeg,
  score,
  blockCount: 10,
});

describe('mergeCollinear', () => {
  it('joins two pieces of one code on the same axis into one candidate with the union width', () => {
    const merged = mergeCollinear([piece(100, 276), piece(300, 396)], 1080);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.widthPx).toBeCloseTo(296, 0);
    expect(merged[0]!.pieces).toBe(2);
    expect(merged[0]!.fill).toBeCloseTo(296 / 1080, 3);
  });
  it('keeps codes on different axes or orientations apart (two-codes scene)', () => {
    const merged = mergeCollinear([piece(100, 400, 100, 130), piece(100, 400, 400, 430)], 1080);
    expect(merged).toHaveLength(2);
    expect(
      mergeCollinear([piece(100, 300, 100, 130, 0), piece(320, 500, 100, 130, 40)], 1080),
    ).toHaveLength(2);
  });
  it('does not bridge a gap larger than 60 % of the longer piece', () => {
    expect(mergeCollinear([piece(0, 100), piece(300, 400)], 1080)).toHaveLength(2);
  });
});
