import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824211000_product_import_run_safety.sql',
  ),
  'utf8',
);
const resumableRollback = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824215000_product_import_resumable_rollback.sql',
  ),
  'utf8',
);
const resumableReset = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824216000_product_import_resumable_clean_reset.sql',
  ),
  'utf8',
);
const externalSnapshot = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824217000_product_import_external_snapshot_registration.sql',
  ),
  'utf8',
);
const runEdge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/product-import-run/index.ts'),
  'utf8',
);
const catalogEdge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);

describe('durable product import run safety', () => {
  it('persists run identity and one mutation ledger row per source row', () => {
    expect(migration).toContain('create table if not exists public.product_import_runs');
    expect(migration).toContain('create table if not exists public.product_import_run_rows');
    expect(migration).toContain('unique(import_run_id,row_index)');
    expect(migration).toContain('source_fingerprint');
  });

  it('checks cancellation before starting the next atomic row write', () => {
    expect(migration).toContain("if v_run.status='CANCELLING'");
    expect(migration).toContain("raise exception 'import cancellation requested'");
    expect(migration).toContain('v_result:=public.ingest_product_v1(');
    expect(catalogEdge).toContain("service.rpc('ingest_product_import_row_v1'");
    expect(catalogEdge).toContain('import_cancellation_requested');
    expect(catalogEdge).toContain("console.error('catalog_product_ingest_failed'");
    expect(catalogEdge).toContain('code: error.code');
  });

  it('supports targeted rollback and a guarded clean PR reset', () => {
    expect(migration).toContain('rollback_product_import_run_v1');
    expect(migration).toContain('snapshot_and_clean_pr_catalog_v1');
    expect(migration).toContain("v_run.status not in ('CANCELLED','COMPLETED','FAILED')");
    expect(migration).toContain("if v_pi<>2088 then raise exception 'Mapper count guard failed: %',v_pi");
    expect(migration).toContain("where product_code like 'PR-ING-%'");
    expect(resumableRollback).toContain('rollback_product_import_run_batch_v1');
    expect(resumableRollback).toContain('and rolled_back_at is null');
    expect(resumableRollback).toContain("status='ROLLED_BACK'");
    expect(resumableReset).toContain('snapshot_pr_catalog_v1');
    expect(resumableReset).toContain('clean_pr_catalog_batch_v1');
    expect(resumableReset).toContain("reset_status='COMPLETED'");
    expect(externalSnapshot).toContain('register_product_import_external_snapshot_v1');
    expect(externalSnapshot).toContain('PR identity set drifted');
    expect(runEdge).toContain("action === 'rollbackBatch'");
    expect(runEdge).toContain("action === 'cancel'");
  });

  it('blocks clean reimport until PI=2088 and all PR runtime rows are gone', () => {
    expect(migration).toContain('product_import_clean_preflight_v1');
    expect(migration).toContain("'ready',v_pi=2088 and v_pr=0");
    expect(migration).toContain("raise exception 'clean import requires PI=2088 and PR=0'");
  });

  it('preserves Scanner evidence while detaching the deleted PR pointer', () => {
    expect(migration).toContain("'scannerSessionsDetached'");
    expect(migration).toContain('update public.product_scan_sessions set exact_product_id=null');
    expect(migration).not.toContain('delete from public.product_scan_sessions');
  });

  it('never writes the immutable Mapper dataset', () => {
    expect(migration).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
    expect(resumableRollback).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
    expect(resumableReset).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
    expect(externalSnapshot).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
  });
});
