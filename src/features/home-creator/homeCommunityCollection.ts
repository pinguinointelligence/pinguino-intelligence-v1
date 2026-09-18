/**
 * DESIGN V3.0 IX / owner X — Community is the sixth collection inside „Receptury”.
 *
 * It reads today's working Community source: the current Top 100
 * (`gellatti_top_recipes_v1`, the same ranking the /top100 page shows and the Community
 * match oracle ranks by). Nothing is scored, filtered or re-ranked here; a card never
 * carries a gram.
 */
import { useEffect, useRef, useState } from 'react';
import { topRecipes, type CommunityCard } from '@/services/community';
import type { HomeCommunityDoorTarget } from './matching/useHomeCommunityDoor';

/** The Top 100 window the Community collection shows. */
export const HOME_COMMUNITY_WINDOW = 'all_time';

export type HomeCommunityCollection =
  | { readonly status: 'idle' | 'loading' | 'failed' }
  | { readonly status: 'ready'; readonly rows: readonly CommunityCard[] };

/** Loaded once, the first time the customer opens the Community collection. */
export function useHomeCommunityCollection(enabled: boolean): HomeCommunityCollection {
  const [state, setState] = useState<HomeCommunityCollection>({ status: 'idle' });
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    topRecipes(HOME_COMMUNITY_WINDOW, 100).then(
      (rows) => {
        if (mounted.current) setState({ status: 'ready', rows });
      },
      () => {
        if (mounted.current) setState({ status: 'failed' });
      },
    );
  }, [enabled]);
  // Asked for and not answered yet.
  return enabled && state.status === 'idle' ? { status: 'loading' } : state;
}

/** The canonical publication address the Community door opens. */
export function communityDoorTarget(card: CommunityCard): HomeCommunityDoorTarget {
  return {
    publicationId: card.publication_id,
    handle: card.creator.handle ?? '',
    slug: card.slug,
    title: card.title,
    creatorDisplayName: card.creator.display_name,
  };
}
