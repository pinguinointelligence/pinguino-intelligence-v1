/**
 * Module 10 — partnerCodeSlots: how many public codes a partner may hold, and
 * who owns a code once it stops being current.
 *
 * OWNER OVERRIDE (2026-08-31, WORK WITH US §8). This supersedes the older
 * assumption of ONE public partner code, and it tightens code ownership.
 *
 * `partnerCodes.ts` owns code FORMAT (normalization, length, charset, banned
 * words). This module owns code OWNERSHIP and SLOTS. They are deliberately
 * separate: a code can be perfectly well-formed and still unclaimable.
 *
 * LOCKED RULES implemented here (cited as CS1..CS7 in code):
 *  CS1 A partner holds 0–3 CURRENT public codes. A fourth is refused.
 *  CS2 When a current code is replaced it becomes a historical ALIAS of the
 *      SAME partner — it is never released. Old social posts keep pointing at
 *      the partner who published them.
 *  CS3 Aliases do NOT consume one of the 3 current slots.
 *  CS4 A code is claimable only if NO partner holds it in ANY state (current,
 *      alias or blocked). Case-insensitivity comes from the shared
 *      normalization in partnerCodes.ts.
 *  CS5 A partner MAY reclaim their own alias back into a current slot (subject
 *      to CS1). Another partner may never claim it — this is the whole point
 *      of CS2.
 *  CS6 A blocked code is never claimable by anyone, including its owner: only
 *      an admin can unblock it. Blocking is the compromise/abuse remedy.
 *  CS7 Historical attribution belongs to the immutable partner_id, never to the
 *      code text. Nothing in this module rewrites history — changing a code is
 *      purely a forward-looking routing change.
 *
 * Pure + deterministic: the caller supplies the registry snapshot.
 */

import {
  normalizePartnerCode,
  validatePartnerCode,
  type PartnerCodeRefusalReason,
} from './partnerCodes';
import { frozen } from './types';

/** CS1: the owner's slot ceiling for CURRENT public codes. */
export const MAX_CURRENT_PARTNER_CODES = 3 as const;

/**
 * Ownership state of a code.
 *  - `current` — one of the partner's ≤3 public codes (CS1)
 *  - `alias`   — a retired code still owned by the same partner (CS2/CS3)
 *  - `blocked` — disabled by an admin; unclaimable by anyone (CS6)
 */
export type PartnerCodeState = 'current' | 'alias' | 'blocked';

/** One row of the code registry, as the DB would return it. */
export interface PartnerCodeRecord {
  /** Canonical (already normalized) code text. */
  readonly code: string;
  /** Immutable partner identity — the only thing attribution ever keys on (CS7). */
  readonly partnerId: string;
  readonly state: PartnerCodeState;
}

export type CodeClaimRefusalReason =
  | PartnerCodeRefusalReason
  | 'held_by_another_partner'
  | 'blocked_code'
  | 'slot_limit_reached'
  | 'already_current';

export type CodeClaimOutcome =
  | { readonly ok: true; readonly code: string; readonly reclaimedOwnAlias: boolean }
  | { readonly ok: false; readonly reason: CodeClaimRefusalReason };

/** CS1/CS3: the partner's current codes — aliases and blocked rows do not count. */
export function currentCodesOf(
  registry: readonly PartnerCodeRecord[],
  partnerId: string,
): readonly PartnerCodeRecord[] {
  return registry.filter((row) => row.partnerId === partnerId && row.state === 'current');
}

/** CS1: how many more current codes this partner may add right now. */
export function remainingCodeSlots(
  registry: readonly PartnerCodeRecord[],
  partnerId: string,
): number {
  return Math.max(0, MAX_CURRENT_PARTNER_CODES - currentCodesOf(registry, partnerId).length);
}

/** CS4: find who holds a code, in any state. Normalization makes this case-insensitive. */
export function findCodeHolder(
  registry: readonly PartnerCodeRecord[],
  rawCode: string,
): PartnerCodeRecord | null {
  const normalized = normalizePartnerCode(rawCode);
  return registry.find((row) => normalizePartnerCode(row.code) === normalized) ?? null;
}

/**
 * CS1–CS6: decide whether `partnerId` may take `rawCode` as a CURRENT code.
 *
 * Refusal order is fixed and documented so results are deterministic when more
 * than one condition holds: format → blocked → other partner → already current
 * → slot limit. Format comes first because an invalid code should report *why*
 * it is invalid rather than being masked by an ownership answer.
 */
