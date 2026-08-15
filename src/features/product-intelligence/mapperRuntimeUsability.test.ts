import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  mapperBaseSelectable,
  mapperEngineMissingFields,
  mapperProvenancePresentation,
  mapperTechnicallyCalculable,
} from './mapperRuntimeUsability';

const source = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [header = [], ...records] = parseCsv(source);
const index = new Map(header.map((name, position) => [name, position]));
const bool = (row: string[], key: string): boolean =>
  row[index.get(key)!]?.trim().toLocaleLowerCase('en') === 'true';
const numberOrNull = (row: string[], key: string): number | null => {
  const value = row[index.get(key)!]?.trim();
  return value ? Number(value) : null;
};
const mapperRow = (row: string[]): IngredientRow => ({
  ingredient_id: row[index.get('ingredient_id')!]!,
  ingredient_name_internal: row[index.get('ingredient_name_internal')!]!,
  ingredient_name_display: row[index.get('ingredient_name_display')!]!,
  ingredient_category: row[index.get('ingredient_category')!]!,
  ingredient_subcategory: row[index.get('ingredient_subcategory')!] || null,
  verification_status: row[index.get('verification_status')!] as IngredientRow['verification_status'],
  is_active: true,
  approved_for_base: bool(row, 'approved_for_base'),
  approved_for_engines: bool(row, 'approved_for_engines'),
  water_percent: numberOrNull(row, 'water_percent'),
  total_solids_percent: numberOrNull(row, 'total_solids_percent'),
  fat_percent: numberOrNull(row, 'fat_percent'),
  protein_percent: numberOrNull(row, 'protein_percent'),
  carbohydrate_percent: numberOrNull(row, 'carbohydrate_percent'),
  total_sugars_percent: numberOrNull(row, 'total_sugars_percent'),
  salt_percent: numberOrNull(row, 'salt_percent'),
  pod_value: numberOrNull(row, 'pod_value'),
  pac_value: numberOrNull(row, 'pac_value'),
  data_confidence_percent: numberOrNull(row, 'data_confidence_percent'),
  vegan: row[index.get('vegan')!] as IngredientRow['vegan'],
} as IngredientRow);

const rows = records.map(mapperRow);
const runtimeAuditSource = readFileSync(
  resolve(process.cwd(), 'reports/MAPPER_2088_RUNTIME_USABILITY_AUDIT.csv'),
  'utf8',
);
const [runtimeAuditHeader = [], ...runtimeAuditRecords] = parseCsv(runtimeAuditSource);
const runtimeAuditIndex = new Map(
  runtimeAuditHeader.map((name, position) => [name, position]),
);
const auditValue = (row: string[], key: string): string =>
  row[runtimeAuditIndex.get(key)!]?.trim() ?? '';

