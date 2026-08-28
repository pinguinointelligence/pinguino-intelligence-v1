import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import { canonicalIngredientId } from './canonicalIngredientIdentity';
import { starterPackRescueIngredient } from '@/features/constraint-studio/starterPackRescuePalette';
import { buildSavePayload, savedToRecipeInput } from '@/features/recipes/recipePayload';
import {
  GELLATTI_STABILIZER_AUTHORITY,
  GELLATTI_STABILIZER_MAPPER_ID,
  gellattiStabilizerDosageGrams,
} from './gellattiStabilizerAuthority';

const BASE_SHA = '7edd90ea14299f3af47364a6dc119cc2b0970179';
const MAPPER_PATH = 'docs/ingredients/validation/mapper_basement.csv';
const PROCESS_PATH = 'supabase/seed/mapper_process_metadata.csv';
const AUTHORITY_MIGRATION_PATH =
  'supabase/migrations/20260828170200_gellatti_stabilizer_product_authority.sql';
const RUNTIME_GUARD_MIGRATION_PATH =
  'supabase/migrations/20260828170300_mapper_2089_runtime_count_guards.sql';
const OLD_MAPPER_SHA256 = 'b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38';

const source = readFileSync(resolve(process.cwd(), MAPPER_PATH), 'utf8');
const [header = [], ...records] = parseCsv(source);
const index = new Map(header.map((field, position) => [field, position]));
const row = (id: string) => records.find((record) => record[index.get('ingredient_id')!] === id);
const value = (record: string[], field: string) => record[index.get(field)!] ?? '';

