import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827104000_product_reanalysis_admin_integration.sql',
  ),
  'utf8',
);

describe('product reanalysis Admin integration migration', () => {
  it('persists the canonical request type on every specialized ledger row', () => {
    expect(sql).toContain('add column request_type text');
    expect(sql).toContain("default 'PRODUCT_CAPABILITY_REANALYSIS'");
    expect(sql).toContain("request_type='PRODUCT_CAPABILITY_REANALYSIS'");
  });

  it('projects reanalysis through the existing PRODUCT REQUESTS authority', () => {
    expect(sql).toContain('gellatti_admin_product_requests_v1');
    expect(sql).toContain("'requestType',r.request_type");
    for (const field of [
      'requestedCapability',
      'attemptedContext',
      'currentClassification',
      'identitySnapshot',
      'capabilitySnapshot',
      'readinessSnapshot',
      'contributionReference',
      'evidenceReferences',
      'currentAuthority',
    ]) {
      expect(sql).toContain(`'${field}'`);
    }
    expect(sql).toContain("p_status='SUBMITTED' and r.status='OPEN'");
    expect(sql).toContain("p_status='ADMIN_REVIEW' and r.status='IN_REVIEW'");
    expect(sql).toContain(
      'revoke execute on function public.gellatti_admin_product_capability_reanalysis_v1',
    );
  });

  it('counts active reanalysis in the real open and waiting-Admin metrics', () => {
    expect(sql).toContain(
      "from public.product_capability_reanalysis_requests where status in ('OPEN','IN_REVIEW')",
    );
    expect(sql).toContain('gellatti_admin_overview_v1');
    expect(sql).toContain('least(');
  });

  it('does not mutate canonical capability or Mapper while integrating Admin presentation', () => {
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/update\s+public\.products/i);
    expect(sql).not.toMatch(/(?:insert\s+into|update)\s+public\.product_versions/i);
    expect(sql).not.toMatch(/(?:insert\s+into|update)\s+public\.product_behavior_bindings/i);
  });
});
