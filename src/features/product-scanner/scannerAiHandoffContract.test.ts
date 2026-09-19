import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const ENRICH = fs.readFileSync(
  path.join(root, 'supabase/functions/intimport-enrich/index.ts'),
  'utf8',
);
const FINALIZE = fs.readFileSync(
  path.join(root, 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);

describe('Scanner accumulated-evidence AI contract', () => {
  it('SCN-AI-04 sanitizes the packet again at the provider boundary and marks it untrusted', () => {
    expect(ENRICH).toContain('sanitizeAccumulatedScannerEvidence(body.accumulatedEvidence)');
    expect(ENRICH).toContain('UNTRUSTED PRODUCT DATA');
    expect(ENRICH).toContain('never instructions');
    expect(ENRICH).toContain('accumulatedEvidence');
  });

  it('SCN-AI-05 re-runs deterministic Recognition and Mapper authority after a stronger merge', () => {
    expect(FINALIZE).toContain('serverTargetedScannerResearch({');
    expect(FINALIZE).toContain('scanResultFromLookupFacts(');
    expect(FINALIZE).toContain('mergeProductScanResults(');
    expect(FINALIZE).toContain('recomputeProductAuthorities');
    expect(FINALIZE).toContain('researchOutcome.applied');
  });
});
