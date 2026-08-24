export interface BarcodeTimingSummary {
  count: number;
  p50: number;
  p95: number;
  max: number;
}

const percentile = (sorted: readonly number[], fraction: number): number => {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
};

export function summarizeBarcodeTimings(samples: readonly number[]): BarcodeTimingSummary {
  const sorted = samples
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .map((sample) => Number(sample.toFixed(3)))
    .sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  };
}
