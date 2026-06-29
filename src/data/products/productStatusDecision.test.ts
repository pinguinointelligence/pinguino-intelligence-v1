/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideProductStatus, formatProductStatusLabel } from './productStatusDecision';

const cream = { ingredient_id: 'PI-ING-000180', ingredient_name_display: 'Cream 30% UHT', pac_value: 3.668, pod_value: 0.512 };

describe('formatProductStatusLabel', () => {
  it('maps lifecycle statuses to clean customer labels (no "Mapper", no percentages)', () => {
    expect(formatProductStatusLabel('pi_generated')).toBe('PI Generated');
    expect(formatProductStatusLabel('pi_calculated')).toBe('PI Calculated');
    expect(formatProductStatusLabel('manual_adjusted')).toBe('Manual Adjusted');
    expect(formatProductStatusLabel('pi_verified')).toBe('PI Verified');
  });
  it('keeps internal-only statuses hidden from customers (null)', () => {
    expect(formatProductStatusLabel('draft')).toBeNull();
    expect(formatProductStatusLabel('rejected')).toBeNull();
  });
});

describe('decideProductStatus — matched, reference-linked, no red flags', () => {
  it('a clean matched product with reference-linked pac/pod → PI Generated, not PI Verified', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Nata para montar Hacendado',
      reference: cream,
    });
    expect(d.recommended_status).toBe('pi_generated');
    expect(d.customer_label).toBe('PI Generated');
    expect(d.customer_warning_flags.join(' ')).toMatch(/not an independent measurement/i);
    expect(d.blockers.join(' ')).toMatch(/PI Verified needs independent/i);
  });
});

describe('decideProductStatus — red flags block PI Verified / PI Calculated', () => {
  it('a sweetener/polyol product is at most PI Generated, with red-flag blockers (internal)', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Chocolate con leche 0% azúcares añadidos maltitol',
      reference: cream,
    });
    expect(d.recommended_status).not.toBe('pi_verified');
    expect(d.recommended_status).not.toBe('pi_calculated');
    expect(d.recommended_status).toBe('pi_generated');
    expect(d.internal_flags).toContain('sweetener_or_polyol');
    expect(d.blockers.join(' ')).toMatch(/red flags block PI Verified/i);
    // internal red-flag codes never leak into the customer warnings
    expect(d.customer_warning_flags.join(' ')).not.toMatch(/sweetener_or_polyol/);
  });

  it('a reviewer approval CANNOT promote a red-flag product to PI Verified', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Batido +Proteínas chocolate',
      reference: cream,
      reviewerApproval: { verified_by: 'colin', basis: 'looks fine' },
    });
    expect(d.recommended_status).not.toBe('pi_verified');
    expect(d.internal_flags).toContain('protein_fortified');
  });
});

describe('decideProductStatus — PI Verified only with strong data / explicit approval', () => {
  it('reviewer approval + no red flags → PI Verified (manual-approval path)', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Nata para montar Hacendado',
      reference: cream,
      reviewerApproval: { verified_by: 'colin', basis: 'producer technical sheet' },
    });
    expect(d.recommended_status).toBe('pi_verified');
    expect(d.customer_label).toBe('PI Verified');
  });

  it("a product with its OWN measured pac/pod and no red flags → PI Calculated", () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Lab-measured cream',
      pac_value: 5,
      pod_value: 5,
      reference: cream,
    });
    expect(d.recommended_status).toBe('pi_calculated');
    expect(d.customer_label).toBe('PI Calculated');
    expect(d.customer_warning_flags.join(' ')).not.toMatch(/not an independent measurement/i);
  });
});

describe('decideProductStatus — manual adjustment + non-matched states', () => {
  it('manuallyAdjusted reference-linked product → Manual Adjusted', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'Nata',
      reference: cream,
      manuallyAdjusted: true,
    });
    expect(d.recommended_status).toBe('manual_adjusted');
    expect(d.customer_label).toBe('Manual Adjusted');
  });

  it('rejected mapping → rejected (internal, no customer label)', () => {
    const d = decideProductStatus({ mapper_status: 'rejected', product_name_display: 'X' });
    expect(d.recommended_status).toBe('rejected');
    expect(d.customer_label).toBeNull();
  });

  it('null / needs_review mapping → draft (internal), with a not-matched blocker', () => {
    for (const s of [null, 'needs_review', 'ambiguous']) {
      const d = decideProductStatus({ mapper_status: s, product_name_display: 'X' });
      expect(d.recommended_status, String(s)).toBe('draft');
      expect(d.customer_label).toBeNull();
      expect(d.blockers.join(' ')).toMatch(/confirmed match/i);
    }
  });

  it('matched but the reference lacks pac/pod → draft (not resolvable)', () => {
    const d = decideProductStatus({
      mapper_status: 'matched',
      matched_basement_id: 'PI-ING-000180',
      product_name_display: 'X',
      reference: { ingredient_id: 'PI-ING-000180', pac_value: null, pod_value: null },
    });
    expect(d.recommended_status).toBe('draft');
    expect(d.blockers.join(' ')).toMatch(/lacks pac\/pod/i);
  });
});

describe('decideProductStatus — never emits the basement-only "Verified" label, no leaks', () => {
  it('no product path yields the reference-only "Verified" customer label', () => {
    const inputs = [
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_name_display: 'a', reference: cream },
      { mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', product_name_display: 'a', reference: cream, reviewerApproval: { verified_by: 'c', basis: 'b' } },
      { mapper_status: 'rejected', product_name_display: 'a' },
      { mapper_status: null, product_name_display: 'a' },
    ];
    for (const i of inputs) {
      expect(decideProductStatus(i).customer_label).not.toBe('Verified');
    }
  });
});

describe('productStatusDecision — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productStatusDecision.ts'), 'utf8'));

  it('is pure: no Supabase / service / engine / DB write, no npac_value', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/@\/engine/.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
