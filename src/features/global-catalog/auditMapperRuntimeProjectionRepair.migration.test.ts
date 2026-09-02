import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260815153000_mapper_runtime_audit_projection_repair.sql',
  ),
  'utf8',
);

describe('Mapper runtime audit projection repair', () => {
  it('casts live integer confidence into the declared numeric RPC contract', () => {
    expect(sql).toContain('source_confidence numeric');
    expect(sql).toContain('m.data_confidence_percent::numeric');
    expect(sql).toContain('Mapper runtime audit integer-to-numeric projection is missing');
  });

  it('retains the authenticated public-safe function boundary', () => {
    expect(sql).toContain("if auth.uid() is null then raise exception 'authentication required'");
    expect(sql).toContain(
      'revoke all on function public.audit_mapper_runtime_usability_v1() from public,anon',
    );
    expect(sql).toContain(
      'grant execute on function public.audit_mapper_runtime_usability_v1() to authenticated,service_role',
    );
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
  });
});
