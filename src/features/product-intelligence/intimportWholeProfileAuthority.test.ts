import { describe, expect, it } from 'vitest';
import type { ProfileMatchInput } from './mapperValueInference';
import {
  validateIntimportWholeProfileProposal,
  type IntimportMapperAuthorityRow,
} from '../../../supabase/functions/_shared/intimportWholeProfileAuthority';

const baseRow = (
  overrides: Partial<IntimportMapperAuthorityRow> = {},
): IntimportMapperAuthorityRow => ({
  ingredient_id: 'PI-ING-TEST-001',
  ingredient_name_internal: 'inulin',
  ingredient_name_display: 'INULIN',
  brand: null,
  ingredient_category: 'fiber',
  ingredient_subcategory: 'inulin',
  is_active: true,
  approved_for_base: true,
  approved_for_engines: true,
  verification_status: 'Verified',
  ean_code: null,
  water_percent: 5,
  total_solids_percent: 95,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 8,
  total_sugars_percent: 0,
  sucrose_percent: 0,
  dextrose_percent: 0,
  glucose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 87,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 180,
  pod_value: 0,
  pac_value: 0,
  sweetness_factor: 0,
  freezing_factor: 0,
  ...overrides,
});

const input = (overrides: Partial<ProfileMatchInput> = {}): ProfileMatchInput => ({
  name: 'inulin',
  variant: null,
  brand: null,
  category: 'fiber',
  subcategory: 'inulin',
  barcode: null,
  knownMacros: {},
  technical: true,
  ...overrides,
});

const validate = (
  row: IntimportMapperAuthorityRow,
  matchInput: ProfileMatchInput = input(),
  proposedMapperIngredientId = row.ingredient_id,
) =>
  validateIntimportWholeProfileProposal({
    proposedMapperIngredientId,
    matchInput,
    rows: [row],
  });

describe('INTIMPORT whole-profile target authority', () => {
  it('accepts the canonical Verified label', () => {
    expect(validate(baseRow())).toMatchObject({
      authority: 'INTIMPORT_WHOLE_PROFILE_MATCH',
      mapperIngredientId: 'PI-ING-TEST-001',
    });
  });

  it('accepts a governed Verified / Public Label target', () => {
    expect(validate(baseRow({ verification_status: 'Verified / Public Label' }))).not.toBeNull();
  });

  it('normalizes surrounding whitespace before applying the Verified prefix', () => {
    expect(
      validate(baseRow({ verification_status: '  Verified / Public Label  ' })),
    ).not.toBeNull();
  });

  it('rejects a non-Verified target', () => {
    expect(validate(baseRow({ verification_status: 'Estimated' }))).toBeNull();
  });

  it('rejects an inactive target', () => {
    expect(validate(baseRow({ is_active: false }))).toBeNull();
  });

  it('rejects approved_for_base=false', () => {
    expect(validate(baseRow({ approved_for_base: false }))).toBeNull();
  });

  it('rejects approved_for_engines=false', () => {
    expect(validate(baseRow({ approved_for_engines: false }))).toBeNull();
  });
});

describe('INTIMPORT whole-profile match validation', () => {
  it('accepts a server-recomputed profile at or above the 85% floor', () => {
    const authority = validate(baseRow());
    expect(authority?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(authority?.hardContradiction).toBe(false);
  });

  it('rejects a profile below the 85% floor', () => {
    const weak = baseRow({
      ingredient_name_internal: 'neutral product',
      ingredient_name_display: 'NEUTRAL PRODUCT',
      ingredient_category: null,
      ingredient_subcategory: null,
    });
    expect(validate(weak, input({ name: 'unknown product', category: null, subcategory: null }))).toBeNull();
  });

  it('rejects a hard family/category contradiction', () => {
    const beverage = baseRow({
      ingredient_name_internal: 'cola drink',
      ingredient_name_display: 'COLA DRINK',
      ingredient_category: 'beverage',
      ingredient_subcategory: 'soft_drink',
    });
    expect(
      validate(
        beverage,
        input({ name: 'mleko', category: 'dairy', subcategory: 'milk', technical: false }),
      ),
    ).toBeNull();
  });

  it('rejects a different ID than the exact server-selected donor', () => {
    expect(validate(baseRow(), input(), 'PI-ING-SPOOFED')).toBeNull();
  });
});
