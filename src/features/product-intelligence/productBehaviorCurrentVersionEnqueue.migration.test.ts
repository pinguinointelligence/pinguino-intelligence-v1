import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110500_product_behavior_current_version_enqueue.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const diagnostics = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110600_product_behavior_fingerprint_diagnostics.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const visibility = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110700_product_behavior_fingerprint_visibility.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('current-version behavior enqueue hotfix', () => {
  it('waits for the canonical current-version pointer before fingerprinting', () => {
    expect(sql).toContain(
      'create or replace function public.enqueue_catalog_product_behavior_entity_change_v1()',
    );
    expect(sql).toContain('join public.products p on p.id=v.product_id');
    expect(sql).toContain('and p.current_version_id=v.id');
    expect(sql).toContain('and p.is_active');
    expect(sql).toContain('and p.merged_into_product_id is null');
    expect(sql.indexOf('and p.current_version_id=v.id')).toBeLessThan(
      sql.indexOf('perform public.enqueue_product_behavior_reclassification_v1('),
    );
  });

  it('keeps fingerprints fail-closed with fact-free invariant diagnostics', () => {
    expect(diagnostics).toContain(
      'create or replace function public.product_behavior_entity_fingerprint_v1(',
    );
    expect(diagnostics).toContain("p_entity_kind='catalog_product_version'");
    expect(diagnostics).toContain('v_version_exists,v_product_exists,v_is_current');
    expect(diagnostics).toContain('classification entity not found (kind=%, id=%, version=%, product=%, current=%)');
    expect(diagnostics).toContain('public.product_behavior_authority_fingerprint_v1()');
  });

  it('uses a fresh command snapshot while ingest creates and classifies one version', () => {
    expect(visibility).toContain(
      'alter function public.product_behavior_entity_fingerprint_v1(text,text) volatile',
    );
    expect(visibility).not.toContain(' stable');
  });
});
