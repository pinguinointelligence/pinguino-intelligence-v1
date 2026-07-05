import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PRODUCT_PROFILES,
  CHOCOLATE_CORRECTION_FAMILIES,
  DAIRY_CORRECTION_FAMILIES,
  PRODUCT_PROFILE_REGISTRY,
  getProductProfileDefinition,
} from './productProfiles';

const ALL = Object.values(PRODUCT_PROFILE_REGISTRY);

describe('Product Profile Registry — existence (locked v1.0)', () => {
  it('contains exactly the four active v1.0 profiles', () => {
    expect(Object.keys(PRODUCT_PROFILE_REGISTRY).sort()).toEqual(
      [...ACTIVE_PRODUCT_PROFILES].sort(),
    );
    expect(ACTIVE_PRODUCT_PROFILES).toHaveLength(4);
  });

  it('has no granita, protein, fresh or storage profile', () => {
    const keys = Object.keys(PRODUCT_PROFILE_REGISTRY);
    for (const unsupported of ['granita', 'protein', 'protein_gelato', 'fresh', 'storage_minus18']) {
      expect(keys).not.toContain(unsupported);
    }
  });

  it('every definition id matches its registry key and label is human-readable', () => {
    for (const [key, def] of Object.entries(PRODUCT_PROFILE_REGISTRY)) {
      expect(def.id).toBe(key);
      expect(def.label.length).toBeGreaterThan(0);
    }
  });

  it('designer / optimizer / temperature regulator ownership is defined and profile-specific', () => {
    for (const field of ['designer', 'optimizer', 'temperatureRegulator'] as const) {
      const owners = ALL.map((def) => def[field]);
      expect(owners.every((owner) => owner.length > 0)).toBe(true);
      expect(new Set(owners).size).toBe(ALL.length); // no profile shares another's owner
    }
  });
});

describe('Product Profile Registry — gates', () => {
  it('standard_gelato keeps all dairy gates active as hard', () => {
    const gates = getProductProfileDefinition('standard_gelato').activeGates;
    for (const gate of [
      'pod',
      'npac',
      'ice_fraction',
      'water',
      'total_solids',
      'fat',
      'lactose',
      'lactose_sanding',
      'aerating_protein',
      'protein_share_in_solids',
      'stabilizer',
    ] as const) {
      expect(gates[gate], gate).toBe('hard');
    }
    expect(getProductProfileDefinition('standard_gelato').disabledGates).toEqual([]);
  });

  it('sorbet disables the dairy gates and never evaluates lactose', () => {
    const sorbet = getProductProfileDefinition('sorbet');
    for (const gate of [
      'dairy_fat_logic',
      'lactose',
      'lactose_sanding',
      'aerating_dairy_protein',
      'dairy_protein_share_in_solids',
      'msnf_required_gate',
    ] as const) {
      expect(sorbet.disabledGates, gate).toContain(gate);
    }
    expect(sorbet.activeGates.lactose).toBeUndefined();
    expect(sorbet.activeGates.lactose_sanding).toBeUndefined();
    expect(sorbet.activeGates.fruit_water_sugar_balance).toBe('hard');
  });

  it('vegan_gelato disables lactose and dairy protein gates but keeps fat + plant structure', () => {
    const vegan = getProductProfileDefinition('vegan_gelato');
    for (const gate of [
      'lactose',
      'lactose_sanding',
      'aerating_dairy_protein',
      'dairy_protein_share_in_solids',
      'msnf_required_gate',
    ] as const) {
      expect(vegan.disabledGates, gate).toContain(gate);
    }
    expect(vegan.activeGates.lactose).toBeUndefined();
    expect(vegan.activeGates.fat).toBe('hard');
    expect(vegan.activeGates.plant_base_structure).toBe('hard');
  });

  it('chocolate_gelato marks protein share as soft/advisory — never a standard hard fail', () => {
    const chocolate = getProductProfileDefinition('chocolate_gelato');
    expect(['soft', 'advisory']).toContain(chocolate.activeGates.protein_share_in_solids);
    expect(chocolate.activeGates.protein_share_in_solids).not.toBe(
      getProductProfileDefinition('standard_gelato').activeGates.protein_share_in_solids,
    );
  });

  it('chocolate_gelato keeps chocolate/cocoa solids behavior and dairy gates active', () => {
    const gates = getProductProfileDefinition('chocolate_gelato').activeGates;
    expect(gates.chocolate_cocoa_solids_behavior).toBe('hard');
    for (const gate of ['lactose', 'lactose_sanding', 'aerating_protein', 'fat'] as const) {
      expect(gates[gate], gate).toBe('hard');
    }
  });

  it('no gate is both active and disabled in any profile', () => {
    for (const def of ALL) {
      for (const disabled of def.disabledGates) {
        expect(def.activeGates[disabled], `${def.id}:${disabled}`).toBeUndefined();
      }
    }
  });

  it('stabilizer is a hard gate for every active v1.0 profile', () => {
    for (const def of ALL) {
      expect(def.activeGates.stabilizer, def.id).toBe('hard');
    }
  });
});

describe('Product Profile Registry — correction families', () => {
  it('standard_gelato allows dairy correction families', () => {
    const { allowedCorrectionFamilies } = getProductProfileDefinition('standard_gelato');
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(allowedCorrectionFamilies).toContain(family);
    }
  });

  it('sorbet never allows dairy correction families', () => {
    const sorbet = getProductProfileDefinition('sorbet');
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(sorbet.allowedCorrectionFamilies).not.toContain(family);
      expect(sorbet.forbiddenCorrectionFamilies).toContain(family);
    }
  });

  it('vegan_gelato never allows milk, cream or skimmed milk powder', () => {
    const vegan = getProductProfileDefinition('vegan_gelato');
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(vegan.allowedCorrectionFamilies).not.toContain(family);
      expect(vegan.forbiddenCorrectionFamilies).toContain(family);
    }
  });

  it('chocolate_gelato allows the chocolate/cocoa families', () => {
    const { allowedCorrectionFamilies } = getProductProfileDefinition('chocolate_gelato');
    for (const family of CHOCOLATE_CORRECTION_FAMILIES) {
      expect(allowedCorrectionFamilies).toContain(family);
    }
  });

  it('chocolate/cocoa families are exclusive to the chocolate profile', () => {
    for (const def of ALL.filter((d) => d.id !== 'chocolate_gelato')) {
      for (const family of CHOCOLATE_CORRECTION_FAMILIES) {
        expect(def.allowedCorrectionFamilies, `${def.id}:${family}`).not.toContain(family);
      }
    }
  });

  it('no family is both allowed and forbidden in any profile', () => {
    for (const def of ALL) {
      for (const family of def.forbiddenCorrectionFamilies) {
        expect(def.allowedCorrectionFamilies, `${def.id}:${family}`).not.toContain(family);
      }
    }
  });
});

describe('Product Profile Registry — serving temperatures', () => {
  it('every active profile supports exactly −11 / −12 / −13 °C', () => {
    for (const def of ALL) {
      expect([...def.supportsServingTemperaturesC]).toEqual([-11, -12, -13]);
    }
  });

  it('every active profile defines a default temperature inside its supported set', () => {
    for (const def of ALL) {
      expect(def.supportsServingTemperaturesC).toContain(def.defaultServingTemperatureC);
      expect(def.defaultServingTemperatureC).toBe(-12); // system default (Recipe_Intent.md §8)
    }
  });
});
