import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { communityCopy } from '@/copy/community';
import { CreatorProfileForm } from '@/features/community/ui/CreatorProfileForm';
import { creatorAnalytics } from '@/services/community';

interface CreatorAnalytics {
  ok: boolean;
  reason?: string;
  handle?: string;
  is_public?: boolean;
  metrics?: Record<string, number | null>;
  publications?: Array<{
    publication_id: string;
    title: string;
    slug: string;
    status: string;
    version_number: number;
    published_at: string;
    unique_makers: number;
    total_makes: number;
    remix_count: number;
    rating_count: number;
  }>;
}

/**
 * Creator analytics (§36) — reach, never revenue.
 *
 * NB: named „Hub", not „Studio". „Studio" is the retired legacy product name
 * in this codebase and two shell guard tests assert it never returns to the
 * router; reusing the word here would have tripped them for no reason.
 *
 * Everything on this page is a Creator fact: how many people used a recipe,
 * how many confirmed makes, how many remixes. There is no money on this page
 * at all, and the link to the Partner area says so explicitly, because §36 is
 * emphatic that „32 000 osób zrobiło moją recepturę" and „320 € prowizji" must
 * never be presented as the same kind of number.
 */
export function CreatorHubPage() {
  const copy = communityCopy;
  const [data, setData] = useState<CreatorAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    creatorAnalytics()
      .then((result) => !cancelled && setData(result as unknown as CreatorAnalytics))
      .catch(() => !cancelled && setData({ ok: false, reason: 'no_creator_profile' }));
    return () => {
      cancelled = true;
    };
  }, []);

  const hasProfile = data?.ok === true;
  const metrics = data?.metrics ?? {};

  return (
    <DestinationSurface eyebrow="GELLATTI" title={copy.roles.creator}>
      <div className="flex flex-col gap-10">
        {data === null ? (
          <ApplicationState kind="loading" title="Wczytuję przestrzeń twórcy…" />
        ) : null}

        {data !== null && !hasProfile ? (
          <>
            <EmptyState title={copy.empty.firstCreator} />
            <CreatorProfileForm />
          </>
        ) : null}

        {hasProfile ? (
          <>
            <section>
              <SectionLabel>Zasięg</SectionLabel>
              <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Metric label={copy.metrics.publicRecipes} value={metrics.public_recipe_count} />
                <Metric label={copy.metrics.makers} value={metrics.unique_makers} />
                <Metric label={copy.metrics.made} value={metrics.total_makes} />
                <Metric label={copy.metrics.remixes} value={metrics.remix_count} />
              </dl>
              {/* The one sentence that keeps the two kinds of number apart. */}
              <p className="mt-4 text-sm text-stone-500">
                To są statystyki Twórcy — zasięg receptur, nie wynagrodzenie.{' '}
                <Link to="/partner" className="text-ink underline-offset-4 hover:underline">
                  {copy.partner.dashboardTitle}
                </Link>{' '}
                to osobna sekcja
              </p>
            </section>

            <section>
              <SectionLabel>{copy.metrics.publicRecipes}</SectionLabel>
              {(data.publications ?? []).length === 0 ? (
                <EmptyState className="mt-4" title={copy.empty.creatorRecipes} />
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {(data.publications ?? []).map((publication) => (
                    <li key={publication.publication_id}>
                      <Card className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{publication.title}</p>
                          <p className="mt-1 text-sm text-stone-500 tabular-nums">
                            V{publication.version_number} · {publication.unique_makers}{' '}
                            {copy.metrics.makers} · {publication.remix_count} {copy.metrics.remixes}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-xs tracking-label uppercase text-stone-400">
                            {publication.status === 'published' ? copy.publish.published : '—'}
                          </span>
                          {publication.status === 'published' && data.handle ? (
                            <Link
                              to={`/@${data.handle}/${publication.slug}`}
                              className="text-sm text-ink underline-offset-4 hover:underline"
                            >
                              {copy.actions.view}
                            </Link>
                          ) : null}
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <CreatorProfileForm initial={{ handle: data.handle, isPublic: data.is_public }} />
            </section>
          </>
        ) : null}
      </div>
    </DestinationSurface>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}
