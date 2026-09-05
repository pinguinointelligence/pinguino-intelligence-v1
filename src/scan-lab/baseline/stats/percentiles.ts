import type { Percentiles } from '../types';

const EMPTY: Percentiles = { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };

/** Nearest-rank percentiles over a sample; deterministic and allocation-light. */
export function percentiles(samples: ArrayLike<number>): Percentiles {
  const n = samples.length;
  if (n === 0) return EMPTY;
  const sorted = Array.from(samples as ArrayLike<number>).sort((a, b) => a - b);
  const rank = (p: number) =>
    sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))] ?? 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sorted[i] ?? 0;
  return { count: n, p50: rank(50), p95: rank(95), max: sorted[n - 1] ?? 0, mean: sum / n };
}

/** Fixed-capacity sample buffer; keeps the most recent `capacity` values. */
export class SampleBuffer {
  private readonly values: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(readonly capacity = 4096) {
    this.values = new Float64Array(capacity);
  }

  push(value: number): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  get size(): number {
    return this.filled;
  }

  snapshot(): Percentiles {
    return percentiles(this.values.subarray(0, this.filled));
  }

  reset(): void {
    this.next = 0;
    this.filled = 0;
  }
}
