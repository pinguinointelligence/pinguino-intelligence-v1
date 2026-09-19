import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { claimReferralCode } from '@/services/referral';
import {
  captureReferralCode,
  readPendingReferralCode,
  referralBridgeAction,
  referralCodeFromSearch,
  settlePendingReferralCode,
  shouldKeepPendingAfter,
} from './referralClaimBridge';

/**
 * Wires `/?ref=CODE` to the referral RPC that was already there.
 *
 * Mounted once, beside the Partner click-evidence bridge and deliberately NOT
 * merged with it: Affiliate pays commission in euro and requires an
 * application, „Poleć Gellatti” pays PRO days and requires nothing. Two
 * programmes, two authorities, two bridges.
 *
 * Renders nothing. The decision table lives in `referralClaimBridge.ts`, which
 * is pure; this component only supplies who is asking, what the URL says and
 * what is parked, then records the server's answer.
 */
export function ReferralClaimBridge() {
  const status = useAuthStore((state) => state.status);
  const { search } = useLocation();
  /* One attempt per (code, identity). Without this the effect would re-claim on
     every navigation while the parameter is still in the address bar. */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    /* `loading` is not `anon`: claiming during the initial session restore would
       answer `not_authenticated` for a visitor who is in fact signed in. */
    if (status === 'loading') return;
    const authed = status === 'authed';
    const action = referralBridgeAction({
      authed,
      urlCode: referralCodeFromSearch(search),
      pendingCode: readPendingReferralCode(),
    });

    if (action.kind === 'idle') return;
    if (action.kind === 'capture') {
      captureReferralCode(action.code);
      return;
    }

    const attemptKey = `${action.code}:${status}`;
    if (attempted.current === attemptKey) return;
    attempted.current = attemptKey;

    /* A code that arrives in the URL while signed in is parked first, so a
       failed transport does not lose it before the retry. */
    captureReferralCode(action.code);
    void claimReferralCode(action.code)
      .then((result) => {
        settlePendingReferralCode(
          shouldKeepPendingAfter({ kind: 'answered', reason: result.reason }),
        );
      })
      .catch(() => {
        /* Network or availability failure: the question is unanswered, so the
           code waits for another attempt rather than being spent. */
        settlePendingReferralCode(shouldKeepPendingAfter({ kind: 'transport-error' }));
        attempted.current = null;
      });
  }, [status, search]);

  return null;
}
