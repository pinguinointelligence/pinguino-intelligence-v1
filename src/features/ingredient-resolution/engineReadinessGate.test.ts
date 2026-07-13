import { describe, expect, it } from 'vitest';
import { evaluateProductReadiness } from './engineReadinessGate';
import { NOT_ENGINE_READY_MESSAGE } from './contracts';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';

const ref = (over: Partial<ReferenceEngineValues> = {}): ReferenceEngineValues => ({
  ingredient_id: 'ING-1',
  ingredient_name_display: 'Ref',
  pac_value: 30,
  pod_value: 20,
  ...over,
});

describe('evaluateProductReadiness — engine-readiness gate', () => {
  it('a confirmed match with a reference-supplied pac/pod is ready-for-exact', () => {
    const r = evaluateProductReadiness(
      { product_name_display: 'Ciemna czekolada', mapper_status: 'matched', matched_basement_id: 'ING-1', pac_value: null, pod_value: null },
      ref(),
    );
    expect(r.readyForExact).toBe(true);
    expect(r.pac_value).toBe(30);
    expect(r.pod_value).toBe(20);
    expect(r.provenance).toBe('reference_linked');
    expect(r.not_independently_measured).toBe(true);
    expect(r.message).toBeNull();
  });

  it("own-measured pac/pod win and are ready without a reference", () => {
    const r = evaluateProductReadiness(
      { product_name_display: 'Produkt', mapper_status: 'matched', matched_basement_id: null, pac_value: 26, pod_value: 18 },
      null,
    );
    expect(r.readyForExact).toBe(true);
    expect(r.provenance).toBe('product_measured');
    expect(r.not_independently_measured).toBe(false);
  });

  it('a needs-review product (no confirmed match) is NOT ready and shows the honest message', () => {
    const r = evaluateProductReadiness(
      { product_name_display: 'Whisky', mapper_status: 'needs_review', matched_basement_id: null, pac_value: null, pod_value: null },
      null,
    );
    expect(r.readyForExact).toBe(false);
    expect(r.pac_value).toBeNull();
    expect(r.message).toBe(NOT_ENGINE_READY_MESSAGE);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('a matched product whose reference lacks pac/pod is NOT ready (never invents a number)', () => {
    const r = evaluateProductReadiness(
      { product_name_display: 'Whisky', mapper_status: 'matched', matched_basement_id: 'ING-1', pac_value: null, pod_value: null },
      ref({ pac_value: null, pod_value: null }),
    );
    expect(r.readyForExact).toBe(false);
    expect(r.pac_value).toBeNull();
    expect(r.pod_value).toBeNull();
    expect(r.message).toBe(NOT_ENGINE_READY_MESSAGE);
  });

  it('a red-flagged product (polyol) stays NOT ready even with resolvable engine values', () => {
    const r = evaluateProductReadiness(
      {
        product_name_display: 'Syrop bez cukru',
        mapper_status: 'matched',
        matched_basement_id: 'ING-1',
        pac_value: null,
        pod_value: null,
        detected_text: 'bez cukru, zawiera maltitol',
      },
      ref(),
    );
    expect(r.readyForExact).toBe(false);
    expect(r.message).toBe(NOT_ENGINE_READY_MESSAGE);
    expect(r.decision.red_flags.length).toBeGreaterThan(0);
  });

  it('never recommends PI Verified for a reference-linked product (no auto-verify)', () => {
    const r = evaluateProductReadiness(
      { product_name_display: 'Czekolada', mapper_status: 'matched', matched_basement_id: 'ING-1', pac_value: null, pod_value: null },
      ref(),
    );
    expect(r.decision.recommended_status).not.toBe('pi_verified');
  });
});
