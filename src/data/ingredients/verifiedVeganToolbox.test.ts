import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import {
  VERIFIED_VEGAN_FORMULATION_CANDIDATES,
  findVerifiedVeganFormulationCandidate,
} from './verifiedVeganToolbox';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const rows = grid.slice(1).filter((row) => row.some((cell) => cell !== ''));
const at = (row: string[], name: string): string => row[header.indexOf(name)] ?? '';
const numeric = (row: string[], name: string): number => Number(at(row, name));

describe('verified Vegan formulation toolbox', () => {
  it('pins every runtime candidate to its exact canonical Mapper identity and composition', () => {
    expect(VERIFIED_VEGAN_FORMULATION_CANDIDATES).toHaveLength(11);
    for (const candidate of VERIFIED_VEGAN_FORMULATION_CANDIDATES) {
      const row = rows.find((entry) => at(entry, 'ingredient_id') === candidate.id);
      expect(row, candidate.id).toBeDefined();
      if (!row) continue;
      expect(at(row, 'approved_for_engines').toLowerCase()).toBe('true');
      expect(at(row, 'verification_status')).toMatch(/^Verified/);
      expect(at(row, 'vegan').toLowerCase()).toBe('true');
      expect(candidate.name).toBe(at(row, 'ingredient_name_display'));
      expect(candidate.composition.water_percent).toBe(numeric(row, 'water_percent'));
      expect(candidate.composition.solids_percent).toBe(numeric(row, 'total_solids_percent'));
      expect(candidate.composition.fat_percent).toBe(numeric(row, 'fat_percent'));
      expect(candidate.composition.protein_percent).toBe(numeric(row, 'protein_percent'));
      expect(candidate.composition.carbohydrate_percent).toBe(numeric(row, 'carbohydrate_percent'));
      expect(candidate.composition.sugar_percent).toBe(numeric(row, 'total_sugars_percent'));
      expect(candidate.composition.sucrose_percent).toBe(numeric(row, 'sucrose_percent'));
      expect(candidate.composition.glucose_percent).toBe(numeric(row, 'glucose_percent'));
      expect(candidate.composition.fructose_percent).toBe(numeric(row, 'fructose_percent'));
      expect(candidate.composition.fiber_percent).toBe(numeric(row, 'fiber_percent'));
      expect(candidate.composition.salt_percent).toBe(numeric(row, 'salt_percent'));
      expect(candidate.composition.kcal_per_100g).toBe(numeric(row, 'kcal_per_100g'));
      expect(candidate.pod_value).toBe(numeric(row, 'pod_value'));
      expect(candidate.pac_value).toBe(numeric(row, 'pac_value'));
      expect(candidate.flags?.vegan_eligibility).toBe('VEGAN_VERIFIED');
    }
  });

  it('exposes only the four exact verified, engine-approved Mapper 2088 soy products', () => {
    const productionSoyDrinks = rows.filter((row) => {
      const identity = `${at(row, 'ingredient_name_internal')} ${at(row, 'ingredient_name_display')} ${at(row, 'ingredient_subcategory')}`.toLowerCase();
      return (
        /soy|soya/.test(identity) &&
        /drink|beverage|milk/.test(identity) &&
        at(row, 'approved_for_engines').toLowerCase() === 'true' &&
        at(row, 'verification_status').startsWith('Verified') &&
        at(row, 'vegan').toLowerCase() === 'true'
      );
    });
    expect(productionSoyDrinks.map((row) => at(row, 'ingredient_id'))).toEqual([
      'PI-ING-002109',
      'PI-ING-002110',
      'PI-ING-002112',
    ]);
    expect(findVerifiedVeganFormulationCandidate('soya_sauce')).toBeNull();
    expect(
      VERIFIED_VEGAN_FORMULATION_CANDIDATES.filter((candidate) => /soy|soya/i.test(candidate.name))
        .map((candidate) => candidate.id),
    ).toEqual(['PI-ING-002109', 'PI-ING-002110', 'PI-ING-002111', 'PI-ING-002112']);
  });
});