describe('Mapper runtime usability contract', () => {
  it('keeps the immutable 2088 baseline and classifies every row deterministically', () => {
    expect(createHash('sha256').update(source).digest('hex').toUpperCase()).toBe(
      'B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38',
    );
    expect(rows).toHaveLength(2088);
    expect(rows.filter(mapperBaseSelectable)).toHaveLength(2075);
    expect(rows.filter(mapperTechnicallyCalculable)).toHaveLength(2074);
  });

  it('treats Estimated and Needs Label Review as presentation, never eligibility', () => {
    const watermelon = rows.find((row) => row.ingredient_id === 'PI-ING-000405')!;
    expect(mapperProvenancePresentation(watermelon.verification_status)).toBe('estimated');
    expect(mapperBaseSelectable(watermelon)).toBe(true);
    expect(mapperTechnicallyCalculable(watermelon)).toBe(true);
    expect(mapperEngineMissingFields(watermelon)).toEqual([]);

    expect(mapperProvenancePresentation('Estimated / Needs Label Review'))
      .toBe('needs_label_review');
  });

  it('calculates the exact Estimated Fresh Watermelon numerically without promoting provenance', () => {
    const watermelon = rows.find((row) => row.ingredient_id === 'PI-ING-000405')!;
    const ingredient = ingredientRowToEngineIngredient(watermelon);
    const input: RecipeInput = {
      items: [{ id: 'watermelon-line', ingredient, planned_grams: 200, actual_grams: null, lock_type: 'unlocked' }],
      mode: 'classic', category: 'sorbet', target_temperature_c: -11,
      target_batch_grams: 200, machine_capacity_grams: null,
    };
    const result = calculateRecipe(input);
    expect(result.total_batch_g).toBe(200);
    expect(result.totals.water_g).toBeGreaterThan(0);
    expect(result.items[0]?.ingredient.source_type).toBe('ai_estimated');
    expect(result.items[0]?.ingredient.is_verified).toBe(false);
  });

  it('keeps the one engine-ineligible Base row blocked for its real numerical reason', () => {
    const exception = rows.find((row) => row.ingredient_id === 'PI-ING-002113')!;
    expect(mapperBaseSelectable(exception)).toBe(true);
    expect(mapperTechnicallyCalculable(exception)).toBe(false);
    expect(mapperEngineMissingFields(exception)).toEqual(['pod_value', 'pac_value']);
  });

  it('publishes exactly one complete runtime classification for all 2088 rows', () => {
    expect(runtimeAuditRecords).toHaveLength(2088);
    expect(new Set(runtimeAuditRecords.map((row) => auditValue(row, 'ingredient_id'))).size)
      .toBe(2088);
    expect(runtimeAuditHeader).toEqual(expect.arrayContaining([
      'product_version_id', 'current_binding_id', 'provenance_status',
      'source_confidence', 'process_status', 'dosage_known', 'price_known',
      'current_product_behavior_state', 'current_main_policy_status',
      'current_binding_status', 'current_picker_status', 'final_block_reason',
      'correction_action',
    ]));
    for (const row of runtimeAuditRecords) {
      expect(row).toHaveLength(runtimeAuditHeader.length);
      for (const value of row) expect(value.trim()).not.toBe('');
    }
    expect(runtimeAuditRecords.filter(
      (row) => auditValue(row, 'selectable_after') === 'TRUE',
    )).toHaveLength(2075);
    expect(runtimeAuditRecords.filter(
      (row) => auditValue(row, 'pi_calculable_after') === 'TRUE',
    )).toHaveLength(2074);
  });

  it('rejects a 2088-row authenticated export when runtime authority fields drift', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mapper-authority-drift-'));
    const authorityPath = join(directory, 'authority.json');
    try {
      writeFileSync(authorityPath, JSON.stringify(records.map((row) => ({
        ingredient_id: row[index.get('ingredient_id')!],
      }))));
      const result = spawnSync(process.execPath, [
        resolve(process.cwd(), 'scripts/auditMapperRuntimeUsability.mjs'),
        `--authority-json=${authorityPath}`,
      ], { cwd: process.cwd(), encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr.toLocaleLowerCase('en')).toContain('authenticated runtime authority drift');
      expect(result.stderr).toContain('missing required field(s)');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('pins both 2088-row companion authorities and compares every served field', () => {
    const generator = readFileSync(
      resolve(process.cwd(), 'scripts/auditMapperRuntimeUsability.mjs'),
      'utf8',
    );
    expect(generator).toContain('EXPECTED_PROCESS_SHA');
    expect(generator).toContain('EXPECTED_BEHAVIOR_SHA');
    expect(generator).toContain('Object.prototype.hasOwnProperty.call');
    expect(generator).toContain("typeof row[field] !== 'boolean'");
    expect(generator).toContain("missing_technical_fields must be a string array");
    expect(generator).toContain("['product_id', 'product_version_id', 'binding_id']");
    for (const field of [
      'verification_status', 'source_confidence', 'verification_source',
      'approved_for_base', 'approved_for_engines', 'missing_technical_fields',
      'process_status', 'behavior_state', 'main_policy_status', 'binding_status',
      'selectable_base', 'pi_calculable',
    ]) expect(generator).toContain(`authority.${field}`);
  });
});
