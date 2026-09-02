import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814110100_mapper_reference_behavior_repair.sql',
  ),
  'utf8',
);

describe('canonical Mapper reference behavior repair', () => {
  it('routes mapper_reference root changes back through the Mapper classifier', () => {
    expect(migration).toContain("v_product_kind='mapper_reference'");
    expect(migration).toContain("'mapper',v_mapper_ingredient_id,tg_table_name||'_changed'");
    expect(migration).toContain("'catalog_product_version',v_version::text");
    expect(migration).not.toContain("update public.mapper_basement");
  });

  it('supersedes stale catalog jobs before republishing all Mapper bindings', () => {
    expect(migration).toContain(
      'lock table public.product_behavior_reclassification_queue in share row exclusive mode',
    );
    const supersede = migration.indexOf("'product-behavior:catalog_product_version:'");
    const enqueueMapper = migration.indexOf("'mapper',v_mapper_id,'mapper_reference_root_repair'");
    expect(supersede).toBeGreaterThan(0);
    expect(enqueueMapper).toBeGreaterThan(supersede);
    expect(migration).toContain("jsonb_build_object('stage','superseded'");
    expect(migration).toContain('process_product_behavior_reclassification_queue_v1(250)');
  });

  it('fails the migration unless every active Mapper root has its exact current binding', () => {
    expect(migration).toContain("p.normalized_identity='mapper:'||m.ingredient_id");
    expect(migration).toContain('b.mapper_ingredient_id is distinct from m.ingredient_id');
    expect(migration).toContain("b.classifier_version not like 'product-behavior-layered-v2-%'");
    expect(migration).toContain("raise exception 'canonical Mapper behavior repair is incomplete'");
    expect(migration).toContain("raise exception 'mapper_reference still has a catalog classification job'");
    expect(migration).toContain("raise exception 'Mapper behavior repair contains unfinished jobs'");
  });
});
