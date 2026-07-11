/**
 * Module 8 — inviteCodes: invite code format, state machine, redemption guard
 * and pool math.
 *
 * LOCKED RULES implemented here (cited as I1..I8 in code):
 *  I1  Format: brand-prefixed grouped code `PIH-XXXX-XXXX` (e.g.
 *      PIH-7K4M-9Q2D) generated from an INJECTED crypto-random source (pure —
 *      no ambient randomness); unambiguous alphabet (no 0/O/1/I/L);
 *      case-insensitive normalization; clearly distinct from partner codes by
 *      the `PIH-` prefix + hyphen grouping.
 *  I2  State machine: available→reserved→sent→redeemed / expired / revoked
 *      only along the legal edges below; illegal transitions throw typed
 *      errors.
 *  I3  Replacement semantics: a slot keeps exactly ONE live code; when a code
 *      goes terminal (redeemed/revoked/expired) a replacement is generated
 *      for the same slot.
 *  I4  Redemption guard (pure) requires: authenticated user + verified email
 *      + exact normalized email match with the reservation + code not
 *      terminal + no prior invite trial EVER (lifetime, unless explicit admin
 *      override flag) + user is not an approved partner + user has no active
 *      paid Home/Pro entitlement. On refusal the code is left unconsumed and
 *      a typed reason is returned.
 *  I5  Successful redemption produces the grant spec
 *      {scope:'home', days: configurable default 30, autoRenew:false,
 *       createsStripeObjects:false, createsCommission:false}.
 *  I6  Pool math: default 5 slots; a repair function computes the
 *      replacements missing to bring every slot back to exactly one live code.
 *
 * Pure + deterministic (randomness only via the injected RNG).
 */

import { BillingDomainError, frozen } from './types';

/** I1: unambiguous alphabet — no 0, O, 1, I, L. 31 symbols. */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;

/** I1: brand prefix distinguishing invite codes from partner codes. */
export const INVITE_CODE_PREFIX = 'PIH' as const;

export const INVITE_CODE_GROUP_LENGTH = 4 as const;
export const INVITE_CODE_GROUP_COUNT = 2 as const;

/** I5: configurable trial length default. */
export const DEFAULT_INVITE_TRIAL_DAYS = 30 as const;

/** I6: default pool size. */
export const DEFAULT_INVITE_POOL_SLOTS = 5 as const;

/**
 * I1: injected random source — returns a uniform integer in [0, maxExclusive).
 * Production passes a crypto-backed implementation; tests pass deterministic
 * stubs. This module never touches Math.random/crypto itself (purity).
 */
export type RandomInt = (maxExclusive: number) => number;

export class InvalidRandomSourceError extends BillingDomainError {
  constructor(detail: string) {
    super('invalid_random_source', `injected RNG misbehaved: ${detail}`);
    this.name = 'InvalidRandomSourceError';
  }
}

/** I1: generate a canonical invite code `PIH-XXXX-XXXX` from the injected RNG. */
export function generateInviteCode(randomInt: RandomInt): string {
  const groups: string[] = [];
  for (let g = 0; g < INVITE_CODE_GROUP_COUNT; g += 1) {
    let group = '';
    for (let i = 0; i < INVITE_CODE_GROUP_LENGTH; i += 1) {
      const index = randomInt(INVITE_CODE_ALPHABET.length);
      if (!Number.isInteger(index) || index < 0 || index >= INVITE_CODE_ALPHABET.length) {
        throw new InvalidRandomSourceError(`index ${String(index)} out of [0, ${INVITE_CODE_ALPHABET.length})`);
      }
      group += INVITE_CODE_ALPHABET.charAt(index);
    }
    groups.push(group);
  }
  return `${INVITE_CODE_PREFIX}-${groups.join('-')}`;
}

export type InviteCodeRefusalReason = 'empty' | 'bad_prefix' | 'bad_shape' | 'invalid_characters';

export type InviteCodeNormalization =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: InviteCodeRefusalReason };

/**
 * I1: case-insensitive normalization to the canonical hyphenated form.
 * Accepts spaces/hyphens/no separators ('pih 7k4m 9q2d', 'PIH7K4M9Q2D', …).
 */
export function normalizeInviteCode(raw: string): InviteCodeNormalization {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (compact.length === 0) {
    return frozen({ ok: false as const, reason: 'empty' as const });
  }
  if (!compact.startsWith(INVITE_CODE_PREFIX)) {
    return frozen({ ok: false as const, reason: 'bad_prefix' as const });
  }
  const body = compact.slice(INVITE_CODE_PREFIX.length);
  if (body.length !== INVITE_CODE_GROUP_LENGTH * INVITE_CODE_GROUP_COUNT) {
    return frozen({ ok: false as const, reason: 'bad_shape' as const });
  }
  for (const char of body) {
    if (!INVITE_CODE_ALPHABET.includes(char)) {
      // I1: 0/O/1/I/L can never appear — they are not in the alphabet.
      return frozen({ ok: false as const, reason: 'invalid_characters' as const });
    }
  }
  const groups: string[] = [];
  for (let g = 0; g < INVITE_CODE_GROUP_COUNT; g += 1) {
    groups.push(body.slice(g * INVITE_CODE_GROUP_LENGTH, (g + 1) * INVITE_CODE_GROUP_LENGTH));
  }
  return frozen({ ok: true as const, code: `${INVITE_CODE_PREFIX}-${groups.join('-')}` });
}

