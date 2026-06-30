/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OffProduct } from './openFoodFactsAdapter';
import {
  ENRICHABLE_FIELDS,
  buildEnrichmentPatch,
  compareEnrichment,
  safeFillFields,
  type EnrichmentTarget,
} from './productEnrichment';

const off = (over: Partial<OffProduct> = {}): OffProduct => ({
  found: true, ean: '3017620422003', name: 'Nutella', ingredients_text: null,
  nutrition: { fat_percent: 30.9, saturated_fat_percent: 10.6, carbohydrate_percent: 57.5, total_sugars_percent: 56.3, protein_percent: 6.3, salt_percent: 0.107, kcal_per_100g: 539 },
  source: 'public_composition_db', ...over,
});

describe('compareEnrichment', () => {
  it('not found → found:false, no fields', () => {
    const c = compareEnrichment({}, off({ found: false }));
    expect(c.found).toBe(false);
    expect(c.fields).toHaveLength(0);
    expect(c.fill_count).toBe(0);
  });

  it('all stored null → every field is a safe fill', () => {
    const c = compareEnrichment({}, off());
    expect(c.found).toBe(true);
    expect(c.fill_count).toBe(ENRICHABLE_FIELDS.length);
    expect(c.conflict_count).toBe(0);
    expect(c.fields.every((f) => f.decision === 'fill' && f.safe)).toBe(true);
    expect(c.source).toBe('public_composition_db');
  });

  it('stored equals incoming within tolerance → agree (no change, not a conflict)', () => {
    const stored: EnrichmentTarget = { fat_percent: 30.7, total_sugars_percent: 56.3, salt_percent: 0.1, kcal_per_100g: 540 };
    const c = compareEnrichment(stored, off());
    expect(c.fields.find((f) => f.field === 'fat_percent')?.decision).toBe('agree');
    expect(c.fields.find((f) => f.field === 'total_sugars_percent')?.decision).toBe('agree');
    expect(c.fields.find((f) => f.field === 'salt_percent')?.decision).toBe('agree');
    expect(c.fields.find((f) => f.field === 'kcal_per_100g')?.decision).toBe('agree');
  });

  it('stored differs beyond tolerance → conflict (not safe)', () => {
    const stored: EnrichmentTarget = { fat_percent: 12 }; // OFF says 30.9
    const c = compareEnrichment(stored, off());
    const fat = c.fields.find((f) => f.field === 'fat_percent')!;
    expect(fat.decision).toBe('conflict');
    expect(fat.safe).toBe(false);
    expect(c.conflict_count).toBeGreaterThanOrEqual(1);
  });

  it('coerces DB numeric strings, and a null incoming → skip', () => {
    const stored: EnrichmentTarget = { fat_percent: '30.8' }; // string from PostgREST
    const c = compareEnrichment(stored, off({ nutrition: { ...off().nutrition, protein_percent: null } }));
    expect(c.fields.find((f) => f.field === 'fat_percent')?.decision).toBe('agree');
    expect(c.fields.find((f) => f.field === 'protein_percent')?.decision).toBe('skip');
  });
});

describe('buildEnrichmentPatch / safeFillFields', () => {
  it('safeFillFields returns only the gap (fill) fields', () => {
    const c = compareEnrichment({ fat_percent: 30.8 }, off());
    expect(safeFillFields(c)).not.toContain('fat_percent'); // fat agrees → not a fill
    expect(safeFillFields(c)).toContain('protein_percent');
  });

  it('builds a patch only from selected fields with a real incoming value', () => {
    const c = compareEnrichment({}, off({ nutrition: { ...off().nutrition, salt_percent: null } }));
    const patch = buildEnrichmentPatch(c, ['fat_percent', 'salt_percent', 'protein_percent']);
    expect(patch.fat_percent).toBe(30.9);
    expect(patch.protein_percent).toBe(6.3);
    expect(patch).not.toHaveProperty('salt_percent'); // incoming null → excluded
    // the patch can only ever carry enrichable keys
    expect(Object.keys(patch).every((k) => (ENRICHABLE_FIELDS as readonly string[]).includes(k))).toBe(true);
    expect(patch).not.toHaveProperty('pac_value');
    expect(patch).not.toHaveProperty('pod_value');
  });
});

describe('productEnrichment — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productEnrichment.ts'), 'utf8'));

  it('no Supabase / service / DB write / npac, and never writes pac/pod', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
    expect(/pac_value\s*[:=]/.test(MOD)).toBe(false);
    expect(/pod_value\s*[:=]/.test(MOD)).toBe(false);
  });
});
