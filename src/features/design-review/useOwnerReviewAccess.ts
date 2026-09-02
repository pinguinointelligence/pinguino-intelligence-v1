import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { currentUserHasOwnerReviewAccess } from '@/services/ownerReviewAccess';

export function useOwnerReviewAccess(): boolean {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [resolved, setResolved] = useState<{ userId: string; allowed: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };
    void currentUserHasOwnerReviewAccess(userId).then((next) => {
      if (active) setResolved({ userId, allowed: next });
    });
    return () => { active = false; };
  }, [userId]);

  return resolved?.userId === userId && resolved.allowed;
}