/** I1: quick shape probe — used to route user input away from partner-code paths. */
export function isInviteCodeFormat(raw: string): boolean {
  return normalizeInviteCode(raw).ok;
}

// ---------------------------------------------------------------------------
// I2 — invite code state machine
// ---------------------------------------------------------------------------

export type InviteCodeState = 'available' | 'reserved' | 'sent' | 'redeemed' | 'expired' | 'revoked';

/** I2: terminal states — I3: reaching one of these triggers slot replacement. */
export const INVITE_TERMINAL_STATES: readonly InviteCodeState[] = frozen(['redeemed', 'expired', 'revoked']);

/**
 * I2: legal transitions only. `reserved → available` releases a reservation;
 * expiry/revocation are reachable from every live state; redemption only from
 * a reserved-or-sent code (a redemption requires a reservation email — I4).
 */
export const LEGAL_INVITE_TRANSITIONS: Readonly<Record<InviteCodeState, readonly InviteCodeState[]>> = frozen({
  available: frozen(['reserved', 'expired', 'revoked'] as const),
  reserved: frozen(['sent', 'available', 'redeemed', 'expired', 'revoked'] as const),
  sent: frozen(['redeemed', 'expired', 'revoked'] as const),
  redeemed: frozen([] as const),
  expired: frozen([] as const),
  revoked: frozen([] as const),
});

export class IllegalInviteTransitionError extends BillingDomainError {
  readonly from: InviteCodeState;
  readonly to: InviteCodeState;
  constructor(from: InviteCodeState, to: InviteCodeState) {
    super('illegal_invite_transition', `illegal invite code transition ${from} → ${to}`);
    this.name = 'IllegalInviteTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransitionInvite(from: InviteCodeState, to: InviteCodeState): boolean {
  return LEGAL_INVITE_TRANSITIONS[from].includes(to);
}

export function assertInviteTransition(from: InviteCodeState, to: InviteCodeState): InviteCodeState {
  if (!canTransitionInvite(from, to)) {
    throw new IllegalInviteTransitionError(from, to);
  }
  return to;
}

export function isInviteTerminal(state: InviteCodeState): boolean {
  return INVITE_TERMINAL_STATES.includes(state);
}

// ---------------------------------------------------------------------------
// I4/I5 — redemption guard + grant spec
// ---------------------------------------------------------------------------

/** Email normalization used for the exact-match check (I4): trim + lowercase. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface InviteCodeView {
  readonly state: InviteCodeState;
  /** Normalized email captured at reservation time; null when never reserved. */
  readonly reservedEmailNormalized: string | null;
}

export interface RedeemingUserView {
  readonly authenticated: boolean;
  readonly emailVerified: boolean;
  /** The user's verified email (raw; normalized internally for the match). */
  readonly email: string;
  readonly isApprovedPartner: boolean;
  /** I4: EVER had an invite trial — lifetime flag. */
  readonly hadInviteTrialEver: boolean;
  /** Active paid Home/Pro entitlement right now. */
  readonly hasActivePaidEntitlement: boolean;
}

export type RedemptionRefusalReason =
  | 'not_authenticated'
  | 'email_not_verified'
  | 'code_not_redeemable'
  | 'email_mismatch'
  | 'prior_invite_trial'
  | 'approved_partner_not_eligible'
  | 'active_paid_entitlement';

/** I5: grant produced by a successful redemption. Never touches Stripe/commissions. */
export interface InviteGrantSpec {
  readonly scope: 'home';
  readonly days: number;
  readonly autoRenew: false;
  readonly createsStripeObjects: false;
  readonly createsCommission: false;
}

export type RedemptionDecision =
  | { readonly ok: true; readonly grant: InviteGrantSpec }
  | { readonly ok: false; readonly reason: RedemptionRefusalReason };

/**
 * I4: pure redemption guard. Refusals leave the code unconsumed (the caller
 * must NOT transition the code on a refusal). Check order is deterministic:
 * auth → verified email → code state → reservation email match → lifetime
 * trial → partner → active paid entitlement.
 */
