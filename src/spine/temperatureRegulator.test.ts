/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TEMPERATURE_REGULATOR_CONFIG_VERSION,
  TEMPERATURE_REGULATOR_GOLDEN_FIXTURES,
  findTemperatureRegulatorFixture,
  getTemperatureRegulatorSettings,
  getTemperatureRegulatorSettingsOrNull,
  isMetricInBand,
  listTemperatureRegulatorSettings,
} from './temperatureRegulator';
import type { ProductProfile, ServingTemperatureC } from './types';

const PROFILES: readonly ProductProfile[] = ['standard_gelato', 'sorbet', 'vegan_gelato', 'chocolate_gelato'];
const TEMPS: readonly ServingTemperatureC[] = [-11, -12, -13];

const deepLeaves = (value: unknown): unknown[] =>
  value !== null && typeof value === 'object'
    ? Object.values(value as Record<string, unknown>).flatMap(deepLeaves)
    : [value];

const deepKeys = (value: unknown): string[] =>
  value !== null && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...deepKeys(v)])
    : [];

describe('Temperature Regulator config — registry shape', () => {
  it('contains exactly 12 settings: 4 profiles × 3 temperatures, nothing else', () => {
    const all = listTemperatureRegulatorSettings();
    expect(all).toHaveLength(12);
    for (const profile of PROFILES) {
      const temps = all.filter((s) => s.productProfile === profile).map((s) => s.servingTemperatureC);
      expect([...temps].sort((a, b) => b - a)).toEqual([-11, -12, -13]);
    }
    expect(new Set(all.map((s) => s.productProfile)).size).toBe(4);
  });

  it('contains no granita/protein/fresh/storage profile', () => {
    const profiles = new Set<string>(listTemperatureRegulatorSettings().map((s) => s.productProfile));
    for (const unsupported of ['granita', 'protein_gelato', 'protein', 'fresh', 'storage_minus18']) {
      expect(profiles.has(unsupported)).toBe(false);
    }
  });

  it('every setting carries configVersion 0.1.0, its identity fields, notes and required stabilizer', () => {
    for (const s of listTemperatureRegulatorSettings()) {
      const id = `${s.productProfile}@${s.servingTemperatureC}`;
      expect(s.configVersion, id).toBe(TEMPERATURE_REGULATOR_CONFIG_VERSION);
      expect(s.configVersion, id).toBe('0.1.0');
      expect(PROFILES, id).toContain(s.productProfile);
      expect(TEMPS, id).toContain(s.servingTemperatureC);
      expect(s.notes.length, id).toBeGreaterThan(0);
      expect(s.stabilizer, id).toEqual({ required: true });
    }
  });
});

describe('Temperature Regulator config — lookup (no fallback, ever)', () => {
  it('returns settings for every supported product × temperature pair', () => {
    for (const profile of PROFILES) {
      for (const temp of TEMPS) {
        const settings = getTemperatureRegulatorSettings(profile, temp);
        expect(settings.productProfile).toBe(profile);
        expect(settings.servingTemperatureC).toBe(temp);
        expect(getTemperatureRegulatorSettingsOrNull(profile, temp)).toBe(settings);
      }
    }
  });

  it('unsupported product returns null — never another product', () => {
    for (const bad of ['granita', 'protein_gelato', 'fresh', 'storage_minus18', 'gelato', '']) {
      expect(getTemperatureRegulatorSettingsOrNull(bad, -12), bad).toBeNull();
    }
  });

  it('unsupported temperature returns null — never another temperature', () => {
    for (const bad of [-18, -14, -10, 0, 11, Number.NaN]) {
      expect(getTemperatureRegulatorSettingsOrNull('standard_gelato', bad), String(bad)).toBeNull();
    }
  });
});

