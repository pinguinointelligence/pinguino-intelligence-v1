/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MILK_FAT_BANDS, milkBandCandidateIds, milkFatLevelFromName } from './productMilkFatBand';

describe('milkFatLevelFromName', () => {
  it('maps Spanish/English milk fat-level words', () => {
    expect(milkFatLevelFromName('Leche entera Hacendado brick 1L')).toBe('whole');
    expect(milkFatLevelFromName('Leche semidesnatada Hacendado brick 1L')).toBe('semi');
    expect(milkFatLevelFromName('Leche desnatada Hacendado brick 1L')).toBe('skim');
    expect(milkFatLevelFromName('Whole Milk')).toBe('whole');
    expect(milkFatLevelFromName('Semi-skimmed milk')).toBe('semi');
    expect(milkFatLevelFromName('Skimmed Milk')).toBe('skim');
  });

  it('returns null for lactose-free milks (sugar composition differs — never band)', () => {
    expect(milkFatLevelFromName('Leche semidesnatada sin lactosa Hacendado brick')).toBeNull();
    expect(milkFatLevelFromName('Leche entera sin lactosa Hacendado brick')).toBeNull();
    expect(milkFatLevelFromName('Lactose Free Whole Milk')).toBeNull();
  });

  it('returns null for protein-fortified milks (red-flag territory)', () => {
    expect(milkFatLevelFromName('Leche desnatada +Proteínas & calcio Hacendado brick')).toBeNull();
  });

  it('returns null for non-milk names, even with a fat-level word', () => {
    expect(milkFatLevelFromName('Yogur desnatado natural')).toBeNull(); // no milk token
    expect(milkFatLevelFromName('Nata entera')).toBeNull();
    expect(milkFatLevelFromName('Leche condensada')).toBeNull(); // milk but no fat-level word
  });
});

describe('milkBandCandidateIds — false-positive avoidance', () => {
  const refs = [
    { id: 'M35', name: 'Milk 3,5% — Standard', fat: 3.5 },
    { id: 'M32', name: 'Milk 3,2% — Standard', fat: 3.2 },
    { id: 'M20', name: 'Fresh Pasteurized Milk 2% — Standard', fat: 2 },
    { id: 'M15', name: 'Milk 1.5 % — Standard', fat: 1.6 },
    { id: 'BUTTER', name: 'Buttermilk — Standard', fat: 0.5 }, // no bare milk token → never banded
    { id: 'YOG', name: 'Natural Yogurt — Standard', fat: 3 },
    { id: 'POWDER', name: 'Skimmed Milk Powder — Standard', fat: 0.8 }, // milk-named but fat out of skim band
  ];

  it('entera bands only the whole-milk refs (never semi/skim)', () => {
    expect(milkBandCandidateIds('Leche entera Hacendado', refs)).toEqual(['M35', 'M32']);
  });

  it('semidesnatada bands only the 1.0–1.8 refs (a 2.0 ref is NOT semi; entera never matches)', () => {
    expect(milkBandCandidateIds('Leche semidesnatada Hacendado', refs)).toEqual(['M15']);
  });

  it('desnatada finds NO liquid-milk ref (a reference gap — empty, never an out-of-band narrow)', () => {
    // buttermilk (no milk token) and the 0.8-fat powder are correctly not skim candidates
    expect(milkBandCandidateIds('Leche desnatada Hacendado', refs)).toEqual([]);
  });

  it('returns null (not applicable) for lactose-free / fortified / non-milk products', () => {
    expect(milkBandCandidateIds('Leche entera sin lactosa', refs)).toBeNull();
    expect(milkBandCandidateIds('Leche desnatada +Proteínas', refs)).toBeNull();
    expect(milkBandCandidateIds('Yogur griego natural', refs)).toBeNull();
  });

  it('bands never overlap', () => {
    expect(MILK_FAT_BANDS.skim.max).toBeLessThan(MILK_FAT_BANDS.semi.min);
    expect(MILK_FAT_BANDS.semi.max).toBeLessThan(MILK_FAT_BANDS.whole.min);
  });
});

describe('productMilkFatBand — purity (static scan)', () => {
  it('no DB / service / npac / coercion of unknowns', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'productMilkFatBand.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/supabase|@\/services\//i.test(src)).toBe(false);
    expect(/npac_value/i.test(src)).toBe(false);
    expect(/\?\?\s*0\b/.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
