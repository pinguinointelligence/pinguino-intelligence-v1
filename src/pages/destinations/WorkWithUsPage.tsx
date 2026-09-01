import { Link } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import {
  DestinationEyebrow,
  DestinationHero,
  DestinationSection,
  DestinationSectionHead,
} from '@/components/shared/destinationEditorial';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import { cooperationCopy } from '@/copy/cooperation';
import { PartnerApplicationPanel } from '@/features/partner-application/PartnerApplicationPanel';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import type { OwnerAssetId } from '@/features/work-with-us/ownerAssets';
import { LANES } from '@/copy/workWithUsLanes';

const c = cooperationCopy;
const w = copy.nav.work;

/** The secondary business routes, in the owner's priority order.
 *
 *  OWNER DECISION (2026-08-29): ingredient supply is NOT a public cooperation
 *  route today, so `w.offers.ingredients` is deliberately not listed here. The
 *  copy and every downstream consumer stay in the tree — only the public
 *  presentation drops it, so it can come back without being rebuilt. */
const SECONDARY_OFFERS = [w.offers.machinesApp, w.offers.machineMixtures, w.offers.app] as const;

/**
 * The four non-Partner lanes and the owner's assigned image for each.
 *
 * W01 carries MACHINES as a category image by owner decision (2026-08-31): it
 * is professional equipment — a pozzetti counter in use — and is deliberately
 * NOT presented as any specific machine model, because no delivered photograph
 * identifies one.
 *
 * A05 carries MOBILE and A07 carries TRAILER. Neither is labelled with a model
 * either: the cart models are unproven, and W03 shows a different trailer from
 * A06/A07 and stays out of the primary story until its offer is resolved.
 */
/**
 * The three Partner personas the owner assigned. A04 is a PARTNER asset — a
 * professional using Gellatti in a working gelateria — and is deliberately not
 * on the Machines route, per the owner's correction of 2026-08-31.
 */
const PARTNER_PERSONAS: ReadonlyArray<{
  asset: OwnerAssetId;
  title: string;
  body: string;
}> = [
  {
    asset: 'A03',
    title: 'Twórcy wideo',
    body: 'Pokazujesz, jak powstaje receptura, i dajesz ludziom powód, żeby ją powtórzyli.',
  },
  {
    asset: 'A02',
    title: 'Społeczności i newslettery',
    body: 'Masz grupę, która Ci ufa. Receptura, którą polecisz, wraca do Ciebie jako Twój link.',
  },
  {
    asset: 'A04',
    title: 'Profesjonaliści',
    body: 'Pracujesz z gelato na co dzień. Twoja receptura ma pokrycie w praktyce, a nie w opisie.',
  },
];

const LANE_CARDS: ReadonlyArray<(typeof LANES)[keyof typeof LANES] & { asset: OwnerAssetId }> = [
  { ...LANES.machines, asset: 'W01' },
  { ...LANES.mobile, asset: 'A05' },
  { ...LANES.trailer, asset: 'A07' },
  { ...LANES.franchise, asset: 'F01' },
];

/**
 * Work with us — the cooperation destination.
 *
 * Partners, influencers and creators are Gellatti's distribution, not a
 * footnote: they own the top of this page and the only complete flow on it.
 * The machine/app routes remain available underneath, and Franchise keeps its
 * own funnel on its own page.
 *
 * GELLATTI V2.1 §5 dresses this in the approved editorial vocabulary — the
 * 372 px GRAPHITE hero at 1.15 / 0.85, the 58 px section rhythm and the shared
 * card geometry. Every block, flow and owner decision above is unchanged; the
 * approved hero's right half carries the real `whatYouShare` list rather than
 * the preview's image-direction placeholder, because this route has content
 * where the design-only preview had none.
 */
