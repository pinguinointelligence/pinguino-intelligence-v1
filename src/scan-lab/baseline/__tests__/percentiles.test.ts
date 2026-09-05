import { describe, expect, it } from 'vitest';
import { percentiles, SampleBuffer } from '../stats/percentiles';

describe('percentiles (nearest rank)', () => {
  it('returns zeros for an empty sample', () => {
    expect(percentiles([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, mean: 0 });
  });
  it('handles a single sample', () => {
    expect(percentiles([7])).toEqual({ count: 1, p50: 7, p95: 7, max: 7, mean: 7 });
  });
  it('computes p50/p95/max/mean over 1..100 regardless of order', () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 - i);
    const p = percentiles(values);
    expect(p.count).toBe(100);
    expect(p.p50).toBe(50);
    expect(p.p95).toBe(95);
    expect(p.max).toBe(100);
    expect(p.mean).toBeCloseTo(50.5);
  });
  it('accepts typed arrays', () => {
    expect(percentiles(new Float64Array([3, 1, 2])).p50).toBe(2);
  });
});

describe('SampleBuffer', () => {
  it('keeps only the most recent N values', () => {
    const buf = new SampleBuffer(3);
    [1, 2, 3, 4, 5].forEach((v) => buf.push(v));
    expect(buf.size).toBe(3);
    const snap = buf.snapshot();
    expect(snap.count).toBe(3);
    expect(snap.max).toBe(5);
    expect(snap.mean).toBeCloseTo(4);
  });
  it('resets', () => {
    const buf = new SampleBuffer(4);
    buf.push(1);
    buf.reset();
    expect(buf.size).toBe(0);
    expect(buf.snapshot().count).toBe(0);
  });
});
