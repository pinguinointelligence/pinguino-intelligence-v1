/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreProductConfidence } from './productConfidence';

const cream = { ingredient_id: 'PI-ING-000180', pac_value: 3.668, pod_value: 0.512 };

describe('scoreProductConfidence — drivers', () => {
  it('a rich, own-measured, low-distance milk-like profile scores high and does not block', () => {
    const s = scoreProductConfidence({
      brand: 'Hacendado',
      product_name_display: 'Leche entera UHT',
      ean_code: '8402001002083',
      product_category: 'dairy',
      fat_percent: 3.6, saturated_fat_percent: 2.4, milk_fat_percent: 3.6,
      carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.1, salt_percent: 0.1,
      detected_text: 'Leche entera UHT de vaca, pasteurizada',
      lactose_percent: 4.7,
      match_confidence: 'high', mapper_status: 'matched',
      pac_value: 5, pod_value: 5, // own measured
      source_type: 'mercadona',
    });
    expect(s.blocks_auto_verify).toBe(false);
    expect(s.pac_pod_confidence).toBe(1);
    expect(s.overall_confidence_score).toBeGreaterThan(0.6);
    expect(s.internal_only).toBe(true);
  });

  it('a sweetener product blocks auto-verify and carries a risk penalty', () => {
    const s = scoreProductConfidence({
      product_name_display: 'Edulcorante Eritritol y Sucralosa',
      product_category: 'sugar',
      total_sugars_percent: 0,
      mapper_status: 'matched', match_confidence: 'medium',
    });
    expect(s.blocks_auto_verify).toBe(true);
    expect(s.risk_penalty).toBeGreaterThan(0);
  });

  it('missing pac/pod (unresolved) lowers the score vs reference-linked vs own-measured', () => {
    const base = {
      product_name_display: 'Nata', product_category: 'dairy', fat_percent: 35, carbohydrate_percent: 3, total_sugars_percent: 3, protein_percent: 2, salt_percent: 0.1,
      mapper_status: 'matched', matched_basement_id: 'PI-ING-000180', match_confidence: 'high', source_type: 'mercadona',
    } as const;
    const unresolved = scoreProductConfidence({ ...base, reference: null });
    const referenceLinked = scoreProductConfidence({ ...base, reference: cream });
    const ownMeasured = scoreProductConfidence({ ...base, pac_value: 3.6, pod_value: 0.5, reference: cream });
    expect(unresolved.pac_pod_confidence).toBe(0);
    expect(referenceLinked.pac_pod_confidence).toBe(0.5);
    expect(ownMeasured.pac_pod_confidence).toBe(1);
    expect(referenceLinked.overall_confidence_score).toBeGreaterThan(unresolved.overall_confidence_score);
    expect(ownMeasured.overall_confidence_score).toBeGreaterThanOrEqual(referenceLinked.overall_confidence_score);
    // reference-linked is explicitly NOT independently verified
    expect(referenceLinked.notes.join(' ')).toMatch(/reference-linked, not independently/i);
  });

  it('unknown data scores low, never fake-high (empty input)', () => {
    const s = scoreProductConfidence({});
    expect(s.overall_confidence_score).toBeLessThan(0.3);
    expect(s.nutrition_confidence).toBe(0);
    expect(s.pac_pod_confidence).toBe(0);
  });

  it('marks every score internal_only (never a customer-facing percentage)', () => {
    expect(scoreProductConfidence({ product_name_display: 'x' }).internal_only).toBe(true);
  });
});

describe('productConfidence — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productConfidence.ts'), 'utf8'));

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
