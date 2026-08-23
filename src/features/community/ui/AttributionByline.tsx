import { Link } from 'react-router';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';

/**
 * The byline — where the three roles are made visible and kept apart (§23, §85).
 *
 * „Autor" is the CREATOR and is never optional on a Community recipe.
 * „Udostępnił(a)" appears only when the sharer is a different person.
 * „Na podstawie" appears on a remix and cannot be turned off by the remixer.
 *
 * Nothing here renders a Partner: commercial attribution is not a social
 * credit and must never appear on the recipe as if it were authorship.
 */
export function AttributionByline({
  creatorDisplayName,
  creatorHandle,
  sharedByDisplayName,
  basedOn,
  className,
}: {
  creatorDisplayName: string;
  creatorHandle?: string | null;
  sharedByDisplayName?: string | null;
  basedOn?: { title: string; creatorDisplayName: string; handle?: string | null } | null;
  className?: string;
}) {
  const copy = communityCopy;
  const showSharer =
    Boolean(sharedByDisplayName) && sharedByDisplayName !== creatorDisplayName;

  return (
    <div className={cn('flex flex-col gap-1 text-sm text-stone-500', className)}>
      <p>
        <span className="text-xs tracking-label uppercase text-stone-400">
          {copy.roles.createdBy}
        </span>{' '}
        {creatorHandle ? (
          <Link
            to={`/@${creatorHandle}`}
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            {creatorDisplayName}
          </Link>
        ) : (
          <span className="font-medium text-ink">{creatorDisplayName}</span>
        )}
      </p>

      {showSharer ? (
        <p>
          <span className="text-xs tracking-label uppercase text-stone-400">
            {copy.roles.sharedBy}
          </span>{' '}
          <span className="text-ink">{sharedByDisplayName}</span>
        </p>
      ) : null}

      {basedOn ? (
        <p>
          <span className="text-xs tracking-label uppercase text-stone-400">
            {copy.roles.basedOn}
          </span>{' '}
          <span className="text-ink">{basedOn.title}</span>
          <span className="text-stone-500"> · </span>
          {basedOn.handle ? (
            <Link
              to={`/@${basedOn.handle}`}
              className="text-ink underline-offset-4 hover:underline"
            >
              {basedOn.creatorDisplayName}
            </Link>
          ) : (
            <span className="text-ink">{basedOn.creatorDisplayName}</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
