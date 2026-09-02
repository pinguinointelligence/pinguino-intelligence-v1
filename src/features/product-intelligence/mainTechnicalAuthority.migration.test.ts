import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260817110000_main_technical_authority.sql',
), 'utf8');

describe('Main technical authority forward repair', () => {
  it('removes sensory MAIN from Save/version while preserving Production architecture', () => {
    expect(sql).toContain("p_module in (''PRODUCTION'',''PROCESS'',''LABEL'',''MASTER_LABEL'',''EXPORT'',''BATCH_RESCUE'')");
    expect(sql).toContain("then ''MAIN'' else ''STANDARD'' end");
    expect(sql).toContain('assert_recipe_behavior_authority_v1(jsonb,jsonb,text)');
    expect(sql).toContain('Main technical terminal-role patch drifted');
    expect(sql).toContain("coalesce(p_context->>''requestedRole'',''STANDARD'')=''MAIN''");
    expect(sql).toContain('Main policy staleness patch drifted');
  });

  it('does not mutate Mapper data or Engine formulas', () => {
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    expect(sql).not.toContain('calculateRecipe');
  });
});
