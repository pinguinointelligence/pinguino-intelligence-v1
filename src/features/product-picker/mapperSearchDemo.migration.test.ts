/// <reference types="node" />
/**
 * Track F — the DEMO-SAFE Mapper search read model (0033) must expose ONLY safe
 * display fields, stay filtered to the approved library, and be readable by anon
 * AND authenticated (owner decision: searching is not subscription-gated — exact
 * grams are gated elsewhere). It must never leak an engine or admin field.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '0033_mapper_search_demo_read_model.sql'),
  'utf8',
);

describe('Track F demo search read model migration (0033)', () => {
  it('creates the demo view over mapper_basement, idempotently', () => {
    expect(SQL.includes('create or replace view public.mapper_basement_search_demo')).toBe(true);
    expect(SQL.includes('from public.mapper_basement')).toBe(true);
  });

  it('is filtered to the approved, active library', () => {
    expect(/where\s+is_active\s+and\s+approved_for_base/.test(SQL)).toBe(true);
  });

  it('exposes ONLY the safe display fields', () => {
    for (const col of [
      'ingredient_id',
      'ingredient_name_display',
      'ingredient_name_internal',
      'ingredient_category',
      'ingredient_subcategory',
      'vegan',
      'dairy_free',
      'gluten_free',
      'contains_alcohol',
      'approved_for_engines',
      'dataset_version',
    ]) {
      expect(SQL.includes(col), `expected safe column ${col}`).toBe(true);
    }
  });

  it('leaks NO engine values, composition, dosage, confidence, or admin fields', () => {
    for (const forbidden of [
      'pac_value',
      'pod_value',
      '_percent', // covers every composition percentage column
      'sweetness_factor',
      'freezing_factor',
      'de_value',
      'stabilizer_activity',
      'recommended_dosage',
      'data_confidence',
      'verification_status',
      'verification_source',
      'ean_code',
      'allergens',
      'cost_per_kg',
      'supplier',
      'source_url',
      'screenshot_reference',
      'kcal_per_100g',
      'brix',
    ]) {
      expect(SQL.includes(forbidden), `forbidden field ${forbidden} leaked into 0033`).toBe(false);
    }
    expect(/select\s*\*/i.test(SQL)).toBe(false);
  });

  it('runs with owner rights and is granted to anon AND authenticated, nothing writable', () => {
    expect(SQL.includes('security_invoker = false')).toBe(true);
    expect(/revoke\s+all\s+on\s+public\.mapper_basement_search_demo\s+from\s+public/i.test(SQL)).toBe(true);
    expect(/grant\s+select\s+on\s+public\.mapper_basement_search_demo\s+to\s+anon/i.test(SQL)).toBe(true);
    expect(
      /grant\s+select\s+on\s+public\.mapper_basement_search_demo\s+to\s+authenticated/i.test(SQL),
    ).toBe(true);
    expect(/grant\s+(insert|update|delete|all)/i.test(SQL)).toBe(false);
    expect(/service[_-]?role/i.test(SQL)).toBe(false);
  });

  it('targets staging only and never weakens the base table or the 0032 view', () => {
    expect(SQL.includes('tunabqqrwabacxjcxxkz')).toBe(true); // staging, named as the ONLY target
    expect(/alter\s+table/i.test(SQL)).toBe(false);
    expect(/drop\s+policy/i.test(SQL)).toBe(false);
    expect(/create\s+policy/i.test(SQL)).toBe(false);
    // the rich 0032 view is not redefined here
    expect(SQL.includes('create or replace view public.mapper_basement_search\n')).toBe(false);
  });
});
