/**
 * Module 9 — partnerRateProfiles: per-partner, versioned ELITE commission rate
 * profiles.
 *
 * OWNER OVERRIDE (2026-08-31, WORK WITH US §11). This supersedes the older
 * assumption that every Elite partner shares one fixed rate table.
 *
 * LOCKED RULES implemented here (cited as RP1..RP8 in code):
 *  RP1 Standard and Gold keep the versioned global table (commissionRules.ts).
 *      This module changes NOTHING for them.
 *  RP2 Elite is a PER-PARTNER rate profile: an admin configures HOME monthly,
 *      HOME annual, PRO monthly and PRO annual for that one partner.
 *  RP3 Every profile is VERSIONED. A version records: effective start, optional
 *      effective end, the four rates, reason, admin actor, created-at, optional
 *      note, the prior version it supersedes, and its revocation state.
 *      Versions are APPEND-ONLY — editing a rate creates a new version.
 *  RP4 Exactly one version may be in force at any instant. Overlapping active
 *      windows are a typed construction error, not a silent last-wins.
 *  RP5 NO retroactive rewriting: resolution is always "the version in force at
 *      the instant the commission was earned". A version added later can never
 *      change what an earlier instant resolves to.
 *  RP6 The historical Elite values (2.99 / 19.00 / 6.99 / 49.00) are DEFAULT
 *      SUGGESTIONS ONLY — a starting point for the admin form. They are not a
 *      mandatory rate and are never applied automatically.
 *  RP7 An `elite` partner with NO version in force resolves to a typed refusal
 *      `elite_rate_profile_missing`. It NEVER silently falls back to the old
 *      fixed Elite row, and never silently pays the Standard rate: paying a
 *      wrong amount is worse than deferring the event for an admin to fix.
 *  RP8 Rates must be positive integer cents. Zero is rejected: a zero Elite
 *      rate would silently un-pay a partner, which is an admin mistake worth
 *      refusing at construction.
 *
 * Why `RATE_TABLE_V1.elite` still exists in commissionRules.ts: the ledger is
 * immutable and historical entries reference the rule version in force when
 * they were earned. Deleting the v1 Elite row would make historical v1 Elite
 * entries unresolvable. It is retained for historical re-resolution and as the
 * source of the RP6 suggestion values — it is no longer the forward authority.
 *
 * Pure + deterministic. No IO, no Date.now(), integer cents only.
 */

import {
  BillingDomainError,
  assertIntegerCents,
  assertUtcMs,
  frozen,
  type Cadence,
  type Currency,
  type Product,
  type Tier,
  type UtcMs,
} from './types';

/** The four rates an Elite profile version carries (RP2). */
export interface EliteRateSet {
  readonly homeMonthlyCents: number;
  readonly homeAnnualCents: number;
  readonly proMonthlyCents: number;
  readonly proAnnualCents: number;
}

/**
 * RP6: the historical Elite table, offered as a DEFAULT SUGGESTION in the admin
 * form only. Never applied automatically (RP7).
 */
export const ELITE_DEFAULT_SUGGESTION_RATES: EliteRateSet = frozen({
  homeMonthlyCents: 299,
  homeAnnualCents: 1900,
  proMonthlyCents: 699,
  proAnnualCents: 4900,
});

/** RP3: one immutable, versioned Elite rate record for one partner. */
export interface EliteRateProfileVersion {
  readonly versionId: string;
  readonly partnerId: string;
  readonly rates: EliteRateSet;
  /** Inclusive start instant of this version's authority. */
  readonly effectiveStartUtcMs: UtcMs;
  /** Exclusive end instant, or null while open-ended. */
  readonly effectiveEndUtcMs: UtcMs | null;
  /** Why this rate was granted or changed — required for audit. */
  readonly reason: string;
  /** The admin who created this version. */
  readonly adminActorId: string;
  readonly createdAtUtcMs: UtcMs;
  readonly note?: string;
  /** The version this one supersedes, or null for the first. */
  readonly priorVersionId: string | null;
  /** Set when the version was revoked before its natural end. */
  readonly revokedAtUtcMs: UtcMs | null;
  readonly revokedReason?: string;
}

export class InvalidRateProfileError extends BillingDomainError {
  constructor(message: string) {
    super('invalid_rate_profile', message);
    this.name = 'InvalidRateProfileError';
  }
}

export class OverlappingRateVersionsError extends BillingDomainError {
  constructor(a: string, b: string) {
    super('overlapping_rate_versions', `elite rate versions '${a}' and '${b}' overlap in time`);
    this.name = 'OverlappingRateVersionsError';
  }
}

