import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import type { CommunityCard } from '@/services/community';
import { VerifiedRating } from './VerifiedRating';

/**
 * The Community recipe card (§43). Priority order, top to bottom:
 *   1. the recipe,  2. the creator,  3. PROOF that people made it,
 *   4. the verified rating,  5. the action.
 *
 * Proof of use sits above the rating on purpose: „87 osób to zrobiło" is a
 * stronger and more honest signal than a star average, and it is the thing the
 * ranking is actually built on (§38). Deliberately restrained — no badge
 * clutter, no hearts, no rainbow rank chips (§2).
 */
export function CommunityRecipeCard({
  card,
  rank,
  className,
}: {
  card: CommunityCard;
  /** Only passed on a ranked board; never invented for a plain list. */
  rank?: number;
  className?: string;
}) {
  const copy = communityCopy;
  const href = card.creator.handle ? `/@${card.creator.handle}/${card.slug}` : '#';
  const madeBySomeone = card.metrics.unique_makers > 0;

  return (
    <Card padding="none" className={cn('group overflow-hidden', className)}>
      <Link to={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-shell-raised">
          {card.image_url ? (
            <img
              src={card.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-mono text-xs text-stone-300">—</span>
            </div>
          )}
          {rank !== undefined ? (
            // Rank is text, not a colour — screen readers and colour-blind
            // users read the same fact everyone else does (§62).
            <span className="absolute top-3 left-3 rounded-sm bg-ink/90 px-2 py-1 font-mono text-xs tabular-nums text-paper">
              #{rank}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-base leading-snug font-medium text-ink">{card.title}</h3>
            {card.based_on ? (
              <p className="mt-1 truncate text-xs text-stone-400">
                {copy.roles.basedOn} {card.based_on.title} · {card.based_on.creator_display_name}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-stone-500">
              {copy.roles.createdBy} {card.creator.display_name}
              {card.creator.verification_status === 'official' ? (
                <span className="ml-2 text-xs tracking-label uppercase text-stone-400">
                  {communityCopy.creator.official}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {madeBySomeone ? (
              <span className="text-ink tabular-nums">
                {card.metrics.unique_makers}{' '}
                <span className="text-stone-500">{copy.metrics.makers}</span>
              </span>
            ) : null}
            {card.metrics.remix_count > 0 ? (
              <span className="text-stone-500 tabular-nums">
                {card.metrics.remix_count} {copy.metrics.remixes}
              </span>
            ) : null}
            <VerifiedRating
              average={card.metrics.rating_average}
              count={card.metrics.rating_count}
            />
          </div>
        </div>
      </Link>
    </Card>
  );
}