export function canRedeemInvite(
  code: InviteCodeView,
  user: RedeemingUserView,
  options: { readonly trialDays?: number; readonly adminOverrideRepeatTrial?: boolean } = {},
): RedemptionDecision {
  const trialDays = options.trialDays ?? DEFAULT_INVITE_TRIAL_DAYS;
  if (!Number.isInteger(trialDays) || trialDays <= 0) {
    throw new BillingDomainError('invalid_trial_days', `trialDays must be a positive integer, got ${String(trialDays)}`);
  }
  if (!user.authenticated) {
    return frozen({ ok: false as const, reason: 'not_authenticated' as const });
  }
  if (!user.emailVerified) {
    return frozen({ ok: false as const, reason: 'email_not_verified' as const });
  }
  // I4: redeemable only from reserved/sent (never terminal, never unreserved).
  if (isInviteTerminal(code.state) || !canTransitionInvite(code.state, 'redeemed')) {
    return frozen({ ok: false as const, reason: 'code_not_redeemable' as const });
  }
  if (
    code.reservedEmailNormalized === null ||
    normalizeEmail(user.email) !== code.reservedEmailNormalized
  ) {
    return frozen({ ok: false as const, reason: 'email_mismatch' as const });
  }
  if (user.hadInviteTrialEver && options.adminOverrideRepeatTrial !== true) {
    // I4: one invite trial per lifetime unless explicitly admin-overridden.
    return frozen({ ok: false as const, reason: 'prior_invite_trial' as const });
  }
  if (user.isApprovedPartner) {
    return frozen({ ok: false as const, reason: 'approved_partner_not_eligible' as const });
  }
  if (user.hasActivePaidEntitlement) {
    return frozen({ ok: false as const, reason: 'active_paid_entitlement' as const });
  }
  // I5: grant spec — free entitlement only; no Stripe objects, no commission.
  return frozen({
    ok: true as const,
    grant: frozen({
      scope: 'home' as const,
      days: trialDays,
      autoRenew: false as const,
      createsStripeObjects: false as const,
      createsCommission: false as const,
    }),
  });
}

// ---------------------------------------------------------------------------
// I3/I6 — slot replacement + pool repair math
// ---------------------------------------------------------------------------

export interface InviteSlotView {
  readonly slotId: string;
  readonly codes: readonly { readonly code: string; readonly state: InviteCodeState }[];
}

export interface PoolRepairPlan {
  /** New codes to create, one per slot that currently has no live code (I3). */
  readonly replacements: readonly { readonly slotId: string; readonly code: string }[];
  /** Slots violating the exactly-one-live-code invariant with >1 live codes. */
  readonly anomalies: readonly { readonly slotId: string; readonly liveCount: number }[];
}

/** Count of live (non-terminal) codes in a slot. */
export function liveCodeCount(slot: InviteSlotView): number {
  return slot.codes.filter((c) => !isInviteTerminal(c.state)).length;
}

/**
 * I3 + I6: pure pool repair — for a pool of `slotCount` slots (default 5),
 * compute the replacement codes needed so every slot holds exactly one live
 * code. Provided slots keep their own ids; if the pool has fewer than
 * `slotCount` slots, missing slots are synthesized with non-colliding
 * `slot-N` ids. Generated codes avoid collisions with every code already in
 * the pool and with each other (deterministic given the injected RNG).
 */
export function repairInvitePool(
  slots: readonly InviteSlotView[],
  randomInt: RandomInt,
  options: { readonly slotCount?: number } = {},
): PoolRepairPlan {
  const slotCount = options.slotCount ?? DEFAULT_INVITE_POOL_SLOTS;
  if (!Number.isInteger(slotCount) || slotCount <= 0) {
    throw new BillingDomainError('invalid_slot_count', `slotCount must be a positive integer, got ${String(slotCount)}`);
  }
  const existingCodes = new Set<string>();
  const existingSlotIds = new Set<string>();
  for (const slot of slots) {
    existingSlotIds.add(slot.slotId);
    for (const code of slot.codes) existingCodes.add(code.code);
  }

  const nextFreshCode = (): string => {
    let candidate = generateInviteCode(randomInt);
    let guard = 0;
    while (existingCodes.has(candidate)) {
      candidate = generateInviteCode(randomInt);
      guard += 1;
      if (guard > 1000) {
        throw new InvalidRandomSourceError('could not find a collision-free code in 1000 draws');
      }
    }
    existingCodes.add(candidate);
    return candidate;
  };

  const replacements: { slotId: string; code: string }[] = [];
  const anomalies: { slotId: string; liveCount: number }[] = [];

  // Repair existing slots (I3: exactly one live code per slot).
  for (const slot of slots.slice(0, slotCount)) {
    const live = liveCodeCount(slot);
    if (live > 1) {
      anomalies.push({ slotId: slot.slotId, liveCount: live });
    } else if (live === 0) {
      replacements.push({ slotId: slot.slotId, code: nextFreshCode() });
    }
  }

  // I6: top the pool up to slotCount slots with synthesized, non-colliding ids.
  let syntheticIndex = 1;
  for (let missing = slotCount - Math.min(slots.length, slotCount); missing > 0; missing -= 1) {
    let slotId = `slot-${syntheticIndex}`;
    while (existingSlotIds.has(slotId)) {
      syntheticIndex += 1;
      slotId = `slot-${syntheticIndex}`;
    }
    existingSlotIds.add(slotId);
    replacements.push({ slotId, code: nextFreshCode() });
  }

  return frozen({
    replacements: frozen(replacements.map((r) => frozen(r))),
    anomalies: frozen(anomalies.map((a) => frozen(a))),
  });
}
