import { useEffect, useState } from 'react';
import { creatorAnalytics } from '@/services/community';

/**
 * Does this account have a Creator profile yet?
 *
 * Used ONLY to decide which message the publish dialog opens with. It is not a
 * gate: `gellatti_publish_recipe_v1` refuses with `creator_profile_required`
 * regardless of what the client believes, so a wrong answer here costs a
 * confusing sentence, never a wrong permission.
 *
 * Fails closed (`false`) on any error — offering to publish and then being
 * refused is worse than being told to create a profile first.
 */
export function useCreatorProfile(enabled: boolean): boolean {
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    creatorAnalytics()
      .then((result) => {
        if (!cancelled) setHasProfile((result as { ok?: boolean }).ok === true);
      })
      .catch(() => {
        if (!cancelled) setHasProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return hasProfile;
}