describe('Temperature Regulator config — Standard Gelato (locked doc values)', () => {
  it('−11 °C is the zero-delta base reference and keeps dairy gates as targets', () => {
    const s = getTemperatureRegulatorSettings('standard_gelato', -11);
    expect(s.status).toBe('locked_base_reference_zero_delta');
    expect(s.lactose?.band).toEqual([4, 6]);
    expect(s.lactoseSanding?.band).toEqual([5, 9]);
    expect(s.proteinShareInSolids?.band).toEqual([9, 13]);
    expect(s.disabledGates).toEqual([]);
    expect(s.npac?.band).toEqual([33, 43]);
    expect(s.npac?.cleanCenter).toEqual([39, 41]);
    expect(s.iceFraction?.band).toEqual([45, 54.5]);
  });

  it('−12 °C carries G17/G15 values exactly', () => {
    const s = getTemperatureRegulatorSettings('standard_gelato', -12);
    expect(s.status).toBe('locked_v0_1');
    expect(s.npac).toMatchObject({
      band: [42, 50],
      cleanCenter: [45.0, 46.2],
      lockedReference: 46.18,
      lowerCleanAnchor: 44.98,
      overlapPrevious: [42, 43],
      overlapNext: [48, 50],
    });
    expect(s.iceFraction?.lockedReference).toBe(50.34);
    expect(s.pod?.lockedReference).toBe(15.57);
    expect(s.solids?.band).toEqual([31, 44]);
    expect(s.water?.lockedReference).toBe(63.18);
  });

  it('−13 °C carries G18/G11 values exactly', () => {
    const s = getTemperatureRegulatorSettings('standard_gelato', -13);
    expect(s.npac).toMatchObject({
      band: [48, 55],
      cleanCenter: [51.5, 53.2],
      lockedReference: 53.15,
      lowerCleanAnchor: 51.77,
    });
    expect(s.iceFraction?.band).toEqual([46, 52]);
    expect(s.pod?.lockedReference).toBe(16.37);
    expect(s.solids?.band).toEqual([35, 45]);
  });

  it('G12 fixture matches the doc formula and outputs exactly', () => {
    const g12 = findTemperatureRegulatorFixture('G12');
    expect(g12?.purpose).toBe('clean_anchor');
    expect(g12?.servingTemperatureC).toBe(-11);
    expect(g12?.formulaG).toEqual([
      { ingredient: 'milk 3.5%', grams: 610 },
      { ingredient: 'cream 30%', grams: 135 },
      { ingredient: 'skimmed milk powder', grams: 45 },
      { ingredient: 'sucrose', grams: 115 },
      { ingredient: 'dextrose', grams: 40 },
      { ingredient: 'inulin', grams: 53.1 },
      { ingredient: 'tara gum', grams: 1.9 },
    ]);
    expect(g12?.expected).toEqual({
      pod: 15.65,
      npac: 39.59,
      iceFraction: 51.09,
      lactose: 5.59,
      lactoseSanding: 8.77,
      fat: 6.22,
      aeratingProtein: 3.75,
      proteinShareInSolids: 10.34,
      solids: 36.23,
      water: 63.77,
      costPerKg: 6.8,
      costPer80g: 0.54,
    });
  });

  it('G17 fixture matches the doc exactly', () => {
    const g17 = findTemperatureRegulatorFixture('G17');
    expect(g17?.servingTemperatureC).toBe(-12);
    expect(g17?.expected).toEqual({
      pod: 15.57,
      npac: 46.18,
      iceFraction: 50.34,
      lactose: 5.44,
      lactoseSanding: 8.62,
      fat: 6.19,
      aeratingProtein: 3.65,
      proteinShareInSolids: 9.9,
      solids: 36.82,
      water: 63.18,
      costPerKg: 6.86,
      costPer80g: 0.55,
    });
  });

  it('G18 fixture matches the doc exactly', () => {
    const g18 = findTemperatureRegulatorFixture('G18');
    expect(g18?.servingTemperatureC).toBe(-13);
    expect(g18?.expected).toEqual({
      pod: 16.37,
      npac: 53.15,
      iceFraction: 49.69,
      lactose: 5.51,
      lactoseSanding: 8.78,
      fat: 5.89,
      aeratingProtein: 3.69,
      proteinShareInSolids: 9.93,
      solids: 37.22,
      water: 62.78,
      costPerKg: 5.81,
      costPer80g: 0.46,
    });
  });

  it('G15 and G11 are metrics-only lower anchors — no invented formulas', () => {
    for (const id of ['G15', 'G11']) {
      const fixture = findTemperatureRegulatorFixture(id);
      expect(fixture?.purpose, id).toBe('lower_anchor');
      expect(fixture?.formulaG, id).toEqual([]);
      expect(fixture?.notes.join(' '), id).toMatch(/metrics only/);
    }
    expect(findTemperatureRegulatorFixture('G15')?.expected.npac).toBe(44.98);
    expect(findTemperatureRegulatorFixture('G11')?.expected.npac).toBe(51.77);
  });
});

