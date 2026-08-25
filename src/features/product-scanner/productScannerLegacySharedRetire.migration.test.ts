import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260825234000_product_scanner_legacy_shared_retire.sql',
  ),
  'utf8',
);

describe('historic shared scanner PM retire authority', () => {
  it('requires creator, PM article, scanner evidence and owner overlay together', () => {
    expect(sql).toContain("p.visibility=''shared''");
    expect(sql).toContain("p.product_code like ''PM-ING-%''");
    expect(sql).toContain('p.created_by=p_actor_user_id');
    expect(sql).toContain('scanner_evidence.owner_user_id=p_actor_user_id');
    expect(sql).toContain(
      "scanner_evidence.evidence->>''scannerSchema''=''gellatti_product_scan_v1''",
    );
    expect(sql).toContain('scanner_overlay.creator_user_id=p_actor_user_id');
  });

  it('preserves owner-private and administrator retire authority', () => {
    expect(sql).toContain(
      "p.visibility=''account_private'' and p.owning_account_id=p_actor_user_id",
    );
    expect(sql).toContain('or v_is_admin');
  });

  it('patches only the governed ingest and fails closed on drift', () => {
    expect(sql).toContain(
      "'public.ingest_product_v1(uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure",
    );
    expect(sql).toContain('refusing unsafe legacy scanner patch');
    expect(sql).toContain('legacy scanner retire postcondition failed');
  });

  it('performs no product, overlay, evidence or Mapper DML', () => {
    for (const table of [
      'products',
      'product_evidence',
      'product_scan_overlay_states',
      'mapper_basement',
    ]) {
      expect(sql).not.toMatch(
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}\\b`, 'i'),
      );
    }
  });
});
