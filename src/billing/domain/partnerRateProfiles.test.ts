import { describe, expect, it } from 'vitest';

import {
  ELITE_DEFAULT_SUGGESTION_RATES,
  InvalidRateProfileError,
  OverlappingRateVersionsError,
  assertEliteRateSet,
  assertNoOverlappingVersions,
  assertRateProfileVersion,
  isVersionInForceAt,
  rateForProductCadence,
  resolveEliteRate,
  selectVersionInForce,
  supersedeRateProfileVersion,
  type EliteRateProfileVersion,
  type EliteRateSet,
} from './partnerRateProfiles';
import { resolveCommission } from './commissionRules';

const JAN = Date.UTC(2026, 0, 1);
const FEB = Date.UTC(2026, 1, 1);
const MAR = Date.UTC(2026, 2, 1);
const APR = Date.UTC(2026, 3, 1);

const RATES_A: EliteRateSet = {
  homeMonthlyCents: 349,
  homeAnnualCents: 2200,
  proMonthlyCents: 799,
  proAnnualCents: 5500,
};

const RATES_B: EliteRateSet = {
  homeMonthlyCents: 399,
  homeAnnualCents: 2600,
  proMonthlyCents: 899,
  proAnnualCents: 6200,
};

function version(overrides: Partial<EliteRateProfileVersion> = {}): EliteRateProfileVersion {
  return {
    versionId: 'v1',
    partnerId: 'partner-1',
    rates: RATES_A,
    effectiveStartUtcMs: JAN,
    effectiveEndUtcMs: null,
    reason: 'strategic partner — negotiated launch terms',
    adminActorId: 'admin-1',
    createdAtUtcMs: JAN,
    priorVersionId: null,
    revokedAtUtcMs: null,
    ...overrides,
  };
}