describe('Temperature Regulator config — Sorbet (locked doc values)', () => {
  it('disables the dairy gates and never carries lactose targets', () => {
    for (const temp of TEMPS) {
      const s = getTemperatureRegulatorSettings('sorbet', temp);
      for (const gate of [
        'dairy_fat_logic',
        'lactose',
        'lactose_sanding',
        'aerating_dairy_protein',
        'dairy_protein_share_in_solids',
        'msnf_required_gate',
      ]) {
        expect(s.disabledGates, `${temp}:${gate}`).toContain(gate);
      }
      expect(s.lactose, String(temp)).toBeUndefined();
      expect(s.lactoseSanding, String(temp)).toBeUndefined();
    }
  });

  it('carries the locked NPAC map: S01 37.71 / S02 44.18 / S03 52.22', () => {
    expect(getTemperatureRegulatorSettings('sorbet', -11).npac?.lockedReference).toBe(37.71);
    expect(getTemperatureRegulatorSettings('sorbet', -12).npac?.lockedReference).toBe(44.18);
    expect(getTemperatureRegulatorSettings('sorbet', -13).npac?.lockedReference).toBe(52.22);
    expect(getTemperatureRegulatorSettings('sorbet', -11).npac?.cleanCenter).toEqual([37, 38]);
    expect(getTemperatureRegulatorSettings('sorbet', -13).npac?.band).toEqual([48, 55]);
  });

  it('S02 fixture matches the doc exactly', () => {
    const s02 = findTemperatureRegulatorFixture('S02');
    expect(s02?.purpose).toBe('clean_anchor');
    expect(s02?.formulaG).toEqual([
      { ingredient: 'sucrose', grams: 90 },
      { ingredient: 'dextrose', grams: 90 },
      { ingredient: 'inulin', grams: 55 },
      { ingredient: 'tara gum', grams: 0.8 },
      { ingredient: 'water', grams: 164.2 },
      { ingredient: 'strawberries', grams: 600 },
    ]);
    expect(s02?.expected).toEqual({
      pod: 19.97,
      npac: 44.18,
      iceFraction: 55.95,
      solids: 29.29,
      water: 70.71,
      costPerKg: 8.14,
      costPer80g: 0.65,
    });
  });

  it('S01 and S03 fixtures exist with the locked reference outputs', () => {
    expect(findTemperatureRegulatorFixture('S01')?.expected.npac).toBe(37.71);
    expect(findTemperatureRegulatorFixture('S03')?.expected.npac).toBe(52.22);
    expect(findTemperatureRegulatorFixture('S01')?.expected.costPerKg).toBe(8.19);
    expect(findTemperatureRegulatorFixture('S03')?.expected.costPerKg).toBe(7.63);
  });

  it('S04 mango is fruit-specific validation evidence, not a clean anchor, with no invented temperature', () => {
    const s04 = findTemperatureRegulatorFixture('S04');
    expect(s04?.purpose).toBe('fruit_specific_validation');
    expect(s04?.servingTemperatureC).toBeNull();
    expect(s04?.notes.join(' ')).toMatch(/NOT a clean locked mango reference/);
    expect(s04?.expected.npac).toBe(52.55);
    expect(s04?.formulaG.find((l) => l.ingredient === '100% mango pulp')?.grams).toBe(500);
  });
});

