import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260825233000_product_scanner_private_visibility.sql',
  ),
  'utf8',
);

describe('product scanner private visibility migration', () => {
  it('makes scanner evidence owner-private before the commercial shared default', () => {
    const scanner = sql.indexOf(
      "p_evidence->>''scannerSchema''=''gellatti_product_scan_v1'' then ''account_private''",
    );
    const sharedDefault = sql.indexOf("else ''shared'' end;", scanner);

    expect(scanner).toBeGreaterThan(-1);
    expect(sharedDefault).toBeGreaterThan(scanner);
  });

  it('preserves the accepted internal visibility rules and shared non-scanner catalogue flow', () => {
    expect(sql).toContain("v_kind in (''internal_subproduct'',''internal_admin'')");
    expect(sql).toContain(
      "v_kind=''internal_admin'' then ''internal'' else ''account_private''",
    );
    expect(sql).toContain("else ''shared'' end;");
  });

  it('patches the one governed ingest signature and fails closed on source drift', () => {
    expect(sql).toContain(
      "'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure",
    );
    expect(sql).toContain('refusing unsafe scanner privacy patch');
    expect(sql).toContain('scanner privacy postcondition failed');
  });

  it('does not mutate products, versions, behavior bindings or Mapper data', () => {
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.products\b/i);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.product_versions\b/i);
    expect(sql).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.product_behavior_bindings\b/i,
    );
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement\b/i);
  });
});
