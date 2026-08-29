import { DestinationSurface } from '@/components/shared/DestinationSurface';
import {
  CommerceLock,
  DestinationEyebrow,
  DestinationSectionHead,
  EditorialHero,
  ImageDirection,
} from '@/components/shared/destinationEditorial';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';

const w = copy.nav.work;

type Offer = {
  title: string;
  body: string;
  included: string;
  forWhom: string;
  direction: readonly string[];
};

/* The four categories are unchanged. Each one gains the approved image
   DIRECTION the preview shows in its card — a named intent, not an asset. */
const OFFERS: readonly Offer[] = [
  { ...w.offers.app, direction: w.direction.app },
  { ...w.offers.machinesApp, direction: w.direction.machinesApp },
  { ...w.offers.machineMixtures, direction: w.direction.machineMixtures },
  { ...w.offers.ingredients, direction: w.direction.ingredients },
];

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <article className="flex min-w-0 flex-col rounded-[12px] border border-[var(--g-line)] bg-white p-5">
      <ImageDirection lines={[...offer.direction, w.assetNote]} className="h-[150px] w-full" />
      <DestinationEyebrow>{w.cardEyebrow}</DestinationEyebrow>
      <h2 className="mt-1 text-[21px] leading-[1.2] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
        {offer.title}
      </h2>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">{offer.body}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[9px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
            {w.includedLabel}
          </dt>
          <dd className="mt-1 text-[11px] leading-[1.5] text-[var(--g-ink)]">{offer.included}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
            {w.forWhomLabel}
          </dt>
          <dd className="mt-1 text-[11px] leading-[1.5] text-[var(--g-ink)]">{offer.forWhom}</dd>
        </div>
      </dl>
      <a href={w.ctaHref} className={`${buttonClasses('ghost', 'sm')} mt-5 w-fit`}>
        {w.cta}
      </a>
    </article>
  );
}

/**
 * Współpracuj z nami — the approved editorial destination (Gellatti V2.1 §5).
 *
 * The graphite hero, the section head and the four category cards are the
 * preview's own structure. The four categories, their copy and the single
 * mailto destination are the ones that were already here.
 */
export function WorkWithUsPage() {
  return (
    <DestinationSurface title={w.title} blurb={w.blurb} contextLabel={w.title} bare>
      <EditorialHero
        eyebrow={w.heroEyebrow}
        title={w.title}
        blurb={w.blurb}
        directionLines={w.heroDirection}
        action={
          <a href={w.ctaHref} className={buttonClasses('orange', 'md')}>
            {w.heroCta}
          </a>
        }
      />

      <section className="mt-12">
        <DestinationSectionHead
          eyebrow={w.sectionEyebrow}
          title={w.sectionTitle}
          helper={w.sectionHelper}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {OFFERS.map((offer) => (
            <OfferCard key={offer.title} offer={offer} />
          ))}
        </div>
        <CommerceLock>{w.commerceNote}</CommerceLock>
      </section>
    </DestinationSurface>
  );
}
