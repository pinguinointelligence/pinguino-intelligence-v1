import {
  REFERRAL_QUERY_PARAM,
  clearPendingReferralCode,
  readPendingReferralCode,
  savePendingReferralCode,
  type ReferralClaimReason,
} from '@/services/referral';

/**
 * „Poleć Gellatti” — the missing half of the referral link.
 *
 * The repository already had every piece: the RPC that claims a code, the
 * pending-code locker, and the query parameter a link carries. Nothing read the
 * parameter, so a visitor arriving on `/?ref=CODE` was never attributed to
 * anybody. This is the bridge between them, and nothing else: no second
 * referral store, no second table, no client-side attribution.
 *
 * THE SERVER DECIDES. `gellatti_claim_referral_code_v1` already refuses a
 * self-referral, a code that would overwrite somebody else's referral and a
 * visitor who already carries Partner attribution. Those refusals are final
 * answers, not errors to route around — the browser only carries the code to
 * the RPC and records what it said.
 *
 * This file is pure so the whole decision table can be tested without a DOM,
 * a router or a network.
 */

/** A code is at most this long; anything longer is not a Gellatti code. */
const MAX_CODE_LENGTH = 64;
/** What a referral code may contain. Anything else never reaches storage. */
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The code a URL carries, or null.
 *
 * A query parameter is attacker-controlled, so it is validated before it is
 * ever stored or sent: trimmed, length-capped, and restricted to the characters
 * a code can actually have. A malformed value is dropped silently — the page
 * still works, only the credit is lost, which is the same outcome as a visitor
 * with storage disabled.
 */
export function referralCodeFromSearch(search: string): string | null {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get(REFERRAL_QUERY_PARAM);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const code = raw.trim();
  if (code === '' || code.length > MAX_CODE_LENGTH) return null;
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * What the bridge should do next, given who is asking and what is parked.
 *
 * `capture` stores the code for later; `claim` sends it now. A signed-out
 * visitor never claims — the RPC would answer `not_authenticated`, which tells
 * us nothing we did not already know and spends a request to learn it.
 */
export type ReferralBridgeAction =
  | { kind: 'idle' }
  | { kind: 'capture'; code: string }
  | { kind: 'claim'; code: string };

export function referralBridgeAction(input: {
  readonly authed: boolean;
  /** The code in the current URL, already validated. */
  readonly urlCode: string | null;
  /** The code parked by an earlier visit. */
  readonly pendingCode: string | null;
}): ReferralBridgeAction {
  const { authed, urlCode, pendingCode } = input;
  if (!authed) return urlCode ? { kind: 'capture', code: urlCode } : { kind: 'idle' };
  /* Signed in: a code in the URL is the visitor's current intent and wins over
     one parked earlier, which may be stale. Either way the server decides
     whether it is allowed to take effect. */
  const code = urlCode ?? pendingCode;
  return code ? { kind: 'claim', code } : { kind: 'idle' };
}

/**
 * Whether a parked code should survive this answer.
 *
 * Every reason the RPC can give is a FINAL answer about this code and this
 * visitor — including the refusals. Keeping a code the server has already
 * refused would retry it on every single page load, forever, and never succeed.
 * Only a transport failure leaves the question genuinely unanswered, and that
 * is the one case the code is kept for another attempt.
 */
export function shouldKeepPendingAfter(
  outcome:
    | { readonly kind: 'answered'; readonly reason: ReferralClaimReason }
    | { readonly kind: 'transport-error' },
): boolean {
  if (outcome.kind === 'transport-error') return true;
  /* `not_authenticated` is the one answer that is not about the code: the
     session was lost between the decision and the call, so the visitor may
     still claim it after signing in again. */
  return outcome.reason === 'not_authenticated';
}

/** Park a validated code, replacing whatever was parked before. */
export function captureReferralCode(code: string): void {
  savePendingReferralCode(code);
}

/** Apply the keep/clear decision to the locker. */
export function settlePendingReferralCode(keep: boolean): void {
  if (!keep) clearPendingReferralCode();
}

export { readPendingReferralCode };
