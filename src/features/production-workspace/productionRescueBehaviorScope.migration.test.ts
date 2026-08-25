import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825220000_production_rescue_base_behavior_scope.sql',
  ),
  'utf8',
);

describe('Production Rescue Product Behavior scope migration', () => {
  it('validates only the Base behavior scope while retaining the frozen topping payload', () => {
    expect(SQL).toContain('assert_production_rescue_behavior_authority_v1');
    expect(SQL).toContain("'{toppings}'");
    expect(SQL).toContain("'[]'::jsonb");
    expect(SQL).toContain("'BATCH_RESCUE'");
    expect(SQL).not.toMatch(/update\s+public\.recipe_versions/i);
    expect(SQL).not.toMatch(/update\s+public\.mapper_basement/i);
  });

  it('patches both authorization and atomic consumption with fail-closed anchors', () => {
    expect(SQL).toContain('production_create_rescue_authorization_v1');
    expect(SQL).toContain('production_apply_rescue_v1');
    expect(SQL).toContain('Production Rescue behavior-scope anchor drifted');
    expect(SQL).toContain('revoke all on function');
  });
});
