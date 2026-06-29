/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blocksAutoVerify, detectRedFlags, type RedFlagCode } from './productRedFlags';

const codes = (over: Parameters<typeof detectRedFlags>[0]): RedFlagCode[] =>
  detectRedFlags(over).map((f) => f.code);

describe('detectRedFlags — sweeteners & polyols', () => {
  it('flags each listed polyol / high-intensity sweetener (accent + case insensitive)', () => {
    for (const kw of ['maltitol', 'Eritritol', 'sorbitol', 'xilitol', 'SUCRALOSA', 'stevia', 'esteviol', 'aspartamo', 'acesulfamo K', 'sacarina', 'ciclamato', 'edulcorante']) {
      expect(codes({ product_name_display: `Producto con ${kw}` }), kw).toContain('sweetener_or_polyol');
    }
  });

  it('flags a real "Edulcorante Eritritol y Sucralosa" product', () => {
    expect(codes({ product_name_display: 'Edulcorante Eritritol y Sucralosa Hacendado bote' })).toContain('sweetener_or_polyol');
  });

  it('flags a structural polyol_percent > 0 even with no keyword', () => {
    const flags = detectRedFlags({ product_name_display: 'Mystery bar', polyol_percent: 12 });
    expect(flags.map((f) => f.code)).toContain('sweetener_or_polyol');
    expect(flags.find((f) => f.code === 'sweetener_or_polyol')?.evidence).toMatch(/polyol_percent/);
  });
});

describe('detectRedFlags — sugar-free claims & conflicts', () => {
  it('flags a "0% azúcares añadidos" claim (accent-insensitive)', () => {
    expect(codes({ product_name_display: 'Chocolate con leche 0% azúcares añadidos' })).toContain('sugar_free_claim');
  });

  it('flags a strong "sin azúcar" claim AND a claim/composition conflict when sugars are high', () => {
    const c = codes({ product_name_display: 'Mermelada sin azúcar', total_sugars_percent: 30 });
    expect(c).toContain('sugar_free_claim');
    expect(c).toContain('claim_composition_conflict');
  });

  it('a "sin azúcares añadidos" product with natural sugars is flagged as a claim but NOT a conflict', () => {
    const c = codes({ product_name_display: 'Yogur sin azúcares añadidos', total_sugars_percent: 5 });
    expect(c).toContain('sugar_free_claim');
    expect(c).not.toContain('claim_composition_conflict');
  });
});

describe('detectRedFlags — protein, proprietary, incomplete text', () => {
  it('flags a "+Proteínas" product (accent-insensitive)', () => {
    expect(codes({ product_name_display: 'Batido lácteo sabor chocolate +Proteínas' })).toContain('protein_fortified');
  });

  it('flags a flavouring / aroma as a proprietary blend', () => {
    expect(codes({ product_name_display: 'Aroma de vainilla' })).toContain('proprietary_blend');
  });

  it('flags truncated detected_text and a scan source with no text', () => {
    expect(codes({ product_name_display: 'X', detected_text: 'leche, azúcar, …' })).toContain('incomplete_text');
    expect(codes({ product_name_display: 'X', source_type: 'label_scan', detected_text: '' })).toContain('incomplete_text');
  });
});

describe('detectRedFlags — clean products & gate', () => {
  it('a plain cream has NO flags and does not block auto-verify', () => {
    const flags = detectRedFlags({ product_name_display: 'Nata para montar Hacendado brick', detected_text: 'nata de vaca, estabilizante' });
    expect(flags).toEqual([]);
    expect(blocksAutoVerify(flags)).toBe(false);
  });

  it('any flag blocks auto-verify', () => {
    expect(blocksAutoVerify(detectRedFlags({ product_name_display: 'Helado con maltitol' }))).toBe(true);
  });
});

describe('productRedFlags — purity (static scan)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MOD = stripComments(readFileSync(join(SRC, 'data', 'products', 'productRedFlags.ts'), 'utf8'));

  it('is pure: no Supabase / service / engine / DB write', () => {
    expect(/supabase/i.test(MOD)).toBe(false);
    expect(/@\/services\//.test(MOD)).toBe(false);
    expect(/@\/engine/.test(MOD)).toBe(false);
    expect(/npac_value/i.test(MOD)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MOD.includes(verb), verb).toBe(false);
    }
  });
});
