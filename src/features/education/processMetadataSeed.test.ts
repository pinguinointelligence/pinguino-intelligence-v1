import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..', '..', '..');
const script = resolve(root, 'scripts', 'buildProcessMetadataSeed.mjs');
const migration = resolve(root, 'supabase', 'migrations', '0040_mapper_process_metadata_seed.sql');
const readonlyAssertion = resolve(
  root,
  'supabase',
  'migrations',
  '0041_mapper_process_metadata_readonly_assertion.sql',
);
const expectedSha = 'c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4';

describe('Owner-approved Mapper process companion', () => {
  it('matches the exact source hash, 22-column shape, counts and Mapper 2088 identities', () => {
    const output = execFileSync(process.execPath, [script, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({
      sourceHash: expectedSha,
      rowCount: 2088,
      columnCount: 22,
      uniqueIngredientIds: 2088,
      blankIngredientIds: 0,
      statusCounts: {
        COLD_PROCESS_OK: 636,
        HEAT_REQUIRED_FOR_FUNCTION: 56,
        HEAT_REQUIRED_FOR_SAFETY: 7,
        HEAT_REQUIRED_FOR_BOTH: 0,
        UNKNOWN: 1389,
      },
      mapperRowCount: 2088,
      mapperUniqueIngredientIds: 2088,
      alignmentDifferences: 0,
      outputPath: null,
    });
  });

  it('ships one transactional, fail-closed and client-read-only database import', () => {
    const sql = readFileSync(migration, 'utf8');
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain("process_status = 'UNKNOWN'");
    expect(sql).toContain("verification_status = 'unknown'");
    expect(sql).toContain('Process IDs do not align 1:1 with Mapper 2088');
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain(expectedSha);

    const assertionSql = readFileSync(readonlyAssertion, 'utf8');
    expect(assertionSql).toContain("process_decision = 'COLD_PROCESS_OK') <> 636");
    expect(assertionSql).toContain("process_decision = 'UNKNOWN') <> 1389");
    expect(assertionSql).toContain("manifest.source_columns <> 22");
    expect(assertionSql).toContain("has_table_privilege('authenticated'");
    expect(assertionSql).toContain("cmd <> 'SELECT'");
  });
});
