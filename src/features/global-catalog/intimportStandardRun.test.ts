import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('owner-classified INTIMPORT standard run boundary', () => {
  it('keeps the legacy clean reimport gate while using canonical reuse for the 731-owner workbook', () => {
    const page = read('src/pages/destinations/ProductImportPage.tsx');
    const service = read('src/services/productImportRuns.ts');
    const edge = read('supabase/functions/product-import-run/index.ts');

    expect(page).toContain("mode: ownerClassifiedMode ? 'STANDARD' : 'CLEAN_OWNER_REIMPORT'");
    expect(page).toContain(
      "source === 'intimport' && !ownerClassifiedMode && preflight?.ready !== true",
    );
    expect(page).toContain('ownerMayPersistReview');
    expect(page).toContain("!['INVALID', 'DUPLICATE'].includes(sourceCandidate.state)");
    expect(page).toContain("ownerMayPersistReview && candidate.status === 'skip' ? 'warning'");
    expect(service).toContain("mode: 'STANDARD' | 'CLEAN_OWNER_REIMPORT'");
    expect(service).toContain("startIntimportRun({ ...input, mode: 'CLEAN_OWNER_REIMPORT' })");
    expect(edge).toContain(
      "const mode = body.mode === 'STANDARD' ? 'STANDARD' : 'CLEAN_OWNER_REIMPORT'",
    );
    expect(edge).toContain('p_mode: mode');
  });
});
