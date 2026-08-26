import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { claimReferralEvidence } from '@/services/partner';

/** Claims anonymous click evidence once the visitor becomes an authenticated user. */
export function PartnerReferralBridge() {
  const status = useAuthStore((state) => state.status);
  useEffect(() => {
    if (status === 'authed') void claimReferralEvidence();
  }, [status]);
  return null;
}