describe('RP6 — historical Elite values are suggestions only', () => {
  it('exposes the historical 2.99 / 19.00 / 6.99 / 49.00 table as a suggestion', () => {
    expect(ELITE_DEFAULT_SUGGESTION_RATES).toEqual({
      homeMonthlyCents: 299,
      homeAnnualCents: 1900,
      proMonthlyCents: 699,
      proAnnualCents: 4900,
    });
  });

  it('is never applied automatically — a partner with no version is refused, not defaulted', () => {
    const outcome = resolveEliteRate({
      versions: [],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    expect(outcome.resolved).toBe(false);
    if (!outcome.resolved) expect(outcome.reason).toBe('elite_rate_profile_missing');
  });

  it('the suggestion values still match the retained v1 table (historical re-resolution)', () => {
    // RP1/RP6: RATE_TABLE_V1.elite is kept so historical v1 entries stay resolvable.
    expect(resolveCommission('v1', 'home', 'monthly', 'elite').amountCents).toBe(
      ELITE_DEFAULT_SUGGESTION_RATES.homeMonthlyCents,
    );
    expect(resolveCommission('v1', 'pro', 'annual', 'elite').amountCents).toBe(
      ELITE_DEFAULT_SUGGESTION_RATES.proAnnualCents,
    );
  });
});

describe('RP1 — Standard and Gold are untouched by this module', () => {
  it('keeps the locked Standard rates', () => {
    expect(resolveCommission('v1', 'home', 'monthly', 'standard').amountCents).toBe(199);
    expect(resolveCommission('v1', 'home', 'annual', 'standard').amountCents).toBe(900);
    expect(resolveCommission('v1', 'pro', 'monthly', 'standard').amountCents).toBe(499);
    expect(resolveCommission('v1', 'pro', 'annual', 'standard').amountCents).toBe(2900);
  });

  it('keeps the locked Gold rates', () => {
    expect(resolveCommission('v1', 'home', 'monthly', 'gold').amountCents).toBe(249);
    expect(resolveCommission('v1', 'home', 'annual', 'gold').amountCents).toBe(1400);
    expect(resolveCommission('v1', 'pro', 'monthly', 'gold').amountCents).toBe(599);
    expect(resolveCommission('v1', 'pro', 'annual', 'gold').amountCents).toBe(3900);
  });
});

describe('RP2 — per-partner Elite rates', () => {
  it('resolves each of the four (product, cadence) combinations from the partner profile', () => {
    const versions = [version()];
    const at = FEB;
    expect(
      resolveEliteRate({ versions, product: 'home', cadence: 'monthly', atUtcMs: at }),
    ).toMatchObject({
      resolved: true,
      amountCents: 349,
      tier: 'elite',
      currency: 'eur',
      rateProfileVersionId: 'v1',
    });
    expect(
      resolveEliteRate({ versions, product: 'home', cadence: 'annual', atUtcMs: at }),
    ).toMatchObject({
      amountCents: 2200,
    });
    expect(
      resolveEliteRate({ versions, product: 'pro', cadence: 'monthly', atUtcMs: at }),
    ).toMatchObject({
      amountCents: 799,
    });
    expect(
      resolveEliteRate({ versions, product: 'pro', cadence: 'annual', atUtcMs: at }),
    ).toMatchObject({
      amountCents: 5500,
    });
  });

  it('two partners on Elite can hold entirely different rates', () => {
    const a = [version({ partnerId: 'partner-a', versionId: 'a1', rates: RATES_A })];
    const b = [version({ partnerId: 'partner-b', versionId: 'b1', rates: RATES_B })];
    const ra = resolveEliteRate({ versions: a, product: 'pro', cadence: 'annual', atUtcMs: FEB });
    const rb = resolveEliteRate({ versions: b, product: 'pro', cadence: 'annual', atUtcMs: FEB });
    expect(ra.resolved && ra.amountCents).toBe(5500);
    expect(rb.resolved && rb.amountCents).toBe(6200);
  });

  it('rateForProductCadence maps the four slots correctly', () => {
    expect(rateForProductCadence(RATES_A, 'home', 'monthly')).toBe(349);
    expect(rateForProductCadence(RATES_A, 'home', 'annual')).toBe(2200);
    expect(rateForProductCadence(RATES_A, 'pro', 'monthly')).toBe(799);
    expect(rateForProductCadence(RATES_A, 'pro', 'annual')).toBe(5500);
  });
});

describe('RP3 — versioning and supersede', () => {
  it('supersede closes the prior version and opens the successor with no gap and no overlap', () => {
    const prior = version();
    const { closedPrior, next } = supersedeRateProfileVersion({
      prior,
      nextVersionId: 'v2',
      rates: RATES_B,
      effectiveStartUtcMs: MAR,
      reason: 'renegotiated after Q1 volume',
      adminActorId: 'admin-2',
      createdAtUtcMs: MAR,
      note: 'agreed on call 2026-02-27',
    });

    expect(closedPrior.effectiveEndUtcMs).toBe(MAR);
    expect(next.effectiveStartUtcMs).toBe(MAR);
    expect(next.effectiveEndUtcMs).toBeNull();
    expect(next.priorVersionId).toBe('v1');
    expect(next.partnerId).toBe(prior.partnerId);
    expect(next.note).toBe('agreed on call 2026-02-27');
    expect(() => assertNoOverlappingVersions([closedPrior, next])).not.toThrow();
  });

  it('does not mutate the prior version object (append-only)', () => {
    const prior = version();
    supersedeRateProfileVersion({
      prior,
      nextVersionId: 'v2',
      rates: RATES_B,
      effectiveStartUtcMs: MAR,
      reason: 'change',
      adminActorId: 'admin-2',
      createdAtUtcMs: MAR,
    });
    expect(prior.effectiveEndUtcMs).toBeNull();
  });

  it('refuses a successor that would start at or before the prior start', () => {
    expect(() =>
      supersedeRateProfileVersion({
        prior: version(),
        nextVersionId: 'v2',
        rates: RATES_B,
        effectiveStartUtcMs: JAN,
        reason: 'change',
        adminActorId: 'admin-2',
        createdAtUtcMs: JAN,
      }),
    ).toThrow(InvalidRateProfileError);
  });

  it('requires a reason and an admin actor on every version', () => {
    expect(() => assertRateProfileVersion(version({ reason: '   ' }))).toThrow(
      InvalidRateProfileError,
    );
    expect(() => assertRateProfileVersion(version({ adminActorId: '' }))).toThrow(
      InvalidRateProfileError,
    );
  });

  it('refuses an end that is not after the start', () => {
    expect(() => assertRateProfileVersion(version({ effectiveEndUtcMs: JAN }))).toThrow(
      InvalidRateProfileError,
    );
  });

  it('refuses a revocation that predates the start', () => {
    expect(() =>
      assertRateProfileVersion(version({ effectiveStartUtcMs: FEB, revokedAtUtcMs: JAN })),
    ).toThrow(InvalidRateProfileError);
  });
});

describe('RP4 — exactly one version in force at any instant', () => {
  it('rejects two open-ended versions', () => {
    const a = version({ versionId: 'a', effectiveStartUtcMs: JAN });
    const b = version({ versionId: 'b', effectiveStartUtcMs: MAR });
    expect(() => assertNoOverlappingVersions([a, b])).toThrow(OverlappingRateVersionsError);
  });

  it('rejects a successor starting before the prior ends', () => {
    const a = version({ versionId: 'a', effectiveStartUtcMs: JAN, effectiveEndUtcMs: MAR });
    const b = version({ versionId: 'b', effectiveStartUtcMs: FEB });
    expect(() => assertNoOverlappingVersions([a, b])).toThrow(OverlappingRateVersionsError);
  });

  it('accepts touching windows (end is exclusive)', () => {
    const a = version({ versionId: 'a', effectiveStartUtcMs: JAN, effectiveEndUtcMs: MAR });
    const b = version({ versionId: 'b', effectiveStartUtcMs: MAR });
    expect(() => assertNoOverlappingVersions([a, b])).not.toThrow();
  });

  it('resolution throws rather than picking a winner when two versions are live at one instant', () => {
    const a = version({ versionId: 'a', effectiveStartUtcMs: JAN });
    const b = version({ versionId: 'b', effectiveStartUtcMs: FEB });
    expect(() => selectVersionInForce([a, b], MAR)).toThrow(OverlappingRateVersionsError);
  });
});

describe('RP5 — no retroactive rewriting', () => {
  const v1 = version({
    versionId: 'v1',
    effectiveStartUtcMs: JAN,
    effectiveEndUtcMs: MAR,
    rates: RATES_A,
  });
  const v2 = version({
    versionId: 'v2',
    effectiveStartUtcMs: MAR,
    rates: RATES_B,
    priorVersionId: 'v1',
  });

  it('an instant inside the first window still resolves to the first rate after a later version exists', () => {
    const outcome = resolveEliteRate({
      versions: [v1, v2],
      product: 'pro',
      cadence: 'annual',
      atUtcMs: FEB,
    });
    expect(outcome.resolved && outcome.amountCents).toBe(5500);
    expect(outcome.resolved && outcome.rateProfileVersionId).toBe('v1');
  });

  it('an instant inside the second window resolves to the second rate', () => {
    const outcome = resolveEliteRate({
      versions: [v1, v2],
      product: 'pro',
      cadence: 'annual',
      atUtcMs: APR,
    });
    expect(outcome.resolved && outcome.amountCents).toBe(6200);
    expect(outcome.resolved && outcome.rateProfileVersionId).toBe('v2');
  });

  it('resolution is a pure function of the instant — appending history cannot change an earlier answer', () => {
    const before = resolveEliteRate({
      versions: [v1],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    const after = resolveEliteRate({
      versions: [v1, v2],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    expect(after).toEqual(before);
  });

  it('the resolution carries the version id so the ledger can snapshot it', () => {
    const outcome = resolveEliteRate({
      versions: [v1],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    expect(outcome.resolved && outcome.rateProfileVersionId).toBe('v1');
  });

  it('an instant before any version exists is refused, not back-filled', () => {
    const outcome = resolveEliteRate({
      versions: [v1, v2],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: Date.UTC(2025, 11, 1),
    });
    expect(outcome.resolved).toBe(false);
  });
});

describe('RP7 — a missing profile refuses instead of guessing', () => {
  it('refuses when the only version has been revoked', () => {
    const revoked = version({ revokedAtUtcMs: FEB });
    const outcome = resolveEliteRate({
      versions: [revoked],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: MAR,
    });
    expect(outcome.resolved).toBe(false);
    if (!outcome.resolved) expect(outcome.reason).toBe('elite_rate_profile_missing');
  });

  it('still resolves before the revocation instant', () => {
    const revoked = version({ revokedAtUtcMs: MAR });
    const outcome = resolveEliteRate({
      versions: [revoked],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    expect(outcome.resolved && outcome.amountCents).toBe(349);
  });

  it('revocation wins over a later natural end', () => {
    const revoked = version({ effectiveEndUtcMs: APR, revokedAtUtcMs: FEB });
    expect(isVersionInForceAt(revoked, MAR)).toBe(false);
  });

  it('never silently returns a Standard or Gold amount for an elite partner', () => {
    const outcome = resolveEliteRate({
      versions: [],
      product: 'pro',
      cadence: 'annual',
      atUtcMs: FEB,
    });
    expect(outcome.resolved).toBe(false);
    // guards against a regression that falls back to 2900 (standard) or 3900 (gold)
    expect(JSON.stringify(outcome)).not.toContain('2900');
    expect(JSON.stringify(outcome)).not.toContain('3900');
  });
});

describe('RP8 — rate validation', () => {
  it('rejects a zero rate', () => {
    expect(() => assertEliteRateSet({ ...RATES_A, homeMonthlyCents: 0 }, 'rates')).toThrow(
      InvalidRateProfileError,
    );
  });

  it('rejects a negative rate', () => {
    expect(() => assertEliteRateSet({ ...RATES_A, proAnnualCents: -100 }, 'rates')).toThrow();
  });

  it('rejects a fractional rate', () => {
    expect(() => assertEliteRateSet({ ...RATES_A, homeAnnualCents: 19.5 }, 'rates')).toThrow();
  });

  it('accepts a valid set', () => {
    expect(() => assertEliteRateSet(RATES_A, 'rates')).not.toThrow();
    expect(() => assertEliteRateSet(ELITE_DEFAULT_SUGGESTION_RATES, 'rates')).not.toThrow();
  });
});

describe('boundary behaviour', () => {
  it('start is inclusive and end is exclusive', () => {
    const v = version({ effectiveStartUtcMs: FEB, effectiveEndUtcMs: MAR });
    expect(isVersionInForceAt(v, FEB - 1)).toBe(false);
    expect(isVersionInForceAt(v, FEB)).toBe(true);
    expect(isVersionInForceAt(v, MAR - 1)).toBe(true);
    expect(isVersionInForceAt(v, MAR)).toBe(false);
  });

  it('an open-ended version stays in force arbitrarily far into the future', () => {
    expect(isVersionInForceAt(version(), Date.UTC(2099, 0, 1))).toBe(true);
  });

  it('the returned resolution is frozen', () => {
    const outcome = resolveEliteRate({
      versions: [version()],
      product: 'home',
      cadence: 'monthly',
      atUtcMs: FEB,
    });
    expect(Object.isFrozen(outcome)).toBe(true);
  });
});
