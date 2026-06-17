import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { ImagePlaceholder } from '@/features/shell/MegaMenuItem';
import { copy } from '@/copy/en';

const w = copy.nav.work;

type Offer = { title: string; body: string; included: string; forWhom: string };
const OFFERS: Offer[] = [
  w.offers.app,
  w.offers.machinesApp,
  w.offers.machineMixtures,
  w.offers.ingredients,
];

function OfferBlock({ offer }: { offer: Offer }) {
  return (
    <div className="flex flex-col gap-5">
      <ImagePlaceholder className="aspect-video w-full" />
      <div>
        <h2 className="text-xl font-light text-ivory">{offer.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ivory/60">{offer.body}</p>
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-[0.625rem] tracking-label text-ivory/40 uppercase">{w.includedLabel}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ivory/70">{offer.included}</p>
        </div>
        <div>
          <p className="text-[0.625rem] tracking-label text-ivory/40 uppercase">{w.forWhomLabel}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ivory/70">{offer.forWhom}</p>
        </div>
      </div>
      <a
        href={w.ctaHref}
        className="mt-auto inline-flex w-fit items-center justify-center rounded-md border border-ivory/25 px-5 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/50"
      >
        {w.cta}
      </a>
    </div>
  );
}

/** Work With Us — the polished commercial destination (Phase 6C Slice 3). */
export function WorkWithUsPage() {
  return (
    <DestinationSurface title={w.title} blurb={w.blurb}>
      <div className="grid gap-x-12 gap-y-16 md:grid-cols-2">
        {OFFERS.map((offer) => (
          <OfferBlock key={offer.title} offer={offer} />
        ))}
      </div>
    </DestinationSurface>
  );
}
