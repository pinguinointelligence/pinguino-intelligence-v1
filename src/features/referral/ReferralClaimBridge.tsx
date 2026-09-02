import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  REFERRAL_QUERY_PARAM,
  claimReferralCode,
  clearPendingReferralCode,
  readPendingReferralCode,
  savePendingReferralCode,
} from '@/services/referral';

/**
 * Turns a `?ref=CODE` visit into a recorded referral once the visitor has an
 * account.
 *
 * Two steps, deliberately separated: the code is PARKED on arrival (the
 * visitor almost never has an account yet) and CLAIMED after sign-in. The
 * browser only carries the string — `gellatti_claim_referral_code_v1` decides
 * whether it may be honoured, so a hand-edited localStorage value cannot
 * attribute anyone to anyone.
 *
 * This is the user lane. `PartnerReferralBridge` claims partner clicks on the
 * same signal and the two never share a code namespace: the claim RPC refuses
 * any user code that collides with a partner code.
 */
export function ReferralClaimBridge() {
  const status = useAuthStore((state) => state.status);

  // Park the code on arrival, whatever the auth state.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get(REFERRAL_QUERY_PARAM);
    if (code && code.trim() !== '') savePendingReferralCode(code.trim());
  }, []);

  // Claim it once there is an account to attach it to.
  useEffect(() => {
    if (status !== 'authed') return;
    const pending = readPendingReferralCode();
    if (!pending) return;
    void claimReferralCode(pending)
      .then((result) => {
        // Clear on any DECISION — accepted, self-referral, already claimed, or
        // owned by the partner lane. Only a transport failure is worth
        // retrying, and that throws instead of answering.
        if (result.reason !== 'not_authenticated') clearPendingReferralCode();
      })
      .catch(() => {
        // Keep the pending code for the next session rather than losing the
        // referral to one bad network moment.
      });
  }, [status]);

  return null;
}
