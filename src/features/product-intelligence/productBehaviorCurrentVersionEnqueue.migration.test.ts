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
});
