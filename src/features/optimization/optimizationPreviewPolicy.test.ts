import { describe, expect, it } from 'vitest';
import { optimizationDisplayPolicy, recommendationFor } from './optimizationPreviewPolicy';

const demo = { exactCorrectionGrams: false, technicalView: false };
const free = { exactCorrectionGrams: false, technicalView: false };
const pro = { exactCorrectionGrams: true, technicalView: true };

describe('optimizationDisplayPolicy', () => {
  it('Free / Demo redacts exact grams, correction detail and before/after metrics', () => {
    for (const caps of [demo, free]) {
      const p = optimizationDisplayPolicy(caps);
      expect(p.level).toBe('redacted');
      expect(p.showExactGrams).toBe(false);
      expect(p.showCorrectionDetail).toBe(false);
      expect(p.showBeforeAfterMetrics).toBe(false);
      expect(p.showTrace).toBe(false);
    }
  });

  it('Pro shows exact grams, the full correction plan and before/after metrics', () => {
    const p = optimizationDisplayPolicy(pro);
    expect(p.level).toBe('full');
    expect(p.showExactGrams).toBe(true);
    expect(p.showCorrectionDetail).toBe(true);
    expect(p.showBeforeAfterMetrics).toBe(true);
  });

  it('DEV adds the debug trace WITHOUT relaxing customer redaction', () => {
    const p = optimizationDisplayPolicy(demo, { dev: true });
    expect(p.showTrace).toBe(true);
    // a demo viewer in a dev build is still redacted for the customer-facing detail
    expect(p.level).toBe('redacted');
    expect(p.showExactGrams).toBe(false);
    expect(p.showCorrectionDetail).toBe(false);
  });

  it('recommendation text is number-free for every decision (safe for redacted views)', () => {
    for (const d of ['optimized', 'tradeoff', 'impossible', 'blocked', 'no_action_needed']) {
      const r = recommendationFor(d);
      expect(r.length).toBeGreaterThan(0);
      expect(/\d/.test(r), `${d} recommendation has a digit`).toBe(false);
    }
  });
});
