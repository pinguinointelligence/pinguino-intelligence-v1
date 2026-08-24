import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260824170000_picker_commercial_identity_strict_search.sql',
  ),
  'utf8',
);
const EMPTY_EAN_GUARD = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260824171000_strict_search_empty_ean_guard.sql',
  ),
  'utf8',
);

describe('commercial picker identity and strict multi-concept search migration', () => {
  it('projects the immutable commercial product code without changing Mapper data', () => {
    expect(MIGRATION).toContain("'productCode',p.product_code");
    expect(MIGRATION).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(MIGRATION).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
    expect(MIGRATION).not.toMatch(/delete\s+from\s+public\.mapper_basement/i);
  });

  it('requires credible multi-concept identity coverage before a row qualifies', () => {
    expect(MIGRATION).toContain('gellatti_search_match_tier');
    expect(MIGRATION).toContain('v_group_hits = v_group_count');
    expect(MIGRATION).toContain('ceil(v_group_count * 0.75)');
    expect(MIGRATION).toContain('extensions.similarity(v_identity,v_query) >= 0.55');
    expect(MIGRATION).toContain('public.gellatti_search_match_tier(');
    expect(MIGRATION).toContain(')>0');
  });

  it('uses favorite only after textual credibility has been established', () => {
    const filterAt = MIGRATION.indexOf(')>0');
    const orderAt = MIGRATION.indexOf('c.favorite desc');
    expect(filterAt).toBeGreaterThan(-1);
    expect(orderAt).toBeGreaterThan(filterAt);
  });

  it('keeps the accepted single-concept fallback for Baitz and inulina', () => {
    expect(MIGRATION).toContain('if v_group_count = 1 then');
    expect(MIGRATION).toContain('v_search_text like');
  });

  it('never treats a text-only query and a blank stored EAN as an exact barcode match', () => {
    for (const sql of [MIGRATION, EMPTY_EAN_GUARD]) {
      expect(sql).toContain("nullif(regexp_replace(p_query,'\\D','','g'),'') is not null");
    }
    expect(EMPTY_EAN_GUARD).toContain('strict search empty-EAN guard anchor drifted');
  });
});