/** RP8: every rate must be a positive integer number of cents. */
export function assertEliteRateSet(rates: EliteRateSet, context: string): void {
  const entries: ReadonlyArray<readonly [string, number]> = [
    ['homeMonthlyCents', rates.homeMonthlyCents],
    ['homeAnnualCents', rates.homeAnnualCents],
    ['proMonthlyCents', rates.proMonthlyCents],
    ['proAnnualCents', rates.proAnnualCents],
  ];
  for (const [field, value] of entries) {
    assertIntegerCents(value, `${context}.${field}`);
    if (value <= 0) {
      // RP8: zero would silently un-pay the partner.
      throw new InvalidRateProfileError(
        `${context}.${field}: expected positive cents, got ${value}`,
      );
    }
  }
}

/**
 * RP3/RP4: validate one version in isolation. Start must precede end; a
 * revocation must not predate the start.
 */
export function assertRateProfileVersion(version: EliteRateProfileVersion): void {
  assertUtcMs(version.effectiveStartUtcMs, 'effectiveStartUtcMs');
  assertUtcMs(version.createdAtUtcMs, 'createdAtUtcMs');
  assertEliteRateSet(version.rates, `version '${version.versionId}' rates`);
  if (version.reason.trim() === '') {
    throw new InvalidRateProfileError(`version '${version.versionId}': reason is required`);
  }
  if (version.adminActorId.trim() === '') {
    throw new InvalidRateProfileError(`version '${version.versionId}': adminActorId is required`);
  }
  if (version.effectiveEndUtcMs !== null) {
    assertUtcMs(version.effectiveEndUtcMs, 'effectiveEndUtcMs');
    if (version.effectiveEndUtcMs <= version.effectiveStartUtcMs) {
      throw new InvalidRateProfileError(
        `version '${version.versionId}': effectiveEnd must be after effectiveStart`,
      );
    }
  }
  if (version.revokedAtUtcMs !== null) {
    assertUtcMs(version.revokedAtUtcMs, 'revokedAtUtcMs');
    if (version.revokedAtUtcMs < version.effectiveStartUtcMs) {
      throw new InvalidRateProfileError(
        `version '${version.versionId}': revokedAt cannot precede effectiveStart`,
      );
    }
  }
}

/**
 * The instant at which a version stops having authority: its revocation if it
 * was revoked early, otherwise its natural end, otherwise open-ended (null).
 */
function effectiveTerminationUtcMs(version: EliteRateProfileVersion): UtcMs | null {
  const { revokedAtUtcMs, effectiveEndUtcMs } = version;
  if (revokedAtUtcMs === null) return effectiveEndUtcMs;
  if (effectiveEndUtcMs === null) return revokedAtUtcMs;
  return Math.min(revokedAtUtcMs, effectiveEndUtcMs);
}

/** True while `version` has authority at `atUtcMs` (start inclusive, end exclusive). */
export function isVersionInForceAt(version: EliteRateProfileVersion, atUtcMs: UtcMs): boolean {
  if (atUtcMs < version.effectiveStartUtcMs) return false;
  const end = effectiveTerminationUtcMs(version);
  return end === null || atUtcMs < end;
}

/**
 * RP4: assert that no two versions claim authority over the same instant.
 * Checked against the version's own start/end, ignoring revocation — a
 * revocation narrows a window, so overlapping *declared* windows are still an
 * authoring error worth refusing.
 */
export function assertNoOverlappingVersions(versions: readonly EliteRateProfileVersion[]): void {
  const sorted = [...versions].sort((a, b) => a.effectiveStartUtcMs - b.effectiveStartUtcMs);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    // Both indices are inside the loop bounds; the guard exists because the
    // build indexes arrays as possibly-undefined, and an assertion would trade
    // a compile-time check for a runtime crash.
    if (previous === undefined || current === undefined) continue;
    if (
      previous.effectiveEndUtcMs === null ||
      current.effectiveStartUtcMs < previous.effectiveEndUtcMs
    ) {
      throw new OverlappingRateVersionsError(previous.versionId, current.versionId);
    }
  }
}

/**
 * RP5: the version in force at `atUtcMs`, or null. Resolution depends only on
 * the instant asked about, so a version appended later can never change what an
 * earlier instant resolves to.
 */
export function selectVersionInForce(
  versions: readonly EliteRateProfileVersion[],
  atUtcMs: UtcMs,
): EliteRateProfileVersion | null {
  assertUtcMs(atUtcMs, 'atUtcMs');
  const inForce = versions.filter((version) => isVersionInForceAt(version, atUtcMs));
  if (inForce.length === 0) return null;
  const [a, b] = inForce;
  if (a === undefined) return null;
  if (b !== undefined) {
    // RP4: two live versions at one instant is a data error, never last-wins.
    throw new OverlappingRateVersionsError(a.versionId, b.versionId);
  }
  return a;
}