describe('owner-authorized canonical Gellatti Stabilizer row', () => {
  it('expands Mapper 2088 → 2089 with exactly one new identity', () => {
    expect(records).toHaveLength(2_089);
    expect(new Set(records.map((record) => value(record, 'ingredient_id'))).size).toBe(2_089);
    expect(
      records.filter((record) => value(record, 'ingredient_id') === GELLATTI_STABILIZER_MAPPER_ID),
    ).toHaveLength(1);
    expect(
      records.filter((record) =>
        /gellatti stabilizer/i.test(value(record, 'ingredient_name_display')),
      ),
    ).toHaveLength(1);
  });

  it('keeps every accepted-base row logically byte-identical and in the same order', () => {
    const oldSource = execFileSync('git', ['show', `${BASE_SHA}:${MAPPER_PATH}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(createHash('sha256').update(oldSource).digest('hex')).toBe(OLD_MAPPER_SHA256);
    const [oldHeader = [], ...oldRecords] = parseCsv(oldSource);
    expect(oldHeader).toEqual(header);
    expect(oldRecords).toHaveLength(2_088);
    expect(records.slice(0, 2_088)).toEqual(oldRecords);
  });

  it('stores the exact identity, weighted technical facts, provenance, allergens and no shared price', () => {
    const exact = row(GELLATTI_STABILIZER_MAPPER_ID);
    expect(exact).toBeDefined();
    expect(exact && value(exact, 'ingredient_name_internal')).toBe('gellatti_stabilizer');
    expect(exact && value(exact, 'ingredient_name_display')).toBe(
      'GELLATTI STABILIZER · Gellatti Stabilizer Blend · Dry',
    );
    expect(exact && value(exact, 'brand')).toBe('Gellatti');
    expect(exact && value(exact, 'supplier')).toBe('Gellatti');
    expect(exact && value(exact, 'country')).toBe('Spain');
    expect(exact && value(exact, 'ingredient_category')).toBe('stabilizer');
    expect(exact && value(exact, 'ingredient_subcategory')).toBe('stabilizer_blend');
    expect(exact && value(exact, 'water_percent')).toBe('7.1625');
    expect(exact && value(exact, 'total_solids_percent')).toBe('92.8375');
    expect(exact && value(exact, 'dry_matter_percent')).toBe('92.8375');
    expect(exact && value(exact, 'fat_percent')).toBe('0.5375');
    expect(exact && value(exact, 'protein_percent')).toBe('2.9985');
    expect(exact && value(exact, 'carbohydrate_percent')).toBe('13.1700');
    expect(exact && value(exact, 'fiber_percent')).toBe('74.3150');
    for (const field of [
      'total_sugars_percent',
      'sucrose_percent',
      'dextrose_percent',
      'glucose_percent',
      'fructose_percent',
      'lactose_percent',
      'polyol_percent',
      'salt_percent',
      'alcohol_percent',
      'pod_value',
      'pac_value',
    ]) {
      expect(exact && value(exact, field), field).toBe('0');
    }
    expect(exact && value(exact, 'kcal_per_100g')).toBe('192.0');
    expect(exact && value(exact, 'cost_per_kg')).toBe('');
    expect(exact && value(exact, 'currency')).toBe('');
    expect(exact && value(exact, 'allergens')).toBe('none_declared');
    expect(exact && value(exact, 'verification_source')).toBe('OWNER_FORMULATION');
    expect(exact && value(exact, 'usage_notes')).toContain('65.45 PLN/kg');
    expect(exact && value(exact, 'engine_notes')).toContain('PI-ING-000492');
    expect(exact && value(exact, 'engine_notes')).toContain('PI-ING-000475');
    expect(exact && value(exact, 'engine_notes')).toContain('PI-ING-000472');
  });

  it('proves every weighted value from the three immutable canonical constituents', () => {
    const tara = row('PI-ING-000492')!;
    const lbg = row('PI-ING-000475')!;
    const guar = row('PI-ING-000472')!;
    const weighted = (field: string) =>
      0.6 * Number(value(tara, field)) +
      0.25 * Number(value(lbg, field)) +
      0.15 * Number(value(guar, field));
    expect(weighted('water_percent')).toBeCloseTo(7.1625, 12);
    expect(weighted('total_solids_percent')).toBeCloseTo(92.8375, 12);
    expect(weighted('fat_percent')).toBeCloseTo(0.5375, 12);
    expect(weighted('protein_percent')).toBeCloseTo(2.9985, 12);
    expect(weighted('carbohydrate_percent')).toBeCloseTo(13.17, 12);
    expect(weighted('fiber_percent')).toBeCloseTo(74.315, 12);
    expect(weighted('kcal_per_100g')).toBeCloseTo(192, 12);
    expect(weighted('pod_value')).toBe(0);
    expect(weighted('pac_value')).toBe(0);
  });

  it('binds exact HEAT handling, BASE_ONLY ProductBehavior and four owner dosage profiles', () => {
    expect(GELLATTI_STABILIZER_AUTHORITY).toMatchObject({
      mapperId: 'PI-ING-002114',
      productRole: 'BASE_ONLY',
      toppingCapable: false,
      process: {
        classification: 'HEAT',
        hydrationTempMinC: 80,
        hydrationTempMaxC: 85,
      },
      dosageGPerKg: {
        STANDARD: 2.3,
        SORBET: 2.8,
        CHOCOLATE: 2.5,
        EGG: 1.8,
      },
    });
    expect(gellattiStabilizerDosageGrams('STANDARD', 1_000)).toBe(2.3);
    expect(gellattiStabilizerDosageGrams('SORBET', 2_500)).toBe(7);
    expect(gellattiStabilizerDosageGrams('CHOCOLATE', 500)).toBe(1.25);
    expect(gellattiStabilizerDosageGrams('EGG', 1_000)).toBe(1.8);

    const processSource = readFileSync(resolve(process.cwd(), PROCESS_PATH), 'utf8');
    const [processHeader = [], ...processRecords] = parseCsv(processSource);
    const processIndex = new Map(processHeader.map((field, position) => [field, position]));
    const exact = processRecords.filter(
      (record) => record[processIndex.get('ingredient_id')!] === GELLATTI_STABILIZER_MAPPER_ID,
    );
    expect(exact).toHaveLength(1);
    expect(exact[0]?.[processIndex.get('process_status')!]).toBe('HEAT_REQUIRED_FOR_FUNCTION');
    expect(exact[0]?.[processIndex.get('cold_process_eligibility')!]).toBe('NO');
    expect(exact[0]?.[processIndex.get('hydration_temp_min_c')!]).toBe('80');
    expect(exact[0]?.[processIndex.get('hydration_temp_target_c')!]).toBe('85');

    const migration = readFileSync(resolve(process.cwd(), AUTHORITY_MIGRATION_PATH), 'utf8');
    expect(migration).toContain("'PI-ING-002114','owner-gellatti-stabilizer-v1'");
    expect(migration).toContain("'productRole','BASE_ONLY'");
    expect(migration).toContain("'TOPPING',false");
    expect(migration).toContain("'STANDARD',2.3");
    expect(migration).toContain("'SORBET',2.8");
    expect(migration).toContain("'CHOCOLATE',2.5");
    expect(migration).toContain("'EGG',1.8");
    expect(migration).toContain("b.process_behavior->>'decision'='HEAT_REQUIRED_FOR_FUNCTION'");
    expect(migration).toContain("p.product_kind<>'mapper_reference'");
  });

  it('advances every current Mapper-count runtime guard without rewriting history', () => {
    const migration = readFileSync(resolve(process.cwd(), RUNTIME_GUARD_MIGRATION_PATH), 'utf8');
    for (const functionName of [
      'product_import_clean_preflight_v1',
      'start_product_import_run_v1',
      'snapshot_and_clean_pr_catalog_v1',
      'snapshot_pr_catalog_v1',
      'clean_pr_catalog_batch_v1',
      'register_product_import_external_snapshot_v1',
    ]) {
      expect(migration).toContain(functionName);
    }
    expect(migration).toContain("replace(v_before,'2088','2089')");
    expect(migration).toContain("strpos(v_after,'2088')>0");
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
  });

  it('round-trips one canonical Base recipe line through Save/reopen without identity drift', () => {
    const ingredient = starterPackRescueIngredient('PI-ING-002114');
    expect(ingredient).not.toBeNull();
    const input = {
      mode: 'classic' as const,
      category: 'milk_gelato' as const,
      target_temperature_c: -11,
      target_batch_grams: 2.3,
      machine_capacity_grams: null,
      items: [
        {
          id: 'gellatti-stabilizer-line',
          ingredient: ingredient!,
          planned_grams: 2.3,
          actual_grams: null,
          lock_type: 'unlocked' as const,
        },
      ],
    };
    const payload = buildSavePayload({
      name: 'Gellatti Stabilizer identity proof',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    const reopened = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    expect(reopened.items).toHaveLength(1);
    expect(reopened.items[0]).toMatchObject({
      id: 'gellatti-stabilizer-line',
      planned_grams: 2.3,
      actual_grams: null,
      lock_type: 'unlocked',
    });
    expect(reopened.items[0] && canonicalIngredientId(reopened.items[0].ingredient)).toBe(
      'PI-ING-002114',
    );
    expect(reopened.items[0]?.ingredient.canonical_ingredient_id).toBe('PI-ING-002114');
    expect(reopened.items[0]?.ingredient.cost_per_kg).toBeNull();
  });
});
