import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { communityCopy } from '@/copy/community';
import { hasMeaningfulRank } from '@/features/community/domain/ranking';
import { cn } from '@/lib/cn';
import type { TopCreatorEntry } from '@/services/community';

/**
 * The creator card (§44). No follower count — there is no follower graph, and
 * inventing a vanity number would misrepresent what Gellatti measures.
 *
 * A rank is rendered ONLY when `hasMeaningfulRank` agrees (§39). One make on
 * one recipe is not „#7 w Polsce", and showing it as one would be fake
 * activity dressed as achievement.
 */
export function CreatorCard({
  creator,
  rank,
  className,
}: {
  creator: TopCreatorEntry;
  rank?: number;
  className?: string;
}) {
  const copy = communityCopy;
  const metrics = creator.metrics;
  const showRank =
    rank !== undefined &&
    hasMeaningfulRank({
      unique_makers: metrics.unique_makers,
      total_makes: metrics.total_makes,
      remix_count: metrics.remix_count,
      unique_users: metrics.unique_users,
      public_recipe_count: metrics.public_recipe_count,
    });

  return (
    <Card className={cn('flex items-center gap-4', className)}>
      {showRank ? (
        <span className="w-8 shrink-0 font-mono text-sm tabular-nums text-stone-400">#{rank}</span>
      ) : null}

      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-shell-raised">
        {creator.avatar_url ? (
          <img src={creator.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to={`/@${creator.handle}`}
          className="block truncate font-medium text-ink underline-offset-4 hover:underline"
        >
          {creator.display_name}
        </Link>
        <p className="truncate text-sm text-stone-500">
          @{creator.display_handle}
          {creator.country ? <span className="ml-2">{creator.country}</span> : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {metrics.unique_makers > 0 ? (
          <p className="text-sm tabular-nums text-ink">
            {metrics.unique_makers} <span className="text-stone-500">{copy.metrics.makers}</span>
          </p>
        ) : null}
        <p className="text-sm tabular-nums text-stone-500">
          {metrics.public_recipe_count} {copy.metrics.publicRecipes}
        </p>
      </div>
    </Card>
  );
}
