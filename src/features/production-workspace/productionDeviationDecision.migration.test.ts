import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825090000_production_deviation_decision_audit.sql',
  ),
  'utf8',
);

describe('Production deviation decision audit migration', () => {
  it('extends the append-only run history without creating a second decision authority', () => {
    expect(SQL).toContain("'deviation_decision_accepted'");
    expect(SQL).toContain('insert into public.production_run_events');
    expect(SQL).not.toMatch(/create\s+table/i);
    expect(SQL).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(SQL).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
  });

  it('records the trusted choice exactly once when its authorization is consumed', () => {
    expect(SQL).toContain('after update of consumed_at');
    expect(SQL).toContain('when (old.consumed_at is null and new.consumed_at is not null)');
    expect(SQL).toContain("'stableOptionId', new.stable_option_id");
    expect(SQL).toContain("'sourceActualRevision', new.source_actual_revision");
    expect(SQL).toContain("'rescueRevision', v_rescue_revision");
    expect(SQL).toContain("'finalMassG', new.safe_metadata->'finalMassG'");
    expect(SQL).toContain("'scoreDisplay', new.safe_metadata->>'scoreDisplay'");
  });

  it('keeps the private authorization table inaccessible to browser roles', () => {
    expect(SQL).toContain('revoke all on function public.production_emit_deviation_decision_v1()');
    expect(SQL).toContain('from public, anon, authenticated, service_role');
    expect(SQL).not.toMatch(/grant\s+.*authenticated/i);
  });
});
