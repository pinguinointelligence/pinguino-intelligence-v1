import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260821123000_sorbet_multi_main_owner_authority.sql',
  ),
  'utf8',
);

describe('Sorbet Multi-Main owner authority migration', () => {
  it('binds only the three approved exact identities to one 60% group', () => {
    expect(migration).toContain("'main-sorbet-exact-fruit-60-v1'");
    expect(migration).toContain("'multiMainHardLimitPercent', 60");
    expect(migration).toContain("'multiMainRatioPolicy', 'preserve_user_selected_ratio'");
    for (const id of ['PI-ING-001553', 'PI-ING-000369', 'PI-ING-000340']) {
      expect(migration).toContain(`'${id}'`);
    }
    expect(migration).toContain('if v_count <> 3 then');
  });

  it('does not touch Mapper source data or recipe/customer tables', () => {
    expect(migration).not.toMatch(/update\s+(public\.)?mapper_basement/i);
    expect(migration).not.toMatch(/insert\s+into\s+(public\.)?mapper_basement/i);
    expect(migration).not.toMatch(/update\s+(public\.)?(recipes|recipe_versions|products)\b/i);
  });
});