describe('Temperature Regulator config — Vegan Gelato (locked doc values)', () => {
  it('disables the dairy-only gates at every temperature', () => {
    for (const temp of TEMPS) {
      const s = getTemperatureRegulatorSettings('vegan_gelato', temp);
      for (const gate of [
        'lactose',
        'lactose_sanding',
        'aerating_dairy_protein',
        'dairy_protein_share_in_solids',
        'msnf_required_gate',
      ]) {
        expect(s.disabledGates, `${temp}:${gate}`).toContain(gate);
      }
      expect(s.lactose).toBeUndefined();
    }
  });

  it('−13 °C is the observed calibration anchor; −11/−12 are locked internal settings', () => {
    expect(getTemperatureRegulatorSettings('vegan_gelato', -13).status).toBe('locked_pinguino_v0_1');
    expect(getTemperatureRegulatorSettings('vegan_gelato', -13).notes.join(' ')).toMatch(/observed calibration anchor/);
    expect(getTemperatureRegulatorSettings('vegan_gelato', -11).status).toBe('locked_pinguino_internal_v0_1');
    expect(getTemperatureRegulatorSettings('vegan_gelato', -12).status).toBe('locked_pinguino_internal_v0_1');
  });

  it('carries the locked vegan NPAC map', () => {
    expect(getTemperatureRegulatorSettings('vegan_gelato', -11).npac?.cleanCenter).toEqual([40, 47]);
    expect(getTemperatureRegulatorSettings('vegan_gelato', -12).npac?.cleanCenter).toEqual([48, 54]);
    const minus13 = getTemperatureRegulatorSettings('vegan_gelato', -13).npac;
    expect(minus13?.band).toEqual([50, 64]);
    expect(minus13?.lockedReference).toBe(59.47);
    expect(minus13?.mediumEvidence).toBe(53.75);
  });

  it('V02 fixed matches the doc exactly', () => {
    const v02 = findTemperatureRegulatorFixture('V02_fixed');
    expect(v02?.purpose).toBe('clean_anchor');
    expect(v02?.expected).toEqual({
      pod: 22.08,
      npac: 59.47,
      iceFraction: 51.06,
      fat: 5.08,
      solids: 36.24,
      water: 63.76,
      costPerKg: 5.46,
      costPer80g: 0.44,
    });
  });

  it('V02-AUTO is medium evidence; V01 is a negative fixture, never a clean target', () => {
    expect(findTemperatureRegulatorFixture('V02_AUTO')?.purpose).toBe('medium_evidence');
    expect(findTemperatureRegulatorFixture('V02_AUTO')?.expected.npac).toBe(53.75);
    const v01 = findTemperatureRegulatorFixture('V01_rejected');
    expect(v01?.purpose).toBe('negative_fixture');
    expect(v01?.purpose).not.toBe('clean_anchor');
    expect(v01?.expected.npac).toBe(32.91);
    expect(v01?.notes.join(' ')).toMatch(/never a clean target/);
  });
});

