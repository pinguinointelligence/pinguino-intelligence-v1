import { describe, expect, it } from 'vitest';
import { planHandoff, reviewLabel } from './liveScanHandoff';
import type { AcceptedProduct, LiveScanSessionState } from './liveScanSession';

const product = (over: Partial<AcceptedProduct>): AcceptedProduct => ({
  identityKey: 'prod-1',
  label: 'OREO Original 154 g',
  route: 'LOCAL_BARCODE',
  acceptedAt: 0,
  evidence: 1,
  needsDeepScan: false,
  acceptance: 'confirmed',
  ...over,
});

const state = (accepted: readonly AcceptedProduct[]): LiveScanSessionState => ({
  accepted,
  evidence: {},
  acceptedAt: {},
  counters: {
    LOCAL_BARCODE: 0,
    LOCAL_OCR: 0,
    CATALOG_MATCH: 0,
    VISION_FALLBACK: 0,
    UNKNOWN: 0,
  },
});

describe('a sweep has exactly two destinations', () => {
  it('sends catalogue products to the recipe and the rest to the deep flow', () => {
    const plan = planHandoff(
      state([
        product({}),
        product({
          identityKey: 'ean:5901234123457',
          label: 'ean:5901234123457',
          route: 'UNKNOWN',
          needsDeepScan: true,
          acceptance: 'needs_resolution',
        }),
      ]),
    );
    expect(plan.toRecipe.map((p) => p.identityKey)).toEqual(['prod-1']);
    expect(plan.toDeepScan.map((p) => p.identityKey)).toEqual(['ean:5901234123457']);
  });

  it('never shows a made-up name for something the catalogue does not know', () => {
    const unknown = product({ acceptance: 'needs_resolution', label: 'ean:5901234123457' });
    expect(reviewLabel(unknown)).not.toContain('5901234123457');
    expect(reviewLabel(product({}))).toBe('OREO Original 154 g');
  });
});
