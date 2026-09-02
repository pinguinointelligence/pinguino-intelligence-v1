import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260820213000_owner_formulation_policies.sql'),
  'utf8',
);
const RUNTIME_PROJECTION_SQL = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260820223000_owner_formulation_policy_runtime_projection.sql',
  ),
  'utf8',
);

describe('owner formulation policy migration', () => {
  it('publishes exact Inulin authority without rewriting canonical Mapper source data', () => {
    expect(SQL).toContain('PI-ING-000456');
    expect(SQL).toContain('owner-approved Gellatti formulation policy');
    expect(SQL).toContain("'minPercent',2");
    expect(SQL).toContain("'preferredPercent',4");
    expect(SQL).toContain("'maxPercent',8");
    expect(SQL).toContain("'presenceSemantics','optional_zero_or_range'");
    expect(SQL).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(SQL).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
  });

  it('keeps policy writes server-owned and creates a fresh exact binding', () => {
    expect(SQL).toContain('enable row level security');
    expect(SQL).toContain('revoke all on table public.owner_product_dosage_policy_versions');
    expect(SQL).toContain("classify_mapper_product_behavior_v2('PI-ING-000456'");
  });

  it('projects the selected Owner dose into the resolver sharedFacts envelope', () => {
    expect(RUNTIME_PROJECTION_SQL).toContain(
      'v_mapper_recommended_dose:=coalesce(v_owner_recommended_dose,v_mapper_recommended_dose);',
    );
    expect(RUNTIME_PROJECTION_SQL).toContain("'{recommendedDose}'");
    expect(RUNTIME_PROJECTION_SQL).toContain(
      "coalesce(v_mapper_recommended_dose,''null''::jsonb)",
    );
    expect(RUNTIME_PROJECTION_SQL).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(RUNTIME_PROJECTION_SQL).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
  });
});
