import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260904173339_production_rescue_supersession_audit.sql',
  ),
  'utf8',
);

describe('Production Rescue supersession audit migration', () => {
  it('patches the transactional Apply event without rewriting physical actuals', () => {
    expect(SQL).toContain('production_apply_rescue_v1(uuid,integer,integer,jsonb,jsonb,uuid)');
    expect(SQL).toContain("'supersededRescueRevision'");
    expect(SQL).toContain("'supersededRescueAcceptedAt'");
    expect(SQL).toContain('v_run.rescue_revision');
    expect(SQL).not.toMatch(/update\s+public\.production_run_actuals/i);
    expect(SQL).not.toMatch(/delete\s+from/i);
  });
});