/** Pick the single rate for (product, cadence) out of a version's four rates. */
export function rateForProductCadence(
  rates: EliteRateSet,
  product: Product,
  cadence: Cadence,
): number {
  if (product === 'home') {
    return cadence === 'monthly' ? rates.homeMonthlyCents : rates.homeAnnualCents;
  }
  return cadence === 'monthly' ? rates.proMonthlyCents : rates.proAnnualCents;
}

/** The rate snapshot an elite resolution produces (mirrors CommissionRateSnapshot). */
export interface EliteRateResolution {
  readonly resolved: true;
  readonly product: Product;
  readonly cadence: Cadence;
  readonly tier: Extract<Tier, 'elite'>;
  readonly amountCents: number;
  readonly currency: Currency;
  /** RP3/RP5: the exact version that produced this amount — snapshotted onto the ledger entry. */
  readonly rateProfileVersionId: string;
}

export type EliteRateRefusalReason = 'elite_rate_profile_missing';

export type EliteRateOutcome =
  | EliteRateResolution
  | { readonly resolved: false; readonly reason: EliteRateRefusalReason };

/**
 * RP2/RP5/RP7: resolve an ELITE partner's rate for one commissionable payment.
 *
 * `atUtcMs` must be the instant the commission was EARNED, not "now" — that is
 * what makes RP5 (no retroactive rewriting) hold.
 *
 * Returns a typed refusal rather than throwing when no version is in force, so
 * the webhook caller can defer the event for an admin to fix instead of paying
 * a wrong amount (RP7).
 */
export function resolveEliteRate(input: {
  readonly versions: readonly EliteRateProfileVersion[];
  readonly product: Product;
  readonly cadence: Cadence;
  readonly atUtcMs: UtcMs;
}): EliteRateOutcome {
  const version = selectVersionInForce(input.versions, input.atUtcMs);
  if (version === null) {
    return frozen({ resolved: false as const, reason: 'elite_rate_profile_missing' as const });
  }
  return frozen({
    resolved: true as const,
    product: input.product,
    cadence: input.cadence,
    tier: 'elite' as const,
    amountCents: rateForProductCadence(version.rates, input.product, input.cadence),
    currency: 'eur' as const,
    rateProfileVersionId: version.versionId,
  });
}

/**
 * RP3: build the successor version when an admin edits an Elite partner's
 * rates. The prior version is closed at `effectiveStartUtcMs` (exclusive end),
 * so the two never overlap (RP4) and history is preserved rather than edited.
 *
 * Returns both rows: the caller persists them in one transaction.
 */
export function supersedeRateProfileVersion(input: {
  readonly prior: EliteRateProfileVersion;
  readonly nextVersionId: string;
  readonly rates: EliteRateSet;
  readonly effectiveStartUtcMs: UtcMs;
  readonly reason: string;
  readonly adminActorId: string;
  readonly createdAtUtcMs: UtcMs;
  readonly note?: string;
}): { readonly closedPrior: EliteRateProfileVersion; readonly next: EliteRateProfileVersion } {
  assertUtcMs(input.effectiveStartUtcMs, 'effectiveStartUtcMs');
  if (input.effectiveStartUtcMs <= input.prior.effectiveStartUtcMs) {
    throw new InvalidRateProfileError(
      'successor must start strictly after the version it supersedes',
    );
  }
  const priorEnd = input.prior.effectiveEndUtcMs;
  if (priorEnd !== null && priorEnd < input.effectiveStartUtcMs) {
    throw new InvalidRateProfileError(
      'prior version already ended before the successor starts — nothing to supersede',
    );
  }
  const closedPrior: EliteRateProfileVersion = frozen({
    ...input.prior,
    effectiveEndUtcMs: input.effectiveStartUtcMs,
  });
  const next: EliteRateProfileVersion = frozen({
    versionId: input.nextVersionId,
    partnerId: input.prior.partnerId,
    rates: frozen({ ...input.rates }),
    effectiveStartUtcMs: input.effectiveStartUtcMs,
    effectiveEndUtcMs: null,
    reason: input.reason,
    adminActorId: input.adminActorId,
    createdAtUtcMs: input.createdAtUtcMs,
    ...(input.note === undefined ? {} : { note: input.note }),
    priorVersionId: input.prior.versionId,
    revokedAtUtcMs: null,
  });
  assertRateProfileVersion(next);
  assertNoOverlappingVersions([closedPrior, next]);
  return frozen({ closedPrior, next });
}
