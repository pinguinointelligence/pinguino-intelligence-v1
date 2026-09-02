import { useMemo, useState } from 'react';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { affiliateCopy, fillTemplate } from '@/copy/affiliate';
import {
  CUSTOM_TERMS_TIER,
  PUBLIC_AFFILIATE_TIERS,
  PUBLIC_GOLD_THRESHOLD,
  formatEuro,
  publicRateCard,
  type PublicAffiliateTier,
} from '@/features/affiliate/publicRateAuthority';
import {
  EMPTY_COUNTS,
  MAX_CUSTOMERS_PER_PLAN,
  calculateAffiliateCommission,
  isCustomTermsMode,
  normalizeCount,
  type AffiliateCalculatorMode,
  type AffiliateCustomerCounts,
} from '@/features/affiliate/affiliateCalculator';

/**
 * GELLATTI AFFILIATE — Rewizja 1 (owner-approved 2026-09-02).
 *
 * The rejected page weighed everything the same: box, box, grid, grid, table.
 * This one has THREE heavy moments and silence between them — the black hero,
 * the graphite Elite card, and the calculator's result. Everything else is
 * white or greige and exists to give those three room.
 *
 * Orange is reserved for action and change: the hero CTA, Elite's edge, the
 * end of the commission flow, and the Gold threshold. Four places, all live.
 * The headline is deliberately NOT orange — that would be emphasis, not action.
 *
 * Every figure is read at render time from `publicRateAuthority`, which
 * delegates to the same `resolveCommission` the ledger uses, so this page and
 * the money can never disagree. Nothing here restates a rate.
 */

const c = affiliateCopy;

const EYEBROW =
  'text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase';
const SECTION_TITLE =
  'mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)] sm:text-[28px]';

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-[62ch]">
      <span className={EYEBROW}>{eyebrow}</span>
      <h2 className={SECTION_TITLE}>{title}</h2>
      {body ? (
        <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--g-text-secondary)]">{body}</p>
      ) : null}
    </div>
  );
}

/* ── 1. HERO — the only full black anchor on the page ─────────────────────── */

