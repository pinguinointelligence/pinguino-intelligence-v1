import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  deriveProteinBehavior,
  type ProteinEvidenceLevel,
  type ProteinSourceClass,
} from './proteinBehavior';

/**
 * §23 coverage audit — deterministic, offline, zero paid lookups.
 *
 * Proves what the derived ProteinBehavior layer can and cannot see across the
 * WHOLE canonical Mapper base without changing a single row of it. The numbers
 * this test prints are the numbers quoted in
 * reports/PROTEIN_SCIENCE_AUTHORITY_V2.md.
 */

const MAPPER_PATH = 'docs/ingredients/validation/mapper_basement.csv';
const grid = parseCsv(readFileSync(resolve(process.cwd(), MAPPER_PATH), 'utf8'));
const header = grid[0]!;
const NUMERIC = new Set([
  'data_confidence_percent',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'saturated_fat_percent',
  'milk_fat_percent',
  'non_fat_milk_solids_percent',
  'protein_percent',
  'aerating_protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'ash_percent',
  'acidity_percent',
  'brix',
  'dry_matter_percent',
  'pod_value',
  'pac_value',
  'de_value',
  'sweetness_factor',
  'freezing_factor',
  'stabilizer_activity',
  'recommended_dosage_percent_min',
  'recommended_dosage_percent_max',
  'kcal_per_100g',
  'cost_per_kg',
  'shelf_life_days',
]);

const rows: readonly IngredientRow[] = grid.slice(1).map(
  (cells) =>
    Object.fromEntries(
      header.map((column, index) => {
        const value = cells[index] ?? '';
        if (NUMERIC.has(column)) return [column, value === '' ? null : Number(value)];
        if (
          column === 'approved_for_base' ||
          column === 'approved_for_engines' ||
          column === 'is_active'
        ) {
          return [column, value.toLowerCase() === 'true'];
        }
        return [column, value];
      }),
    ) as unknown as IngredientRow,
);

const ingredients: readonly EngineIngredient[] = rows.map(ingredientRowToEngineIngredient);

/** A "protein-relevant" row is one that could meaningfully carry a Protein recipe. */
const PROTEIN_RELEVANT_MIN_PERCENT = 10;
const proteinRelevant = ingredients.filter(
  (ingredient) => ingredient.composition.protein_percent >= PROTEIN_RELEVANT_MIN_PERCENT,
);

describe('derived ProteinBehavior coverage over the canonical Mapper base', () => {
  it('classifies every row deterministically and never throws', () => {
    expect(ingredients.length).toBe(2088);
    for (const ingredient of ingredients) {
      const first = deriveProteinBehavior(ingredient);
      const second = deriveProteinBehavior(ingredient);
      expect(second).toEqual(first);
    }
  });

  it('reports coverage without modifying the Mapper', () => {
    const byClass = new Map<ProteinSourceClass, number>();
    const byEvidence = new Map<ProteinEvidenceLevel, number>();
    let lactoseKnown = 0;
    let fatKnown = 0;
    for (const ingredient of proteinRelevant) {
      const behavior = deriveProteinBehavior(ingredient);
      byClass.set(behavior.sourceClass, (byClass.get(behavior.sourceClass) ?? 0) + 1);
      byEvidence.set(
        behavior.sourceEvidence,
        (byEvidence.get(behavior.sourceEvidence) ?? 0) + 1,
      );
      if (behavior.lactosePerProteinGram !== null) lactoseKnown += 1;
      if (behavior.fatPerProteinGram !== null) fatKnown += 1;
    }

    // ash_percent is present as a COLUMN but carries no information anywhere in
    // the base — every non-null cell is 0. Recorded here so the audit report
    // never claims mineral differentiation that the data cannot support.
    const ashValues = rows
      .map((row) => (row as unknown as Record<string, number | null>).ash_percent)
      .filter((value): value is number => value !== null && value !== undefined);
    const ashNonZero = ashValues.filter((value) => value !== 0).length;

    console.info(
      JSON.stringify(
        {
          mapperRows: ingredients.length,
          proteinRelevantRows: proteinRelevant.length,
          byClass: Object.fromEntries([...byClass.entries()].sort()),
          byEvidence: Object.fromEntries([...byEvidence.entries()].sort()),
          lactosePerProteinKnown: lactoseKnown,
          fatPerProteinKnown: fatKnown,
          ashNonNull: ashValues.length,
          ashNonZero,
        },
        null,
        2,
      ),
    );

    // The audit's own hard finding: ash carries zero information, so no
    // mineral-differentiated protein behaviour may be claimed.
    expect(ashNonZero).toBe(0);
    // Composition-derived fields are always available for a protein source.
    expect(lactoseKnown).toBe(proteinRelevant.length);
    expect(fatKnown).toBe(proteinRelevant.length);
  });

  it('never leaves a protein source unusable for lack of enhanced metadata', () => {
    for (const ingredient of proteinRelevant) {
      const behavior = deriveProteinBehavior(ingredient);
      // UNKNOWN is a legal, fully-usable outcome (owner rule §22).
      expect(behavior.isProteinContributor).toBe(true);
      expect(behavior.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('classification honesty spot-checks', () => {
  const byName = (fragment: string): EngineIngredient =>
    ingredients.find((ingredient) =>
      ingredient.name.toLowerCase().includes(fragment.toLowerCase()),
    )!;

  it('leaves no verified dairy protein source unclassified', () => {
    const missed = proteinRelevant
      .filter((ingredient) => ingredient.category === 'dairy')
      .filter((ingredient) => deriveProteinBehavior(ingredient).sourceClass === 'unknown')
      .map((ingredient) => `${ingredient.name} (${ingredient.composition.protein_percent}% protein)`);
    console.info(JSON.stringify({ unclassifiedDairyProteinSources: missed }, null, 2));
    expect(missed).toEqual([]);
  });

  it('refuses to guess a class for a self-contradicting product name', () => {
    // "MILK PROTEIN CONCENTRATE WPC 75%" claims both MPC and WPC.
    const contradictory = byName('MILK PROTEIN CONCENTRATE WPC');
    const behavior = deriveProteinBehavior(contradictory);
    expect(behavior.sourceClass).toBe('mixed_dairy_protein');
    expect(behavior.wheyCaseinClass).toBe('unknown');
    expect(behavior.caseinSharePercent).toBeNull();
  });

  it('separates protein sources that deliver the same protein with different lactose', () => {
    const wpc60 = byName('WPC 60%');
    const wpc80 = byName('WPC 80%');
    const a = deriveProteinBehavior(wpc60);
    const b = deriveProteinBehavior(wpc80);
    expect(a.sourceClass).toBe('whey_protein_concentrate');
    expect(b.sourceClass).toBe('whey_protein_concentrate');
    // Same class, same whey dominance — but WPC 60 drags far more lactose per
    // gram of protein delivered. This is the number the quality layer reads.
    expect(a.lactosePerProteinGram!).toBeGreaterThan(b.lactosePerProteinGram! * 2);
    console.info(
      JSON.stringify({
        wpc60LactosePerProteinG: Number(a.lactosePerProteinGram!.toFixed(4)),
        wpc80LactosePerProteinG: Number(b.lactosePerProteinGram!.toFixed(4)),
      }),
    );
  });
});
