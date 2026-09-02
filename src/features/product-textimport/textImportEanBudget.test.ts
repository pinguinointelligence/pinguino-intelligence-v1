import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const resolver = readFileSync(
  resolve(root, 'supabase/functions/product-textimport-ean-resolve/index.ts'),
  'utf8',
);
const budgetMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260828123000_product_textimport_ean_budget.sql'),
  'utf8',
);

describe('TEXTIMPORT pre-Scanner EAN budget boundary', () => {
  it('reserves a bounded allowance per row and for the complete proof run', () => {
    expect(resolver).toContain('const ROW_WEB_CALL_CAP = 6;');
    expect(resolver).toContain('const RUN_WEB_CALL_CAP = 18;');
    expect(resolver).toContain('const WORST_CASE_WEB_CALLS_PER_REQUEST = 3;');
    expect(resolver).toContain("'gellatti_reserve_textimport_ean_budget_v1'");
    expect(resolver).toContain('p_source_row_id: rowBudgetId');
    expect(resolver).toContain('p_reserved_web_calls: WORST_CASE_WEB_CALLS_PER_REQUEST');
    expect(resolver).not.toContain('p_row_web_call_cap');
    expect(resolver).not.toContain('p_run_web_call_cap');

    expect(budgetMigration).toContain('pg_advisory_xact_lock');
    expect(budgetMigration).toContain('v_row_web_call_cap constant integer:=6;');
    expect(budgetMigration).toContain('v_run_web_call_cap constant integer:=18;');
    expect(budgetMigration).toContain('unique (user_id,run_id,source_row_id,step_key)');
    expect(budgetMigration).toContain(
      'if v_row_reserved+p_reserved_web_calls>v_row_web_call_cap then',
    );
    expect(budgetMigration).toContain(
      'if v_run_reserved+p_reserved_web_calls>v_run_web_call_cap then',
    );
    expect(budgetMigration).toContain("'textimport_ean_row_call_cap_reached'");
    expect(budgetMigration).toContain("'textimport_ean_run_call_cap_reached'");
  });

  it('isolates the existing enrichment allowance by row so one row cannot starve another', () => {
    expect(resolver).toContain('const identityHash =');
    expect(resolver).toContain("query.sourceRowId?.slice(0, 80) ?? 'anonymous'");
    expect(resolver).toContain('const enrichmentImportId = `text-ean-${runHash}-${rowHash}`;');
    expect(resolver).toContain('importId: enrichmentImportId');
    expect(resolver).not.toContain('importId: runId');
    expect(resolver).not.toContain('textimport-ean-${runId}');
  });

  it('reports incomplete research as blocked and emits not-found only after all steps', () => {
    const loopStart = resolver.indexOf('for (const step of steps)');
    const loopEnd = resolver.indexOf('// EAN_NOT_FOUND is possible only here');
    const classifyCall = resolver.indexOf('return json(classify(query, facts, research));');
    expect(loopStart).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(loopStart);
    expect(classifyCall).toBeGreaterThan(loopEnd);
    expect(resolver).toContain("status: 'EAN_RESOLUTION_BLOCKED'");
    expect(resolver.slice(loopStart, loopEnd)).toContain('blocked(');
    expect(resolver.slice(loopStart, loopEnd)).not.toContain("status: 'EAN_NOT_FOUND'");
  });

  it('contains no Scanner, finalizer, Product Intelligence, or product-write logic', () => {
    expect(resolver).not.toMatch(/product-scan-(?:analyze|finalize)/);
    expect(resolver).not.toMatch(/productIntelligence|productAccuracy|productBehavior/i);
    expect(resolver).not.toMatch(
      /\.from\(['"](?:products|product_versions|product_variants)['"]\)/,
    );
  });
});