export function WorkWithUsPage() {
  return (
    <DestinationSurface
      eyebrow={c.page.eyebrow}
      title={c.page.title}
      blurb={c.page.blurb}
      contextLabel={c.page.contextLabel}
      bare
    >
      {/* ── PRIMARY: partners and creators ───────────────────────────────── */}
      {/* The approved hero carries the PAGE's identity — eyebrow, title, blurb —
          exactly as the preview does, so `c.page` is still on the page after
          `bare` removes the shared `PageHeading`. The partner block keeps its
          own headline and body in its own section below, so nothing is lost. */}
      <DestinationHero
        variant="editorial"
        eyebrow={c.page.eyebrow}
        title={c.page.title}
        blurb={c.page.blurb}
        actions={
          <a href="#partner-application" className={buttonClasses('orange', 'md')}>
            {c.partner.cta}
          </a>
        }
        visual={
          /* The approved hero keeps its image ON A PHONE too — the authority's
             mobile hero runs the full graphite band with the frame under the
             CTA, so hiding it below `lg` shortened the band and pushed
             everything beneath it out of register.

             A01 is the owner's Partner hero. Its subject sits right-of-centre
             and its left third is close to empty, which is why it survives the
             tall mobile crop: `object-cover` trims the empty side first. */
          <div className="grid place-items-center p-[26px] pt-0 lg:p-[26px]">
            <div className="h-full min-h-[190px] w-full overflow-hidden rounded-[12px]">
              <OwnerAssetImage
                id="A01"
                priority
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-[70%_center]"
              />
            </div>
          </div>
        }
      />

      <section aria-labelledby="cooperation-partner">
        <DestinationSection>
          <div className="grid overflow-hidden rounded-[12px] border border-[var(--g-line)] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="flex flex-col justify-center bg-[#e7e3dd] p-[clamp(28px,4vw,44px)]">
              <DestinationEyebrow>{c.partner.kicker}</DestinationEyebrow>
              <h2
                id="cooperation-partner"
                className="mt-2 text-[clamp(26px,2.4vw,32px)] leading-[1.05] font-bold tracking-[-0.035em] text-[var(--g-ink)]"
              >
                {c.partner.headline}
              </h2>
              <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                {c.partner.body}
              </p>
            </div>
            <div className="bg-white p-[clamp(28px,4vw,44px)]">
              <DestinationEyebrow>{c.partner.whatYouShareTitle}</DestinationEyebrow>
              <ul className="mt-4 space-y-3">
                {c.partner.whatYouShare.map((line) => (
                  <li
                    key={line}
                    className="flex gap-3 text-[13px] leading-relaxed text-[var(--g-text-secondary)]"
                  >
                    <span
                      aria-hidden
                      className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--g-orange)]"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DestinationSection>

        {/* ── WHO THIS IS FOR ─────────────────────────────────────────────
            The owner's three Partner personas. Each photograph carries its own
            caption rather than a generic label, because "twórca" over a picture
            of someone filming is a caption that adds nothing. */}
        <DestinationSection>
          <DestinationEyebrow>Dla kogo</DestinationEyebrow>
          <div className="mt-5 grid gap-px border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-3">
            {PARTNER_PERSONAS.map((persona) => (
              <figure key={persona.asset} className="bg-white">
                <div className="aspect-[4/3] overflow-hidden">
                  <OwnerAssetImage id={persona.asset} sizes="(min-width: 640px) 31vw, 100vw" />
                </div>
                <figcaption className="p-[clamp(18px,2vw,26px)]">
                  <strong className="block text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
                    {persona.title}
                  </strong>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                    {persona.body}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </DestinationSection>

        <DestinationSection>
          <DestinationEyebrow>{c.partner.howTitle}</DestinationEyebrow>
          <ol className="mt-4 grid border-y border-[var(--g-line)] sm:grid-cols-4">
            {c.partner.how.map((entry) => (
              <li
                key={entry.step}
                className="border-b border-[var(--g-line)] px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <span className="font-mono text-[12px] text-[var(--g-text-muted)]">
                  {entry.step}
                </span>
                <strong className="mt-3 block text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
                  {entry.title}
                </strong>
                <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                  {entry.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-[18px] rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]">
            <DestinationEyebrow>{c.partner.attributionTitle}</DestinationEyebrow>
            <p className="mt-2 max-w-prose text-[12px] leading-[1.6] text-[var(--g-text-secondary)]">
              {c.partner.attributionBody}
            </p>
          </div>
        </DestinationSection>

        <DestinationSection>
          <PartnerApplicationPanel />
        </DestinationSection>
      </section>

      {/* ── SECONDARY: machine and app cooperation, then Franchise ───────── */}
      <DestinationSection>
        <DestinationSectionHead eyebrow={c.secondary.title} title={c.secondary.blurb} />
        <div className="grid gap-3 md:grid-cols-3">
          {SECONDARY_OFFERS.map((offer) => (
            <article
              key={offer.title}
              className="flex min-w-0 flex-col rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]"
            >
              <h3 className="text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {offer.title}
              </h3>
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                {offer.body}
              </p>
              <dl className="mt-4 grid gap-3">
                <div className="min-w-0">
                  <dt>
                    <DestinationEyebrow>{c.secondary.includedLabel}</DestinationEyebrow>
                  </dt>
                  <dd className="mt-1 text-[11px] leading-[1.5] text-[var(--g-ink)]">
                    {offer.included}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt>
                    <DestinationEyebrow>{c.secondary.forWhomLabel}</DestinationEyebrow>
                  </dt>
                  <dd className="mt-1 text-[11px] leading-[1.5] text-[var(--g-ink)]">
                    {offer.forWhom}
                  </dd>
                </div>
              </dl>
              <a href={w.ctaHref} className={cn(buttonClasses('ghost', 'sm'), 'mt-5 w-fit')}>
                {c.secondary.cta}
              </a>
            </article>
          ))}
        </div>

      </DestinationSection>

      {/* ── THE FOUR OTHER LANES ──────────────────────────────────────────────
          Partner owns everything above; these four are the rest of Work With
          Us. Each card answers the three questions the gateway promises — what
          is this, who is it for, what next — and nothing more: the subpage
          carries the detail, so repeating it here would make the gateway a wall
          of text.

          Every card links to a route that exists. Machines, Mobile and Trailer
          had no route until now, and a card pointing at a 404 is exactly the
          dead control §27 forbids. */}
      <DestinationSection>
        <DestinationSectionHead
          eyebrow="Pozostałe kierunki"
          title="Chcesz sprzedawać Gellatti, a nie tylko je polecać?"
        />
        <div className="mt-6 grid gap-px border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-2">
          {LANE_CARDS.map((lane) => (
            <article key={lane.href} className="flex flex-col bg-white">
              <div className="aspect-[16/10] overflow-hidden">
                <OwnerAssetImage
                  id={lane.asset}
                  sizes="(min-width: 640px) 46vw, 100vw"
                />
              </div>
              <div className="flex flex-1 flex-col p-[clamp(20px,2.4vw,30px)]">
                <DestinationEyebrow>{lane.kicker}</DestinationEyebrow>
                <h3 className="mt-2 text-[19px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
                  {lane.title}
                </h3>
                <p className="mt-3 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                  {lane.card}
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--g-text-muted)]">
                  {lane.forWhom}
                </p>
                <Link
                  to={lane.href}
                  className={cn(buttonClasses('ghost', 'sm'), 'mt-5 w-fit')}
                >
                  {lane.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </DestinationSection>
    </DestinationSurface>
  );
}