export function evaluateCodeClaim(input: {
  readonly registry: readonly PartnerCodeRecord[];
  readonly partnerId: string;
  readonly rawCode: string;
  readonly bannedWords?: readonly string[];
}): CodeClaimOutcome {
  const validation = validatePartnerCode(
    input.rawCode,
    input.bannedWords === undefined ? {} : { bannedWords: input.bannedWords },
  );
  if (!validation.ok) {
    return frozen({ ok: false as const, reason: validation.reason });
  }
  const code = validation.code;
  const holder = findCodeHolder(input.registry, code);

  if (holder !== null) {
    // CS6: a blocked code is unclaimable by ANYONE, its owner included.
    if (holder.state === 'blocked') {
      return frozen({ ok: false as const, reason: 'blocked_code' as const });
    }
    // CS4/CS5: another partner's code — current OR alias — is never claimable.
    if (holder.partnerId !== input.partnerId) {
      return frozen({ ok: false as const, reason: 'held_by_another_partner' as const });
    }
    if (holder.state === 'current') {
      return frozen({ ok: false as const, reason: 'already_current' as const });
    }
  }

  // CS1: the slot ceiling applies to reclaiming an own alias too.
  if (remainingCodeSlots(input.registry, input.partnerId) === 0) {
    return frozen({ ok: false as const, reason: 'slot_limit_reached' as const });
  }

  return frozen({
    ok: true as const,
    code,
    // CS5: reclaiming an own alias is allowed and reported, so the caller can
    // flip the existing row rather than inserting a duplicate.
    reclaimedOwnAlias: holder !== null && holder.state === 'alias',
  });
}

/**
 * CS2/CS3/CS7: replace one current code with another for the same partner.
 *
 * The outgoing code becomes an ALIAS of the same partner — never released,
 * never reassigned. Returns the registry rows to write; the caller persists
 * them atomically. Historical attribution is untouched because it keys on
 * partner_id, not on code text.
 */
export function replaceCurrentCode(input: {
  readonly registry: readonly PartnerCodeRecord[];
  readonly partnerId: string;
  readonly outgoingRawCode: string;
  readonly incomingRawCode: string;
  readonly bannedWords?: readonly string[];
}):
  | { readonly ok: true; readonly rows: readonly PartnerCodeRecord[] }
  | { readonly ok: false; readonly reason: CodeClaimRefusalReason | 'outgoing_not_current' } {
  const outgoing = findCodeHolder(input.registry, input.outgoingRawCode);
  if (outgoing === null || outgoing.partnerId !== input.partnerId || outgoing.state !== 'current') {
    return frozen({ ok: false as const, reason: 'outgoing_not_current' as const });
  }

  // Evaluate the incoming code against the registry with the outgoing slot
  // already vacated, so a partner at the 3-code ceiling can still swap.
  const vacated: readonly PartnerCodeRecord[] = input.registry.map((row) =>
    normalizePartnerCode(row.code) === normalizePartnerCode(outgoing.code)
      ? { ...row, state: 'alias' as const }
      : row,
  );
  const claim = evaluateCodeClaim({
    registry: vacated,
    partnerId: input.partnerId,
    rawCode: input.incomingRawCode,
    ...(input.bannedWords === undefined ? {} : { bannedWords: input.bannedWords }),
  });
  if (!claim.ok) return frozen({ ok: false as const, reason: claim.reason });

  const rows: PartnerCodeRecord[] = [
    // CS2: the outgoing code is demoted, never deleted and never released.
    frozen({ code: outgoing.code, partnerId: input.partnerId, state: 'alias' as const }),
    frozen({ code: claim.code, partnerId: input.partnerId, state: 'current' as const }),
  ];
  return frozen({ ok: true as const, rows: frozen(rows) });
}

/**
 * CS4: the set of codes that must be excluded when generating suggestions —
 * every code held by anyone in any state, not merely the current ones.
 * Feed this to `suggestPartnerCode` so a suggestion can never collide with a
 * historical alias.
 */
export function reservedCodeSet(registry: readonly PartnerCodeRecord[]): ReadonlySet<string> {
  return new Set(registry.map((row) => normalizePartnerCode(row.code)));
}