describe('Temperature Regulator config — Chocolate Gelato (locked doc values)', () => {
  it('exists for −11/−12/−13 with the wider chocolate POD band 12–20', () => {
    for (const temp of TEMPS) {
      expect(getTemperatureRegulatorSettings('chocolate_gelato', temp).pod?.band).toEqual([12, 20]);
    }
  });

  it('protein share is advisory with hard minimum 7 — never the standard hard gate', () => {
    for (const temp of TEMPS) {
      const s = getTemperatureRegulatorSettings('chocolate_gelato', temp);
      expect(s.advisoryGates, String(temp)).toContain('protein_share_in_solids');
      expect(s.proteinShareInSolids?.band, String(temp)).toEqual([8, 13]);
      expect(s.proteinShareInSolids?.visibleBenchmark, String(temp)).toEqual([9, 13]);
      expect(s.proteinShareInSolids?.hardMinimum, String(temp)).toBe(7);
    }
    const standard = getTemperatureRegulatorSettings('standard_gelato', -12);
    expect(standard.advisoryGates).not.toContain('protein_share_in_solids');
    expect(standard.proteinShareInSolids?.hardMinimum).toBeUndefined();
  });

  it('carries the locked chocolate NPAC map and cocoa notes', () => {
    expect(getTemperatureRegulatorSettings('chocolate_gelato', -11).npac?.cleanCenter).toEqual([40, 42]);
    expect(getTemperatureRegulatorSettings('chocolate_gelato', -12).npac?.cleanCenter).toEqual([47, 49.5]);
    const minus13 = getTemperatureRegulatorSettings('chocolate_gelato', -13);
    expect(minus13.npac?.cleanCenter).toEqual([49.8, 54.1]);
    expect(minus13.npac?.fixedReference).toBe(54.08);
    expect(minus13.npac?.lowerEvidence).toBe(49.8);
    const allNotes = TEMPS.map((t) => getTemperatureRegulatorSettings('chocolate_gelato', t).notes.join(' ')).join(' ');
    expect(allNotes).toMatch(/cocoa/);
    expect(allNotes).toMatch(/skimmed milk powder/);
  });

  it('C01 fixed is a stress/reference fixture matching the doc exactly', () => {
    const c01 = findTemperatureRegulatorFixture('C01_fixed');
    expect(c01?.purpose).toBe('stress_reference');
    expect(c01?.expected).toEqual({
      pod: 18.43,
      npac: 54.08,
      iceFraction: 43.97,
      lactose: 4.61,
      lactoseSanding: 8.41,
      fat: 10.37,
      aeratingProtein: 3.09,
      proteinShareInSolids: 6.84,
      solids: 45.12,
      water: 54.88,
      costPerKg: 5.59,
      costPer80g: 0.45,
    });
    expect(c01?.formulaG.find((l) => l.ingredient === 'dark chocolate 70.5%')?.grams).toBe(120);
  });

  it('C01 optimized is optimizer evidence matching the doc exactly', () => {
    const c01opt = findTemperatureRegulatorFixture('C01_optimized');
    expect(c01opt?.purpose).toBe('optimized_evidence');
    expect(c01opt?.expected.npac).toBe(49.8);
    expect(c01opt?.expected.lactoseSanding).toBe(9.37);
    expect(c01opt?.expected.proteinShareInSolids).toBe(8.42);
    expect(c01opt?.formulaG.find((l) => l.ingredient === 'dark chocolate 70.5%')?.grams).toBe(130.8);
  });
});

describe('Temperature Regulator config — cross-profile safety', () => {
  it('exactly 14 golden fixtures with unique ids', () => {
    expect(TEMPERATURE_REGULATOR_GOLDEN_FIXTURES).toHaveLength(14);
    expect(new Set(TEMPERATURE_REGULATOR_GOLDEN_FIXTURES.map((f) => f.id)).size).toBe(14);
  });

  it('config is data only — no functions, no ingredient-level npac_value truth', () => {
    for (const subject of [listTemperatureRegulatorSettings(), TEMPERATURE_REGULATOR_GOLDEN_FIXTURES]) {
      expect(deepLeaves(subject).some((leaf) => typeof leaf === 'function')).toBe(false);
      expect(deepKeys(subject).some((key) => key === 'npac_value')).toBe(false);
    }
  });

  it('does not reference or export any engine implementation', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'temperatureRegulator.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/from\s+['"][^'"]*engine/i.test(src)).toBe(false);
    expect(/calculateRecipe/.test(src)).toBe(false);
  });

  it('isMetricInBand is inclusive and honest about non-finite values', () => {
    expect(isMetricInBand(46.18, [42, 50])).toBe(true);
    expect(isMetricInBand(42, [42, 50])).toBe(true);
    expect(isMetricInBand(50, [42, 50])).toBe(true);
    expect(isMetricInBand(41.99, [42, 50])).toBe(false);
    expect(isMetricInBand(50.01, [42, 50])).toBe(false);
    expect(isMetricInBand(Number.NaN, [42, 50])).toBe(false);
  });
});
