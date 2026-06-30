/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERENCE_PROPOSALS, proposalUnlockedProducts } from './referenceProposals';

describe('referenceProposals', () => {
  it('covers the six missing-reference families', () => {
    expect(REFERENCE_PROPOSALS.map((p) => p.key)).toEqual([
      'almond', 'erythritol', 'maltitol_polyols', 'steviol_stevia', 'sucralose', 'saccharin',
    ]);
  });

  it('every proposal needs team pac/pod calibration and is NOT insert-ready', () => {
    for (const p of REFERENCE_PROPOSALS) {
      expect(p.needs_pacpod_calibration, p.key).toBe(true);
      expect(p.readiness, p.key).not.toBe('ready');
      expect(p.missing_fields.some((f) => /pac_value/.test(f)), p.key).toBe(true);
      expect(p.missing_fields.some((f) => /pod_value/.test(f)), p.key).toBe(true);
      expect(p.do_not_insert_reason.length, p.key).toBeGreaterThan(0);
      // never carries an actual engine pac/pod value
      expect(p.known_composition).not.toHaveProperty('pac_value');
      expect(p.known_composition).not.toHaveProperty('pod_value');
    }
  });

  it('uses schema-valid basement categories (never the invalid nut_paste)', () => {
    const valid = new Set(['dairy', 'sugar', 'fat', 'stabilizer', 'emulsifier', 'fruit', 'chocolate', 'nut', 'alcohol', 'water', 'flavor', 'salt', 'other']);
    for (const p of REFERENCE_PROPOSALS) expect(valid.has(p.category), `${p.key}:${p.category}`).toBe(true);
  });

  it('unlocks real PR product codes', () => {
    const unlocked = proposalUnlockedProducts();
    expect(unlocked).toContain('PR-ING-000040'); // almond
    expect(unlocked).toContain('PR-ING-000060'); // erythritol+sucralose
    expect(unlocked.every((c) => /^PR-ING-\d{6}$/.test(c))).toBe(true);
  });
});

describe('referenceProposals — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = strip(readFileSync(join(SRC, 'data', 'products', 'referenceProposals.ts'), 'utf8'));

  it('no DB / service / write / npac, and never a numeric pac/pod literal', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
    // pac_value/pod_value appear only as STRINGS in missing_fields, never as a numeric assignment
    expect(/pac_value\s*:\s*[\d.]/.test(MOD)).toBe(false);
    expect(/pod_value\s*:\s*[\d.]/.test(MOD)).toBe(false);
  });
});