function Hero() {
  return (
    <section className="overflow-hidden rounded-[20px] bg-[var(--g-ink)] text-white sm:rounded-[24px]">
      <div className="grid lg:grid-cols-2">
        <div className="px-7 py-9 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <span className="text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[#a9a49b] uppercase">
            {c.hero.eyebrow}
          </span>
          <h1 className="mt-3.5 text-[34px] leading-[1.06] font-bold tracking-[-0.035em] text-balance sm:text-[46px] lg:text-[52px]">
            {c.hero.titleLine1}
            <br />
            {c.hero.titleLine2}
          </h1>
          <p className="mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-[#c9c5bd]">
            {c.hero.lede}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <a href="#affiliate-application" className={buttonClasses('primary', 'md')}>
              {c.cta.signedOut}
            </a>
            <a
              href="#affiliate-how"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/35 px-6 text-[14px] font-semibold text-white transition-colors hover:border-white/60"
            >
              {c.cta.secondary}
            </a>
          </div>
          <p className="mt-7 border-t border-white/12 pt-5 text-[12px] leading-[1.5] text-[#9d988f]">
            {c.hero.note}
          </p>
        </div>

        {/* The photograph IS the right half — clipped by the hero's own radius,
            no card, no border, no overlay. It already carries its lighting. */}
        <div className="relative min-h-[280px] bg-[#0b0c0d] sm:min-h-[360px] lg:min-h-[520px]">
          <img
            src="/images/affiliate/hero.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}

/* ── 2. COMMISSION FLOW + the customer's own gain ─────────────────────────── */

function RecurringFlow() {
  return (
    <section id="affiliate-how" className="mt-[58px] scroll-mt-[110px]">
      <SectionHead eyebrow={c.recurring.eyebrow} title={c.recurring.title} body={c.recurring.body} />

      <ol className="mt-7 flex flex-col gap-6 sm:flex-row sm:gap-0">
        {c.recurring.steps.map((step, index) => {
          const last = index === c.recurring.steps.length - 1;
          return (
            <li key={step.title} className={cn('flex-1', !last && 'sm:pr-6')}>
              <div className="relative h-[11px]">
                <span
                  className={cn(
                    'block h-[11px] w-[11px] rounded-full border',
                    last
                      ? 'border-[var(--g-orange)] bg-[var(--g-orange)] shadow-[0_0_0_5px_rgba(245,138,7,0.14)]'
                      : 'border-[var(--g-line)] bg-[var(--g-line-strong,#cfcac1)]',
                  )}
                />
                {last ? null : (
                  <span className="absolute top-1/2 right-0 left-[11px] hidden h-px -translate-y-1/2 bg-[var(--g-line)] sm:block" />
                )}
              </div>
              <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.015em] text-[var(--g-ink)]">
                {step.title}
              </h3>
              <p className="mt-1.5 max-w-[28ch] text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
                {step.body}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-[12.5px] leading-[1.5] text-[var(--g-text-muted)]">
        {c.recurring.honest}
      </p>

      {/* The flow above says only "the partner earns". The customer gains too,
          and saying so out loud is what makes the link worth sharing. One line
          and one figure — not a second section. */}
      <aside className="mt-7 flex flex-col gap-5 rounded-[16px] bg-[#f0ede7] px-6 py-6 sm:flex-row sm:items-center sm:gap-7 sm:px-8">
        <span className="text-[40px] leading-none font-bold tracking-[-0.04em] text-[var(--g-ink)] tabular-nums">
          {c.customerBenefit.figure}
          <span className="text-[14px] font-semibold tracking-[-0.01em]">
            {c.customerBenefit.figureUnit}
          </span>
        </span>
        <div>
          <h3 className="text-[16px] font-semibold tracking-[-0.018em] text-[var(--g-ink)]">
            {c.customerBenefit.title}
          </h3>
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
            {fillTemplate(c.customerBenefit.bodyTemplate, {
              emphasis: c.customerBenefit.emphasis,
            })}{' '}
            {c.customerBenefit.monthlyNote}
          </p>
        </div>
      </aside>
    </section>
  );
}

/* ── 3. RATES ─────────────────────────────────────────────────────────────── */

const RATE_LABEL: Record<string, string> = {
  'home:monthly': c.rates.homeMonthly,
  'pro:monthly': c.rates.proMonthly,
  'home:annual': c.rates.homeAnnual,
  'pro:annual': c.rates.proAnnual,
};

/**
 * OWNER-PENDING (Rewizja 1 §5). No Starter Pack commission has ever been
 * frozen — `commission_rules` holds only home/pro × monthly/annual. These are
 * a PROPOSAL, so the row is muted, dashed and captioned, and is deliberately
 * NOT read through `publicRateAuthority`: it is not a rate yet.
 */
const STARTER_PACK_PROPOSAL_CENTS: Record<PublicAffiliateTier, number> = {
  standard: 900,
  gold: 1900,
};

function TierCard({ tier }: { tier: PublicAffiliateTier }) {
  const gold = tier === 'gold';
  return (
    <article
      className={cn(
        'flex flex-col rounded-[16px] border bg-white px-6 py-7 sm:px-7',
        gold ? 'border-[rgba(245,138,7,0.4)]' : 'border-[var(--g-line-quiet,#e6e2db)]',
      )}
    >
      <span className={EYEBROW}>{gold ? c.rates.goldName : c.rates.standardName}</span>
      <h3 className="mt-2.5 text-[21px] font-bold tracking-[-0.028em] text-[var(--g-ink)]">
        {gold ? c.rates.goldName : c.rates.standardName}
      </h3>
      <p className="mt-2 min-h-[42px] text-[13px] leading-[1.55] text-[var(--g-text-secondary)]">
        {gold
          ? fillTemplate(c.rates.goldBlurbTemplate, { threshold: PUBLIC_GOLD_THRESHOLD })
          : c.rates.standardBlurb}
      </p>
      {gold ? (
        <span className="mt-3 self-start rounded-full border border-[rgba(245,138,7,0.34)] bg-[rgba(245,138,7,0.1)] px-3 py-1.5 text-[11.5px] font-semibold text-[#8a5300]">
          {fillTemplate(c.rates.goldBadgeTemplate, { threshold: PUBLIC_GOLD_THRESHOLD })}
        </span>
      ) : null}

      <dl className="mt-5 flex flex-col gap-3.5 border-t border-[var(--g-line-quiet,#e6e2db)] pt-5">
        {publicRateCard(tier).map((rate) => (
          <div
            key={`${rate.product}:${rate.cadence}`}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[12px] font-semibold tracking-[0.04em] text-[var(--g-text-muted)]">
              {RATE_LABEL[`${rate.product}:${rate.cadence}`]}
            </dt>
            <dd className="m-0 text-[14.5px] font-semibold text-[var(--g-ink)] tabular-nums">
              {formatEuro(rate.amountCents)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-[var(--g-line)] pt-3">
          <dt className="text-[12px] font-semibold tracking-[0.04em] text-[var(--g-text-muted)]">
            {c.rates.starterPackLabel}
          </dt>
          <dd className="m-0 text-[14.5px] font-semibold text-[var(--g-text-muted)] tabular-nums">
            {formatEuro(STARTER_PACK_PROPOSAL_CENTS[tier])}
          </dd>
        </div>
      </dl>
      <p className="mt-2.5 text-[11px] leading-[1.45] text-[var(--g-text-muted)]">
        {c.rates.starterPackPending}
      </p>
    </article>
  );
}

function Rates() {
  return (
    <section id="affiliate-rates" className="mt-[58px] scroll-mt-[110px]">
      <SectionHead eyebrow={c.rates.eyebrow} title={c.rates.title} body={c.rates.body} />
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {PUBLIC_AFFILIATE_TIERS.map((tier) => (
          <TierCard key={tier} tier={tier} />
        ))}

        {/* ELITE — the second anchor, and small. The orange edge sits DIRECTLY
            on the graphite: the card carries no border, so nothing reads as
            black → orange → black. This is the Shop treatment. */}
        <article
          data-testid="affiliate-elite-card"
          className="relative flex flex-col overflow-hidden rounded-[16px] bg-[var(--g-graphite,#191a1d)] py-7 pr-6 pl-9 text-white sm:pr-7 sm:pl-10"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[9px] bg-[var(--g-orange)]"
          />
          <span className="text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[#8f8a81] uppercase">
            {c.rates.eliteName}
          </span>
          <h3 className="mt-2.5 text-[21px] font-bold tracking-[-0.028em]">{c.rates.eliteTerms}</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-[#bcb7ae]">{c.rates.eliteTalk}</p>
          <div className="mt-auto pt-7">
            <a
              href="#affiliate-application"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/35 px-6 text-[14px] font-semibold text-white transition-colors hover:border-white/60"
            >
              {c.rates.eliteCta}
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ── 4. CALCULATOR — one tool; the RESULT is the anchor ───────────────────── */

const FIELDS: ReadonlyArray<{ key: keyof AffiliateCustomerCounts; label: string }> = [
  { key: 'homeMonthly', label: c.calculator.homeMonthlyLabel },
  { key: 'proMonthly', label: c.calculator.proMonthlyLabel },
  { key: 'homeAnnual', label: c.calculator.homeAnnualLabel },
  { key: 'proAnnual', label: c.calculator.proAnnualLabel },
];

function Calculator() {
  const [mode, setMode] = useState<AffiliateCalculatorMode>('standard');
  const [counts, setCounts] = useState<AffiliateCustomerCounts>({
    ...EMPTY_COUNTS,
    homeMonthly: 10,
    proMonthly: 5,
    homeAnnual: 3,
    proAnnual: 2,
  });

  const estimate = useMemo(
    () => (isCustomTermsMode(mode) ? null : calculateAffiliateCommission(mode, counts)),
    [mode, counts],
  );

  const setField = (key: keyof AffiliateCustomerCounts, raw: string) =>
    setCounts((prev) => ({ ...prev, [key]: normalizeCount(raw) }));

  return (
    <section id="affiliate-calculator" className="mt-[58px] scroll-mt-[110px]">
      <SectionHead
        eyebrow={c.calculator.eyebrow}
        title={c.calculator.title}
        body={c.calculator.body}
      />

      <div className="mt-7 grid overflow-hidden rounded-[20px] border border-[var(--g-line-quiet,#e6e2db)] bg-white lg:grid-cols-[1fr_440px]">
        <div className="px-6 py-7 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="block text-[11.5px] font-semibold tracking-[0.05em] text-[var(--g-text-muted)] uppercase">
                  {field.label}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_CUSTOMERS_PER_PLAN}
                  value={counts[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                  className="mt-2 h-[46px] w-full rounded-full border border-[var(--g-line)] bg-white px-4 text-[15px] font-semibold text-[var(--g-ink)] tabular-nums outline-none focus-visible:border-[var(--g-orange)]"
                />
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={c.calculator.modeLabel}
              className="flex rounded-full border border-[var(--g-line-quiet,#e6e2db)] bg-[var(--g-ivory-deep,#f6f4ef)] p-1"
            >
              {[...PUBLIC_AFFILIATE_TIERS, CUSTOM_TERMS_TIER].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  aria-pressed={mode === option}
                  className={cn(
                    'rounded-full px-5 py-2 text-[12.5px] font-semibold transition-colors',
                    mode === option
                      ? 'bg-[var(--g-ink)] text-white'
                      : 'text-[var(--g-text-secondary)]',
                  )}
                >
                  {option === CUSTOM_TERMS_TIER
                    ? c.rates.eliteName
                    : option === 'gold'
                      ? c.rates.goldName
                      : c.rates.standardName}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCounts({ ...EMPTY_COUNTS })}
              className={buttonClasses('ghost', 'sm')}
            >
              {c.calculator.reset}
            </button>
          </div>
        </div>

        {/* Greige as the calm summary surface. The number is the anchor; the
            breakdown below is the arithmetic that produces it, in order. */}
        <aside className="flex flex-col bg-[#f0ede7] px-6 py-7 sm:px-8">
          {estimate ? (
            <>
              <span className={EYEBROW}>{c.calculator.totalPerYear}</span>
              <strong
                data-testid="affiliate-total-per-year"
                className="mt-3 block text-[38px] leading-[1.05] font-bold tracking-[-0.038em] text-[var(--g-ink)] tabular-nums sm:text-[44px]"
              >
                {formatEuro(estimate.totalPerYearCents)}
              </strong>

              <span className={cn(EYEBROW, 'mt-7 block')}>{c.calculator.averagePerMonth}</span>
              <strong className="mt-2.5 block text-[28px] leading-[1.05] font-bold tracking-[-0.035em] text-[var(--g-ink)] tabular-nums">
                {formatEuro(estimate.averagePerMonthCents)}
              </strong>

              <div className="mt-7 flex flex-col gap-2.5 border-t border-[var(--g-line)] pt-5 text-[13px] text-[var(--g-text-secondary)]">
                <div className="flex justify-between gap-3">
                  <span>{c.calculator.monthlyFromMonthly}</span>
                  <b className="font-semibold text-[var(--g-ink)] tabular-nums">
                    {formatEuro(estimate.monthlyFromMonthlyCents)}
                  </b>
                </div>
                <div className="flex justify-between gap-3">
                  <span>{c.calculator.fromAnnualRenewals}</span>
                  <b className="font-semibold text-[var(--g-ink)] tabular-nums">
                    {formatEuro(estimate.fromAnnualRenewalsCents)}
                  </b>
                </div>
              </div>
              <p className="mt-auto pt-6 text-[11.5px] leading-[1.5] text-[var(--g-text-muted)]">
                {c.calculator.assumption}
              </p>
            </>
          ) : (
            /* Elite has no public rate — the panel says so and routes to a
               conversation. There is deliberately no number to show. */
            <div className="flex h-full flex-col justify-center">
              <span className={EYEBROW}>{c.rates.eliteName}</span>
              <p className="mt-3 text-[18px] leading-[1.35] font-semibold text-[var(--g-ink)]">
                {c.calculator.eliteState}
              </p>
              <a
                href="#affiliate-application"
                className={cn(buttonClasses('primary', 'sm'), 'mt-5 self-start')}
              >
                {c.calculator.eliteCta}
              </a>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/* ── 5. AUDIENCE · 6. THREE STEPS · 7. CTA ───────────────────────────────── */

function Audience() {
  return (
    <section className="mt-[58px]">
      <SectionHead eyebrow={c.audience.eyebrow} title={c.audience.title} />
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {c.audience.groups.map((group) => (
          <article
            key={group.title}
            className="rounded-[16px] border border-[var(--g-line-quiet,#e6e2db)] bg-white px-6 py-6"
          >
            <h3 className="text-[17px] font-semibold tracking-[-0.018em] text-[var(--g-ink)]">
              {group.title}
            </h3>
            <p className="mt-2 text-[13px] leading-[1.58] text-[var(--g-text-secondary)]">
              {group.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowToStart() {
  return (
    <section className="mt-[58px]">
      <SectionHead eyebrow={c.how.eyebrow} title={c.how.title} />
      <div className="mt-7 grid gap-6 lg:grid-cols-3">
        {c.how.steps.map((step) => (
          <article key={step.index} className="flex items-start gap-4">
            <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-full border border-[var(--g-line)] bg-white text-[14px] font-semibold text-[var(--g-ink)] tabular-nums">
              {step.index}
            </span>
            <div>
              <h3 className="pt-2.5 text-[16px] font-semibold tracking-[-0.018em] text-[var(--g-ink)]">
                {step.title}
              </h3>
              <p className="mt-1.5 max-w-[32ch] text-[13px] leading-[1.58] text-[var(--g-text-secondary)]">
                {step.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ApplyBand() {
  return (
    <section id="affiliate-application" className="mt-[58px] scroll-mt-[110px]">
      <div className="flex flex-col gap-6 rounded-[20px] bg-[#f0ede7] px-7 py-9 sm:px-10 lg:flex-row lg:items-center lg:gap-10">
        <div>
          <span className={EYEBROW}>{c.apply.eyebrow}</span>
          <h2 className={SECTION_TITLE}>{c.apply.title}</h2>
          <p className="mt-2.5 max-w-[54ch] text-[14px] leading-relaxed text-[var(--g-text-secondary)]">
            {c.apply.body}
          </p>
        </div>
        {/* The CTA states the INTENT. Signing in is a step inside the flow, not
            the promise on the button — the visitor never loses what they came
            to do. */}
        <div className="flex flex-none flex-col items-start gap-2.5 lg:ml-auto lg:items-end">
          <a href="/partner" className={buttonClasses('primary', 'md')}>
            {c.apply.signInCta}
          </a>
          <span className="text-[12px] text-[var(--g-text-muted)]">{c.apply.signedOutBody}</span>
        </div>
      </div>
    </section>
  );
}

export function AffiliatePage() {
  return (
    <DestinationSurface
      bare
      eyebrow={c.page.eyebrow}
      title={c.page.title}
      blurb={c.page.blurb}
      contextLabel={c.page.contextLabel}
    >
      <div data-testid="affiliate-page">
        <Hero />
        <RecurringFlow />
        <Rates />
        <Calculator />
        <Audience />
        <HowToStart />
        <ApplyBand />
      </div>
    </DestinationSurface>
  );
}
