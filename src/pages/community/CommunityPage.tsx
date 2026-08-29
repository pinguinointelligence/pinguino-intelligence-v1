import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  applicationCompactClasses,
  applicationFieldClasses,
} from '@/components/ui/applicationControlStyles';
import { communityCopy } from '@/copy/community';
import { CommunityRecipeCard } from '@/features/community/ui/CommunityRecipeCard';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { RANKING_WINDOWS, type RankingWindow } from '@/features/community/domain/ranking';
import { listCommunity, searchCommunity, type CommunityCard } from '@/services/community';
import { RecipeLibraryNav } from '@/features/recipes/RecipeLibraryNav';

/**
 * Community discovery (§37).
 *
 * Four windows only — Na czasie / Ten tydzień / Ten miesiąc / Wszechczasów.
 * Categories and countries are supported by the schema and the reader RPC but
 * are deliberately NOT rendered yet: §37 says not to overbuild dozens of
 * filters before there is content to filter.
 *
 * The empty state is honest (§59). Nothing is seeded, nothing is faked, and
 * the copy invites the visitor to be first rather than implying a crowd.
 */
export function CommunityPage() {
  const copy = communityCopy;
  const [params, setParams] = useSearchParams();
  const window_ = readWindow(params.get('window'));
  const query = params.get('q') ?? '';

  const resource = useAsyncResource<CommunityCard[]>(
    query.trim() ? `q:${query.trim()}` : `w:${window_}`,
    () => (query.trim() ? searchCommunity(query.trim()) : listCommunity(window_, null, 24, 0)),
  );

  const labels = useMemo(
    () =>
      ({
        trending: copy.windows.trending,
        week: copy.windows.week,
        month: copy.windows.month,
        all_time: copy.windows.allTime,
      }) satisfies Record<RankingWindow, string>,
    [copy],
  );

  return (
    <DestinationSurface eyebrow="GELLATTI" title={copy.nav.community} contextLabel="Receptury">
      {/* Community is part of the Recipes experience, not a destination the
          customer is thrown into: the library strip stays, so the way back is
          where the way in was. The public URL keeps working unchanged. */}
      <RecipeLibraryNav mode="links" activeHref="/community" />
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav aria-label={copy.nav.community} className="flex flex-wrap gap-1">
            {RANKING_WINDOWS.map((option) => (
              <button
                key={option}
                type="button"
                aria-current={option === window_ ? 'page' : undefined}
                onClick={() => setParams({ window: option })}
                className={applicationCompactClasses(
                  option === window_
                    ? '!border-ink !bg-ink !text-white hover:!border-ink'
                    : 'text-stone-600',
                )}
              >
                {labels[option]}
              </button>
            ))}
          </nav>

          <label className="flex items-center gap-2">
            <span className="sr-only">Szukaj w Community</span>
            <input
              type="search"
              defaultValue={query}
              placeholder="Szukaj receptury lub twórcy"
              onChange={(event) => {
                const value = event.target.value;
                setParams(value.trim() ? { q: value } : { window: window_ });
              }}
              className={applicationFieldClasses('w-56 bg-paper')}
            />
          </label>
        </div>

        {resource.status === 'failed' ? (
          <ApplicationState kind="error" title="Nie udało się wczytać Community." />
        ) : resource.status === 'loading' ? (
          <ApplicationState kind="loading" title="Wczytuję Community…" />
        ) : resource.data.length === 0 ? (
          <EmptyState title={copy.empty.community} body={copy.empty.firstCreator} />
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resource.data.map((card) => (
              <li key={card.publication_id}>
                <CommunityRecipeCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DestinationSurface>
  );
}

function readWindow(raw: string | null): RankingWindow {
  return RANKING_WINDOWS.includes(raw as RankingWindow) ? (raw as RankingWindow) : 'trending';
}
