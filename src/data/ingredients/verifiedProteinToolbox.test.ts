import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import {
  VERIFIED_PROTEIN_FORMULATION_CANDIDATES,
  findVerifiedProteinFormulationCandidate,
} from './verifiedProteinToolbox';

const grid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const header = grid[0]!;
const rows = grid.slice(1).filter((row) => row.some((cell) => cell !== ''));
const at = (row: string[], name: string): string => row[header.indexOf(name)] ?? '';
const numeric = (row: string[], name: string): number => Number(at(row, name));

describe('verified Protein formulation toolbox', () => {
  it('pins every runtime candidate to the latest canonical Mapper row', () => {
    expect(VERIFIED_PROTEIN_FORMULATION_CANDIDATES).toHaveLength(10);
    for (const candidate of VERIFIED_PROTEIN_FORMULATION_CANDIDATES) {
      const row = rows.find((entry) => at(entry, 'ingredient_id') === candidate.id);
      expect(row, candidate.id).toBeDefined();
      if (!row) continue;
      expect(at(row, 'approved_for_engines').toLowerCase()).toBe('true');
      expect(at(row, 'verification_status')).toMatch(/^Verified/);
      expect(candidate.name).toBe(at(row, 'ingredient_name_display'));
      expect(candidate.composition.water_percent).toBe(numeric(row, 'water_percent'));
      expect(candidate.composition.solids_percent).toBe(numeric(row, 'total_solids_percent'));
      expect(candidate.composition.fat_percent).toBe(numeric(row, 'fat_percent'));
      expect(candidate.composition.protein_percent).toBe(numeric(row, 'protein_percent'));
      expect(candidate.composition.carbohydrate_percent).toBe(numeric(row, 'carbohydrate_percent'));
      expect(candidate.composition.sugar_percent).toBe(numeric(row, 'total_sugars_percent'));
      expect(candidate.composition.lactose_percent).toBe(numeric(row, 'lactose_percent'));
      expect(candidate.composition.fiber_percent).toBe(numeric(row, 'fiber_percent'));
      expect(candidate.composition.salt_percent).toBe(numeric(row, 'salt_percent'));
      expect(candidate.composition.kcal_per_100g).toBe(numeric(row, 'kcal_per_100g'));
      expect(candidate.pod_value).toBe(numeric(row, 'pod_value'));
      expect(candidate.pac_value).toBe(numeric(row, 'pac_value'));
      expect(candidate.confidence_score).toBe(numeric(row, 'data_confidence_percent'));
      if (at(row, 'cost_per_kg') !== '') {
        expect(candidate.cost_per_kg).toBe(numeric(row, 'cost_per_kg'));
      }
      // The complete audit fields stay pinned in Mapper even where the Engine
      // projection intentionally does not duplicate them.
      expect(at(row, 'aerating_protein_percent')).not.toBeUndefined();
      expect(at(row, 'allergens')).not.toBeUndefined();
      expect(at(row, 'dairy_free')).not.toBeUndefined();
    }
  });

  it('contains WPC80/WPC60/MPC/Skyr/pea/rice and invents no high-protein milk', () => {
    expect(VERIFIED_PROTEIN_FORMULATION_CANDIDATES.map((item) => item.id)).toEqual([
      'PI-ING-000237',
      'PI-ING-000264',
      'PI-ING-000294',
      'PI-ING-000295',
      'PI-ING-001395',
      'PI-ING-001451',
      'PI-ING-000451',
      'PI-ING-000452',
      'PI-ING-002110',
      'PI-ING-002111',
    ]);
    expect(
      findVerifiedProteinFormulationCandidate('PI-ING-000295')?.composition.protein_percent,
    ).toBe(80);
    expect(
      findVerifiedProteinFormulationCandidate('PI-ING-000294')?.composition.protein_percent,
    ).toBe(60);
    expect(
      findVerifiedProteinFormulationCandidate('PI-ING-000237')?.composition.protein_percent,
    ).toBe(75);
    expect(
      VERIFIED_PROTEIN_FORMULATION_CANDIDATES.some((candidate) =>
        /high.?protein milk/i.test(candidate.name),
      ),
    ).toBe(false);
  });
});
