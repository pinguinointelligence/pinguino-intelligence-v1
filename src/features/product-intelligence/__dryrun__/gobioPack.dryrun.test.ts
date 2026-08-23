import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '@/features/product-intelligence/intimportIntelligence';
import { buildMapperKnowledge } from '@/features/product-intelligence/mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from '@/features/product-intelligence/__dryrun__/mapperFixture';
const F = join(homedir(), 'Desktop', 'PL_Poland.csv');
describe.runIf(existsSync(F) && existsSync(MAPPER_FILE))('goBIO baseline', () => {
  it('measures', () => {
    const m = loadMapperKnowledgeRows();
    const k = buildMapperKnowledge(m.rows, m.fingerprint);
    const parsed = parseINTIMPORT(readFileSync(F, 'utf8'));
    const g = parsed.candidates.filter((c) =>
      `${c.source.Brand ?? ''}${c.source.Manufacturer ?? ''}`.toLowerCase().includes('gobio'));
    const { rows } = runIntimportLocalIntelligence(g, {}, k);
    const out = {
      products: rows.length,
      ready: rows.filter((r) => r.workingValues?.valueReadiness === 'READY').length,
      estimatedReady: rows.filter((r) => r.workingValues?.valueReadiness === 'ESTIMATED_READY').length,
      review: rows.filter((r) => r.workingValues?.valueReadiness === 'REVIEW').length,
      mapperContributed: rows.filter((r) => (r.workingValues?.mapperTiersUsed.length ?? 0) > 0).length,
      withDeclaredNutrition: g.filter((c) => c.nutritionBasis === 'per_100g').length,
      per100ml: g.filter((c) => c.nutritionBasis === 'per_100ml').length,
      withGtin: g.filter((c) => c.ean !== null).length,
    };
    writeFileSync(resolve(__dirname, '../../../../docs/products/gobio_baseline.json'), `${JSON.stringify(out, null, 2)}\n`);
    expect(out.products).toBeGreaterThan(0);
  });
});
