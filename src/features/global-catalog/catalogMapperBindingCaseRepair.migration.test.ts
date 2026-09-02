import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260815143000_catalog_mapper_binding_case_repair.sql'),
  'utf8',
);
const mapper = readFileSync(
  join(root, 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const search = readFileSync(
  join(root, 'supabase/migrations/20260814110000_product_search_v1.sql'),
  'utf8',
);
const picker = readFileSync(
  join(root, 'src/features/ingredient-builder/ProductPickerPopover.tsx'),
  'utf8',
);

describe('catalog → Mapper case-safe binding repair', () => {
  it('patches both mapping authorities to the governed Verified-prefix vocabulary', () => {
    expect(migration).toContain('classify_catalog_product_behavior_v2(uuid,text)');
    expect(migration).toContain('ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)');
    expect(migration).toContain("lower(coalesce(m.verification_status,'')) like 'verified%'");
    expect(migration).toContain('refusing unsafe patch');
  });

  it('repairs only exact current versions backed by an accepted administrator decision', () => {
    expect(migration).toContain("e.evidence_kind='admin_mapper_decision'");
    expect(migration).toContain("e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id");
    expect(migration).toContain("p.product_kind<>'mapper_reference'");
    expect(migration).toContain("p.mapper_status='matched'");
    expect(migration).toContain('classify_catalog_product_behavior_v2(');
  });

  it('never edits or promotes Mapper Basement rows', () => {
    expect(migration).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
    expect(migration).toContain("lower(coalesce(m.verification_status,'')) like 'verified%'");
    expect(migration).toContain('Estimated/unreviewed rows remain untouched');
  });
});

describe('Watermelon form identity remains fail-closed and form-aware', () => {
  it('projects form and exact stable identities per server result', () => {
    expect(search).toContain('coalesce(b.form_id,m.ingredient_subcategory) product_form');
    expect(search).toContain('m.ingredient_id mapped_ingredient_id');
    for (const attribute of [
      'data-entity-kind',
      'data-product-id',
      'data-product-version-id',
      'data-mapper-id',
      'data-product-form',
      'data-picker-data-confidence',
    ]) {
      expect(picker).toContain(attribute);
    }
  });

  it('keeps Fresh Watermelon Estimated rather than silently equating it to a verified juice', () => {
    expect(mapper).toMatch(
      /PI-ING-000405,watermelon,WATERMELON · Fresh Fruit,[^\r\n]*,fresh_fruit_profile,TRUE,TRUE,Estimated,/
    );
    expect(mapper).toMatch(
      /PI-ING-000360,frozen_watermelon_juice_campisi_citrus,WATERMELON · Campisi Citrus Juice · Frozen,[^\r\n]*,fruit_juice,TRUE,TRUE,Verified,/
    );
  });

  it('keeps the alcoholic and beverage identities separate from fresh fruit', () => {
    expect(mapper).toMatch(
      /PI-ING-001764,malibu_watermelon_21_percent,MALIBU WATERMELON · Flavoured Rum Liqueur · 21% Vol,[^\r\n]*,alcohol,liqueur,TRUE,TRUE,Verified \/ PI Calculated,/
    );
    expect(mapper).toMatch(
      /PI-ING-001787,red_bull_red_edition_watermelon,RED BULL RED EDITION WATERMELON · Beverage,[^\r\n]*,beverage,energy_drink,TRUE,TRUE,Verified \/ PI Calculated,/
    );
    expect(mapper).toMatch(
      /PI-ING-001788,red_bull_red_edition_watermelon_sugarfree,RED BULL RED EDITION WATERMELON SUGARFREE · Beverage,[^\r\n]*,beverage,energy_drink,TRUE,TRUE,Verified \/ PI Calculated,/
    );
  });
});
