import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..', '..');
const script = resolve(root, 'scripts', 'buildProcessMetadataSeed.mjs');
const migration = resolve(
  root,
  'supabase',
  'migrations',
  '20260828170100_mapper_process_metadata_2089.sql',
);
const readonlyAssertion = resolve(
  root,
  'supabase',
  'migrations',
  '20260810165300_mapper_process_metadata_readonly_assertion.sql',
);
const expectedSha = '44fd5302c7a2372bb69ba5abc592edd27f41e96c5de00ac2ca45ade1903ad6d6';
const expectedMapperSha = '5047d9ca645bb2c1e2e930201ab9e82b08a04dc1e48e3263e7ba61930a5da1f5';
const expectedPendingSha = 'b968389b20d44f838e0c4cd611b9bd9875688f89c4dab5877802173ea229d563';

describe('Owner-approved Mapper process companion', () => {
  it('pins the 2089 process cohort and exact 58-ID pending delta against Mapper 2147', () => {
    const output = execFileSync(process.execPath, [script, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({
      sourceHash: expectedSha,
      rowCount: 2089,
      columnCount: 22,
      uniqueIngredientIds: 2089,
      blankIngredientIds: 0,
      statusCounts: {
        COLD_PROCESS_OK: 636,
        HEAT_REQUIRED_FOR_FUNCTION: 57,
        HEAT_REQUIRED_FOR_SAFETY: 7,
        HEAT_REQUIRED_FOR_BOTH: 0,
        UNKNOWN: 1389,
      },
      mapperHash: expectedMapperSha,
      mapperRowCount: 2147,
      mapperUniqueIngredientIds: 2147,
      alignmentDifferences: 58,
      pendingRuntimeAuthorityHash: expectedPendingSha,
      mapperNotYetClassified: 58,
      outputPath: null,
    });
  });

  it('ships one transactional, fail-closed and client-read-only database import', () => {
    const sql = readFileSync(migration, 'utf8');
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain("process_status = 'UNKNOWN'");
    expect(sql).toContain("verification_status = 'unknown'");
    expect(sql).toContain('Process IDs do not align 1:1 with Mapper 2089');
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain(expectedSha);

    const assertionSql = readFileSync(readonlyAssertion, 'utf8');
    expect(assertionSql).toContain("process_decision = 'COLD_PROCESS_OK') <> 636");
    expect(assertionSql).toContain("process_decision = 'UNKNOWN') <> 1389");
    expect(assertionSql).toContain('manifest.source_columns <> 22');
    expect(assertionSql).toContain("has_table_privilege('authenticated'");
    expect(assertionSql).toContain("cmd <> 'SELECT'");
  });
});
