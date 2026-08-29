import { Link } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import { cooperationCopy } from '@/copy/cooperation';
import { PartnerApplicationPanel } from '@/features/partner-application/PartnerApplicationPanel';

const c = cooperationCopy;
const w = copy.nav.work;

/** The secondary business routes, in the owner's priority order.
 *
 *  OWNER DECISION (2026-08-29): ingredient supply is NOT a public cooperation
 *  route today, so `w.offers.ingredients` is deliberately not listed here. The
 *  copy and every downstream consumer stay in the tree — only the public
 *  presentation drops it, so it can come back without being rebuilt. */
const SECONDARY_OFFERS = [w.offers.machinesApp, w.offers.machineMixtures, w.offers.app] as const;

const sectionLabel = 'text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase';

/**
 * Work with us — the cooperation destination.
 *
 * Partners, influencers and creators are Gellatti's distribution, not a
 * footnote: they own the top of this page and the only complete flow on it.
 * The machine/app routes remain available underneath, and Franchise keeps its
 * own funnel on its own page.
 */
export function WorkWithUsPage() {
  return (
    <DestinationSurface
      eyebrow={c.page.eyebrow}
      title={c.page.title}
      blurb={c.page.blurb}
      contextLabel={c.page.contextLabel}
    >
      {/* ── PRIMARY: partners and creators ───────────────────────────────── */}
      <section aria-labelledby="cooperation-partner">
        <div className="grid overflow-hidden rounded-[12px] border border-ink/12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center bg-[#e7e3dd] p-8 sm:p-10">
            <p className={sectionLabel}>{c.partner.kicker}</p>
            <h2
              id="cooperation-partner"
              className="mt-2 text-3xl leading-[1.05] font-semibold tracking-[-0.035em]"
            >
              {c.partner.headline}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-600">
              {c.partner.body}
            </p>
            <a href="#partner-application" className={cn(buttonClasses('primary', 'md'), 'mt-6 w-max')}>
              {c.partner.cta}
            </a>
          </div>
          <div className="bg-white p-8 sm:p-10">
            <p className={sectionLabel}>{c.partner.whatYouShareTitle}</p>
            <ul className="mt-4 space-y-3">
              {c.partner.whatYouShare.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-stone-600">
                  <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#ef8708]" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10">
          <p className={sectionLabel}>{c.partner.howTitle}</p>
          <ol className="mt-4 grid border-y border-ink/10 sm:grid-cols-4">
            {c.partner.how.map((entry) => (
              <li
                key={entry.step}
                className="border-b border-ink/10 px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <span className="font-mono text-xs text-stone-400">{entry.step}</span>
                <strong className="mt-3 block text-sm font-medium text-ink">{entry.title}</strong>
                <p className="mt-1.5 text-xs leading-relaxed text-stone-500">{entry.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 rounded-[12px] border border-ink/12 bg-white p-6">
          <p className={sectionLabel}>{c.partner.attributionTitle}</p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">
            {c.partner.attributionBody}
          </p>
        </div>

        <div className="mt-8">
          <PartnerApplicationPanel />
        </div>
      </section>

      {/* ── SECONDARY: machine and app cooperation, then Franchise ───────── */}
      <section aria-labelledby="cooperation-secondary" className="mt-16">
        <p className={sectionLabel}>{c.secondary.title}</p>
        <h2
          id="cooperation-secondary"
          className="mt-2 text-2xl font-semibold tracking-[-0.035em]"
        >
          {c.secondary.blurb}
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {SECONDARY_OFFERS.map((offer) => (
            <article key={offer.title} className="flex flex-col rounded-[12px] border border-ink/12 bg-white p-5">
              <h3 className="text-lg font-semibold">{offer.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">{offer.body}</p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className={sectionLabel}>{c.secondary.includedLabel}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{offer.included}</p>
                </div>
                <div>
                  <p className={sectionLabel}>{c.secondary.forWhomLabel}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{offer.forWhom}</p>
                </div>
              </div>
              <a href={w.ctaHref} className={cn(buttonClasses('ghost', 'sm'), 'mt-5 w-max')}>
                {c.secondary.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-ink/12 bg-[#f5f2ee] p-5">
          <div>
            <h3 className="text-lg font-semibold">{c.secondary.franchiseTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              {c.secondary.franchiseBody}
            </p>
          </div>
          <Link to="/franchise" className={buttonClasses('ghost', 'sm')}>
            {c.secondary.franchiseCta}
          </Link>
        </div>
      </section>
    </DestinationSurface>
  );
}
