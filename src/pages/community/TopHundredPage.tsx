import { useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { communityCopy } from '@/copy/community';
import { CommunityRecipeCard } from '@/features/community/ui/CommunityRecipeCard';
import { CreatorCard } from '@/features/community/ui/CreatorCard';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { RANKING_WINDOWS, type RankingWindow } from '@/features/community/domain/ranking';
import { cn } from '@/lib/cn';
import {
  topCreators,
  topRecipes,
  type CommunityCard,
  type TopCreatorEntry,
} from '@/services/community';

/**
 * Gellatti TOP 100 (§38) + Top Creators (§39).
 *
 * The board ranks by confirmed makes, makers and remixes — not by likes and
 * not by views. Ranks are shown as numbers rather than as colour badges, so
 * the position is legible to everyone (§62).
 *
 * When nothing has been made yet the board says exactly that. It does not
 * pad itself with recently-published recipes pretending to be a ranking (§59).
 */
export function TopHundredPage() {
  const copy = communityCopy;
  const [params, setParams] = useSearchParams();
  const window_ = RANKING_WINDOWS.includes(params.get('window') as RankingWindow)
    ? (params.get('window') as RankingWindow)
    : 'all_time';
  const board = params.get('board') === 'creators' ? 'creators' : 'recipes';

  // One resource per board, keyed so switching board or window refetches and a
  // late response for the previous key can never render.
  const recipes = useAsyncResource<CommunityCard[]>(`recipes:${window_}`, () =>
    board === 'recipes' ? topRecipes(window_, 100) : Promise.resolve([]),
  );
  const creators = useAsyncResource<TopCreatorEntry[]>(`creators:${board}`, () =>
    board === 'creators' ? topCreators(50) : Promise.resolve([]),
  );

  const labels: Record<RankingWindow, string> = {
    trending: copy.windows.trending,
    week: copy.windows.week,
    month: copy.windows.month,
    all_time: copy.windows.allTime,
  };

  return (
    <DestinationSurface eyebrow="GELLATTI" title={copy.nav.top100}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav aria-label="Ranking" className="flex gap-1">
            {(
              [
                ['recipes', 'Receptury'],
                ['creators', 'Twórcy'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-current={board === key ? 'page' : undefined}
                onClick={() => setParams({ board: key, window: window_ })}
                className={cn(
                  'rounded-sm px-3 py-2 text-xs tracking-label uppercase transition-colors',
                  board === key ? 'bg-ink text-paper' : 'text-stone-500 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          {board === 'recipes' ? (
            <nav aria-label="Zakres" className="flex flex-wrap gap-1">
              {RANKING_WINDOWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-current={option === window_ ? 'page' : undefined}
                  onClick={() => setParams({ board, window: option })}
                  className={cn(
                    'rounded-sm px-3 py-2 text-xs tracking-label uppercase transition-colors',
                    option === window_ ? 'bg-ink text-paper' : 'text-stone-500 hover:text-ink',
                  )}
                >
                  {labels[option]}
                </button>
              ))}
            </nav>
          ) : null}
        </div>

        {board === 'recipes' ? (
          recipes.status !== 'ready' ? (
            <p className="text-sm text-stone-400">…</p>
          ) : recipes.data.length === 0 ? (
            <EmptyState title={copy.empty.top100} />
          ) : (
            <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.data.map((card, index) => (
                <li key={card.publication_id}>
                  <CommunityRecipeCard card={card} rank={index + 1} />
                </li>
              ))}
            </ol>
          )
        ) : creators.status !== 'ready' ? (
          <p className="text-sm text-stone-400">…</p>
        ) : creators.data.length === 0 ? (
          <EmptyState title={copy.empty.top100} />
        ) : (
          <ol className="flex flex-col gap-3">
            {creators.data.map((creator, index) => (
              <li key={creator.handle}>
                <CreatorCard creator={creator} rank={index + 1} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </DestinationSurface>
  );
}
