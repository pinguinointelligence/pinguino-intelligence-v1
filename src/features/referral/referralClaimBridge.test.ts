import { describe, expect, it } from 'vitest';
import {
  referralBridgeAction,
  referralCodeFromSearch,
  shouldKeepPendingAfter,
} from './referralClaimBridge';

/**
 * GAP 3 (owner 2026-09-19) — `/?ref=CODE` reached nothing.
 *
 * `claimReferralCode`, the pending locker and `REFERRAL_QUERY_PARAM` all
 * existed; no entry path read them, so every referral link in the wild credited
 * nobody. These contracts pin the decision table that now joins them, and in
 * particular the two ways it can silently rot: claiming while signed out (which
 * spends the code on a `not_authenticated` answer) and keeping a code the
 * server has already refused (which retries forever).
 */

describe('what a URL carries', () => {
  it('reads the code a referral link actually uses', () => {
    expect(referralCodeFromSearch('?ref=GVLN474V')).toBe('GVLN474V');
    expect(referralCodeFromSearch('?utm=x&ref=ania-yt&z=1')).toBe('ania-yt');
  });

  it('is absent when there is no referral in the URL', () => {
    expect(referralCodeFromSearch('')).toBeNull();
    expect(referralCodeFromSearch('?utm_source=newsletter')).toBeNull();
  });

  it('refuses a value that cannot be a code instead of storing it', () => {
    // A query parameter is attacker-controlled. None of these may reach
    // storage or the RPC.
    expect(referralCodeFromSearch('?ref=')).toBeNull();
    expect(referralCodeFromSearch('?ref=%20%20')).toBeNull();
    expect(referralCodeFromSearch('?ref=' + encodeURIComponent('<script>'))).toBeNull();
    expect(referralCodeFromSearch('?ref=' + encodeURIComponent('a/../b'))).toBeNull();
    expect(referralCodeFromSearch('?ref=' + 'A'.repeat(65))).toBeNull();
  });

  it('accepts exactly the longest allowed code', () => {
    expect(referralCodeFromSearch('?ref=' + 'A'.repeat(64))).toBe('A'.repeat(64));
  });
});

describe('who claims, and when', () => {
  it('A · a signed-out visitor parks the code and does NOT claim', () => {
    expect(referralBridgeAction({ authed: false, urlCode: 'GVLN474V', pendingCode: null })).toEqual(
      { kind: 'capture', code: 'GVLN474V' },
    );
  });

  it('B · after authenticating, the parked code is claimed', () => {
    expect(referralBridgeAction({ authed: true, urlCode: null, pendingCode: 'GVLN474V' })).toEqual({
      kind: 'claim',
      code: 'GVLN474V',
    });
  });

  it('C · a signed-in visitor arriving on the link claims straight away', () => {
    expect(referralBridgeAction({ authed: true, urlCode: 'GVLN474V', pendingCode: null })).toEqual({
      kind: 'claim',
      code: 'GVLN474V',
    });
  });

  it('prefers the code in the URL over a stale parked one', () => {
    expect(referralBridgeAction({ authed: true, urlCode: 'NEW1', pendingCode: 'OLD1' })).toEqual({
      kind: 'claim',
      code: 'NEW1',
    });
  });

  it('does nothing at all when there is no code anywhere', () => {
    expect(referralBridgeAction({ authed: false, urlCode: null, pendingCode: null })).toEqual({
      kind: 'idle',
    });
    expect(referralBridgeAction({ authed: true, urlCode: null, pendingCode: null })).toEqual({
      kind: 'idle',
    });
  });

  it('never claims while signed out, even with a code already parked', () => {
    // The RPC would answer `not_authenticated`, teaching us nothing.
    expect(referralBridgeAction({ authed: false, urlCode: null, pendingCode: 'GVLN474V' })).toEqual(
      { kind: 'idle' },
    );
  });
});

describe('what survives the answer', () => {
  it('F · clears the code on any final answer, including every refusal', () => {
    // D: the RPC owns these refusals. Retrying them forever would be the bug.
    for (const reason of [
      'claimed',
      'code_required',
      'code_not_found',
      'self_referral',
      'already_claimed_same',
      'already_claimed_other',
      'partner_attribution_exists',
    ] as const) {
      expect(shouldKeepPendingAfter({ kind: 'answered', reason })).toBe(false);
    }
  });

  it('E · keeps the code when the transport failed and nothing was decided', () => {
    expect(shouldKeepPendingAfter({ kind: 'transport-error' })).toBe(true);
  });

  it('keeps the code when the session vanished mid-call', () => {
    // Not an answer about the code: the visitor may still claim it later.
    expect(shouldKeepPendingAfter({ kind: 'answered', reason: 'not_authenticated' })).toBe(true);
  });
});
