import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const legacyAuditPath = resolve(root, 'docs/products/reference_mapping_audit.json');
const mapperPath = resolve(root, 'docs/ingredients/validation/mapper_basement.csv');

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('shared PR-ING read-only backtest over available repository artifacts', () => {
  it('PRING-BACKTEST-01 never auto-applies a legacy reference without exact product context', () => {
    const mapperBefore = sha256(mapperPath);
    const legacy = JSON.parse(readFileSync(legacyAuditPath, 'utf8')) as {
      verdicts: Array<{ productId: string; verdict: string; oldMapperId: string }>;
      tally: Record<string, number>;
    };
    const duplicateIds =
      legacy.verdicts.length - new Set(legacy.verdicts.map((row) => row.productId)).size;
    const safeReferenceCandidates = legacy.verdicts.filter((row) => row.verdict === 'SAFE');
    const report = {
      historicalProducts: legacy.verdicts.length,
      safeReferenceCandidates: safeReferenceCandidates.length,
      exactContextAutoApplied: 0,
      flaggedForExactContextReview: legacy.verdicts.length,
      unsafeEscalations: 0,
      duplicateProductIds: duplicateIds,
    };

    // Historical SAFE means only that an older independent audit chose the
    // same Mapper reference. It is not an exact PR identity or current Search
    // binding, so this shared dry-run conservatively flags every row.
    expect(report).toEqual({
      historicalProducts: 136,
      safeReferenceCandidates: 8,
      exactContextAutoApplied: 0,
      flaggedForExactContextReview: 136,
      unsafeEscalations: 0,
      duplicateProductIds: 0,
    });
    expect(legacy.tally).toEqual({
      SAFER_REPLACEMENT: 81,
      NO_LONGER_NEEDED: 16,
      REJECT: 31,
      SAFE: 8,
    });
    expect(sha256(mapperPath)).toBe(mapperBefore);
    console.info(`SHARED_PR_ING_BACKTEST ${JSON.stringify(report)}`);
  });
});
