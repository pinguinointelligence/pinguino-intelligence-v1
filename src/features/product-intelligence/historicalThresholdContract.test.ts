import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AUTO_IMPORT_FLOOR, NO_WEB_CONFIDENCE } from './productEvidenceConfidence';
import { PROFILE_MATCH_FLOOR } from './mapperValueInference';

describe('historical PI / INTIMPORT threshold contract', () => {
  it('keeps the three independent thresholds explicit', () => {
    expect(PROFILE_MATCH_FLOOR).toBe(0.85);
    expect(AUTO_IMPORT_FLOOR).toBe(85);
    expect(NO_WEB_CONFIDENCE).toBe(90);
  });

  it('does not turn Product Accuracy or 89 into an Engine physics gate', () => {
    const planner = readFileSync(
      new URL('./intimportIntelligence.ts', import.meta.url),
      'utf8',
    );
    const authority = readFileSync(
      new URL('../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts', import.meta.url),
      'utf8',
    );
    expect(planner).not.toContain('admittedByEvidence');
    expect(authority).not.toContain('resolved.engineReady && isAutoImportEligible');
    expect(planner).not.toMatch(/(?:0\.89|>=\s*89|>\s*89)/);
    expect(authority).not.toMatch(/(?:0\.89|>=\s*89|>\s*89)/);
  });
});
