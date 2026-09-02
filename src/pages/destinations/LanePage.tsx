import { Link, useLocation } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import {
  DestinationEyebrow,
  DestinationSection,
} from '@/components/shared/destinationEditorial';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import type { OwnerAssetId } from '@/features/work-with-us/ownerAssets';
import type { LanePageCopy } from '@/copy/workWithUsLanes';

interface LanePageProps {
  readonly copy: LanePageCopy;
  /**
   * The lifestyle photograph behind the hero. OMITTED ON PURPOSE for Machines:
   * the owner has no dedicated Machines hero, and inventing one is forbidden,
   * so that route falls back to a typography-first hero instead of borrowing a
   * photograph that shows something else.
   */
  readonly hero?: OwnerAssetId;
  /** A supporting image lower down — equipment detail, second use case. */
  readonly detail?: OwnerAssetId;
  readonly detailCaption?: string;
  /** A third view of the same product, shown beside the detail. */
  readonly detailSecondary?: OwnerAssetId;
  readonly detailSecondaryCaption?: string;
}

/**
 * One secondary Work With Us lane: Machines, Mobile equipment or Trailer.
 *
 * All three answer the same three questions in the same order — what is this,
 * who is it for, what happens next — because the gateway promises that shape and
 * a lane that answers them differently reads as a different company.
 *
 * Every CTA here goes to the enquiry route. There is no online checkout for
 * equipment, and there is no control on this page that only looks functional.
 */
export function LanePage({
  copy,
  hero,
  detail,
  detailCaption,
  detailSecondary,
  detailSecondaryCaption,
}: LanePageProps) {
  const { pathname } = useLocation();
  /**
   * Every CTA on this page goes to the ONE enquiry surface on the gateway.
   *
   * `?from=` carries the route the visitor is actually on, which becomes the
   * lead's `source_route` and chooses the initial subject — so arriving from
   * `/trailer` costs no extra click. The two stay separate afterwards: change
   * the subject and the route still records where the question started.
   */
  const leadHref = `/work-with-us?from=${encodeURIComponent(pathname)}#lead`;

  return (
    <DestinationSurface eyebrow={copy.kicker} title={copy.title} blurb={copy.card} bare>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <DestinationSection>
        {hero === undefined ? (
          /* TYPOGRAPHY-FIRST HERO (owner decision, 2026-08-31).
             No dedicated Machines photograph exists. Rather than borrow one that
             shows something else, the headline carries the page — warm white,
             generous space, one CTA. */
          <div className="rounded-[12px] border border-[var(--g-line)] bg-[#f5f2ed] px-[clamp(28px,5vw,72px)] py-[clamp(44px,7vw,96px)]">
            <div className="max-w-2xl">
              <DestinationEyebrow>{copy.kicker}</DestinationEyebrow>
              <h1 className="mt-3 text-[clamp(30px,4.4vw,54px)] leading-[1.03] font-bold tracking-[-0.04em] text-[var(--g-ink)]">
                {copy.headline}
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--g-text-secondary)]">
                {copy.intro}
              </p>
              <Link to={leadHref} className={`${buttonClasses('orange', 'md')} mt-8 inline-flex`}>
                {copy.cta}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid overflow-hidden rounded-[12px] border border-[var(--g-line)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="flex flex-col justify-center bg-[#f5f2ed] p-[clamp(28px,4vw,52px)]">
              <DestinationEyebrow>{copy.kicker}</DestinationEyebrow>
              <h1 className="mt-3 text-[clamp(26px,3vw,42px)] leading-[1.05] font-bold tracking-[-0.038em] text-[var(--g-ink)]">
                {copy.headline}
              </h1>
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--g-text-secondary)]">
                {copy.intro}
              </p>
              <Link to={leadHref} className={`${buttonClasses('orange', 'md')} mt-7 inline-flex self-start`}>
                {copy.cta}
              </Link>
            </div>
            <div className="min-h-[240px] lg:min-h-0">
              <OwnerAssetImage id={hero} priority sizes="(min-width: 1024px) 45vw, 100vw" />
            </div>
          </div>
        )}
      </DestinationSection>

      {/* ── What this is ──────────────────────────────────────────────────── */}
      <DestinationSection>
        <DestinationEyebrow>Dla kogo</DestinationEyebrow>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--g-ink)]">
          {copy.forWhom}
        </p>
        <ul className="mt-8 grid gap-px border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-3">
          {copy.points.map((point) => (
            <li key={point.title} className="bg-white p-[clamp(20px,2.4vw,30px)]">
              <strong className="block text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
                {point.title}
              </strong>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                {point.body}
              </p>
            </li>
          ))}
        </ul>
      </DestinationSection>

      {/* ── Supporting image ──────────────────────────────────────────────── */}
      {detail !== undefined ? (
        <DestinationSection>
          <div
            className={
              detailSecondary === undefined
                ? 'overflow-hidden rounded-[12px] border border-[var(--g-line)]'
                : 'grid gap-px overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-line)] lg:grid-cols-2'
            }
          >
            <figure className="bg-white">
              <div className="aspect-[16/10] overflow-hidden">
                <OwnerAssetImage
                  id={detail}
                  sizes={detailSecondary === undefined ? '(min-width: 1024px) 70vw, 100vw' : '(min-width: 1024px) 45vw, 100vw'}
                />
              </div>
              {detailCaption === undefined ? null : (
                <figcaption className="px-5 py-4 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
                  {detailCaption}
                </figcaption>
              )}
            </figure>
            {detailSecondary === undefined ? null : (
              <figure className="bg-white">
                <div className="aspect-[16/10] overflow-hidden">
                  <OwnerAssetImage id={detailSecondary} sizes="(min-width: 1024px) 45vw, 100vw" />
                </div>
                {detailSecondaryCaption === undefined ? null : (
                  <figcaption className="px-5 py-4 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
                    {detailSecondaryCaption}
                  </figcaption>
                )}
              </figure>
            )}
          </div>
        </DestinationSection>
      ) : null}

      {/* ── What happens next ─────────────────────────────────────────────── */}
      <DestinationSection>
        <div className="rounded-[12px] border border-[var(--g-line)] bg-white p-[clamp(24px,3.4vw,44px)]">
          <DestinationEyebrow>Co dalej</DestinationEyebrow>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--g-ink)]">
            {copy.next}
          </p>
          <Link to={leadHref} className={`${buttonClasses('orange', 'md')} mt-7 inline-flex`}>
            {copy.cta}
          </Link>
        </div>
      </DestinationSection>
    </DestinationSurface>
  );
}
