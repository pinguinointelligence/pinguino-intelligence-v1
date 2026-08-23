import { useMemo } from 'react';
import { useParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAccess } from '@/access/useAccess';
import { communityCopy } from '@/copy/community';
import { AttributionByline } from '@/features/community/ui/AttributionByline';
import { DemoRecipePreview } from '@/features/community/ui/DemoRecipePreview';
import { UnlockCta } from '@/features/community/ui/UnlockCta';
import { UseRecipeActions } from '@/features/community/ui/UseRecipeActions';
import { VerifiedRating } from '@/features/community/ui/VerifiedRating';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { useDocumentMetadata } from '@/features/community/ui/useDocumentMetadata';
import { unlockBenefits } from '@/features/community/domain/unlockBenefits';
import { handleFromPath } from '@/features/community/domain/creatorHandle';
import { publicationMetadata } from '@/features/community/domain/shareUrls';
import { getPublication, type PublicationPage as PublicationPayload } from '@/services/community';

/**
 * The public Community recipe page at `/@handle/:slug` (§8, §9).
 *
 * This is BOTH the creator's showcase and an acquisition surface, and the
 * tension between those two jobs is resolved in exactly one way: the visitor
 * gets a real, useful understanding of the recipe — its name, its creator, its
 * ingredients, its structure, the proof that people made it — and never the
 * exact formulation.
 *
 * That is not a rendering decision. `getPublication` calls a reader RPC that
 * has no access to `recipe_input` at all, so an anonymous visitor's browser
 * never receives grams to hide (§16). What the page decides is only WHAT TO
 * SAY about it.
 */
export function PublicRecipePage() {
  const copy = communityCopy;
  // The route segment is `@marysia`; the canonical handle is what the reader
  // RPC and the canonical URL are built from.
  const { handle: segment = '', slug = '' } = useParams();
  const handle = handleFromPath(segment) ?? '';
  const access = useAccess();
  const resource = useAsyncResource(`${handle}/${slug}`, () => getPublication(handle, slug));
  const page: PublicationPayload | null =
    resource.status === 'ready' && resource.data.ok ? resource.data : null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const metadata = useMemo(
    () =>
      page
        ? publicationMetadata({
            origin,
            handle,
            slug,
            title: page.title,
            description: page.description,
            imageUrl: page.image_url,
            creatorDisplayName: page.creator.display_name,
          })
        : null,
    [page, origin, handle, slug],
  );
  useDocumentMetadata(metadata);

  if (resource.status === 'loading') {
    return (
      <DestinationSurface title="…">
        <p className="text-sm text-stone-400">…</p>
      </DestinationSurface>
    );
  }
  if (!page) {
    return (
      <DestinationSurface title={copy.nav.community}>
        <EmptyState title={copy.share.notFound} />
      </DestinationSurface>
    );
  }

  return (
    <DestinationSurface eyebrow={copy.nav.community} title={page.title}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-8">
          {page.image_url ? (
            <img
              src={page.image_url}
              alt=""
              className="aspect-[16/9] w-full rounded-md object-cover"
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* §22: a remix ALWAYS names its source here. The remixer cannot
                suppress it — it is read from recipe_lineage, which they have
                no write path to. */}
            <AttributionByline
              creatorDisplayName={page.creator.display_name}
              creatorHandle={page.creator.handle}
              basedOn={
                page.based_on
                  ? {
                      title: page.based_on.title,
                      creatorDisplayName: page.based_on.creator_display_name,
                      handle: page.based_on.handle,
                    }
                  : null
              }
            />
            <VerifiedRating
              average={page.metrics.rating_average}
              count={page.metrics.rating_count}
            />
          </div>

          {page.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-stone-500">{page.description}</p>
          ) : null}

          <dl className="grid grid-cols-2 gap-6 border-t border-ink/10 pt-6 sm:grid-cols-4">
            <Metric label={copy.metrics.makers} value={page.metrics.unique_makers} />
            <Metric label={copy.metrics.made} value={page.metrics.total_makes} />
            <Metric label={copy.metrics.remixes} value={page.metrics.remix_count} />
            <Metric label={copy.metrics.uniqueUsers} value={page.metrics.unique_users} />
          </dl>

          {/* Demo-safe by type: `page.recipe` is a DemoSafeRecipe, which has no
              gram field for this component to read. */}
          <DemoRecipePreview recipe={page.recipe} />
        </div>

        <aside className="flex flex-col gap-6">
          {access.isPro ? (
            <UseRecipeActions
              target={{
                source: {
                  kind: 'publication',
                  publicationId: page.publication_id,
                  handle,
                  slug,
                },
                sourceTitle: page.title,
                sourceCreatorDisplayName: page.creator.display_name,
              }}
            />
          ) : (
            <UnlockCta
              target={{ kind: 'publication', handle, slug }}
              isSignedIn={access.isSignedIn}
              benefits={unlockBenefits(access.tier)}
            />
          )}
        </aside>
      </div>
    </DestinationSurface>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div>
      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}
