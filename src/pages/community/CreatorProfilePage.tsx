import { useMemo } from 'react';
import { useParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import { CommunityRecipeCard } from '@/features/community/ui/CommunityRecipeCard';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { useDocumentMetadata } from '@/features/community/ui/useDocumentMetadata';
import { handleFromPath } from '@/features/community/domain/creatorHandle';
import { absoluteUrl, creatorPath } from '@/features/community/domain/shareUrls';
import { getCreator } from '@/services/community';

/** What the creator reader RPC returns — either the profile, or a typed miss. */
type CreatorPayload = Awaited<ReturnType<typeof getCreator>>;

/**
 * The public creator profile at `/@handle` (§6).
 *
 * Every number here is a real, server-computed aggregate. Where a metric does
 * not exist yet it is simply absent — the page never fills a gap with a zero
 * that reads like a measurement (§6: „never fabricate unavailable metrics").
 */
export function CreatorProfilePage() {
  const copy = communityCopy;
  // The route segment is `@marysia`; every service and URL below wants the
  // canonical `marysia`. The gate already proved it is valid.
  const { handle: segment = '' } = useParams();
  const handle = handleFromPath(segment) ?? '';
  const resource = useAsyncResource<CreatorPayload>(handle, () => getCreator(handle));
  const profile = resource.status === 'ready' && resource.data.ok ? resource.data : null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const metadata = useMemo(
    () =>
      profile
        ? {
            title: `${profile.creator.display_name} · Gellatti`,
            description: `Receptury twórcy ${profile.creator.display_name} w Gellatti Community.`,
            canonical: absoluteUrl(origin, creatorPath(handle)),
            image: profile.creator.avatar_url ?? null,
            robots: 'index,follow' as const,
            creator: profile.creator.display_name,
          }
        : null,
    [profile, origin, handle],
  );
  useDocumentMetadata(metadata);

  if (resource.status === 'loading') {
    return (
      <DestinationSurface title="…">
        <p className="text-sm text-stone-400">…</p>
      </DestinationSurface>
    );
  }
  if (!profile) {
    return (
      <DestinationSurface title={copy.roles.creator}>
        <EmptyState title="Nie znaleziono tego twórcy." />
      </DestinationSurface>
    );
  }

  const { creator, metrics, publications } = profile;

  return (
    <DestinationSurface eyebrow={`@${creator.display_handle ?? handle}`} title={creator.display_name}>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          {creator.bio ? (
            <p className="max-w-2xl text-sm leading-relaxed text-stone-500">{creator.bio}</p>
          ) : null}
          {creator.country ? (
            <p className="text-sm text-stone-500">
              {creator.country}
              {creator.verification_status === 'official' ? ` · ${copy.creator.official}` : ''}
              {creator.verification_status === 'verified' ? ` · ${copy.creator.verified}` : ''}
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-6 border-t border-ink/10 pt-8 sm:grid-cols-4">
          <Metric label={copy.metrics.publicRecipes} value={metrics.public_recipe_count} />
          <Metric label={copy.metrics.makers} value={metrics.unique_makers} />
          <Metric label={copy.metrics.made} value={metrics.total_makes} />
          <Metric label={copy.metrics.remixes} value={metrics.remix_count} />
        </dl>

        <section>
          <SectionLabel>{copy.metrics.publicRecipes}</SectionLabel>
          {publications.length === 0 ? (
            <EmptyState className="mt-4" title={copy.empty.creatorRecipes} />
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {publications.map((card) => (
                <li key={card.publication_id}>
                  <CommunityRecipeCard card={card} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DestinationSurface>
  );
}

/** A metric renders only when it exists — never a placeholder zero. */
function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}
