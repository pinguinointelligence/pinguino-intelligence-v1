import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825234000_production_rescue_decimal_targets.sql',
  ),
  'utf8',
);

describe('Production Rescue decimal target migration', () => {
  it('accepts Engine-authorized 0.1 g targets while preserving non-negative and exact-vector gates', () => {
    expect(SQL).toContain('production_apply_rescue_v1');
    expect(SQL).toContain("(item->>'planned_grams')::numeric * 10");
    expect(SQL).toContain('non-negative practical 0.1 g increments');
    expect(SQL).toContain('rescue target batch must equal its complete Base vector');
    expect(SQL).not.toMatch(/update\s+public\.recipe_versions/i);
    expect(SQL).not.toMatch(/update\s+public\.mapper_basement/i);
  });

  it('patches the existing function only when both whole-gram anchors still match', () => {
    expect(SQL).toContain('Production Rescue decimal-target anchor drifted');
    expect(SQL).toContain('pg_get_functiondef');
    expect(SQL).toContain('strpos(v_definition, v_old_precision) = 0');
    expect(SQL).toContain('strpos(v_definition, v_old_message) = 0');
  });
});
