import { useQuery } from '@tanstack/react-query';
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
import { affiliateCopy, fillTemplate } from '@/copy/affiliate';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { getMyPartnerApplication } from '@/services/partner';
import { PartnerApplicationPanel } from '@/features/partner-application/PartnerApplicationPanel';
import { AffiliateCalculatorPanel } from '@/features/affiliate/AffiliateCalculatorPanel';
import {
  PUBLIC_AFFILIATE_TIERS,
  PUBLIC_GOLD_THRESHOLD,
  formatEuro,
  publicRateCard,
  type PublicAffiliateTier,
} from '@/features/affiliate/publicRateAuthority';

const c = affiliateCopy;

/** Where the application form lives on this page. */
const APPLY_ANCHOR = '#affiliate-application';

/** The customer-facing panel route for an approved affiliate. */
const AFFILIATE_PANEL_HREF = '/partner';

const RATE_ROW_LABEL: Record<string, string> = {
  'home-monthly': c.rates.homeMonthly,
  'pro-monthly': c.rates.proMonthly,
  'home-annual': c.rates.homeAnnual,
  'pro-annual': c.rates.proAnnual,
};

const TIER_NAME: Record<PublicAffiliateTier, string> = {
  standard: c.rates.standardName,
  gold: c.rates.goldName,
};

const TIER_BLURB: Record<PublicAffiliateTier, string> = {
  standard: c.rates.standardBlurb,
  gold: fillTemplate(c.rates.goldBlurbTemplate, { threshold: PUBLIC_GOLD_THRESHOLD }),
};

/**
 * ONE public rate card. Its four figures are read from the rate authority at
 * render time — the page never holds a rate of its own.
 */
function PublicRateCard({ tier }: { tier: PublicAffiliateTier }) {
  const card = publicRateCard(tier);
  const gold = tier === 'gold';
  return (
    <article
      className="flex flex-col bg-white p-[clamp(20px,2.4vw,30px)]"
      data-testid={`affiliate-rate-card-${tier}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[21px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
          {TIER_NAME[tier]}
        </h3>
        {gold ? (
          <span className="rounded-full bg-[var(--g-orange)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-[var(--g-ink)] uppercase">
            {fillTemplate(c.rates.goldBadgeTemplate, { threshold: PUBLIC_GOLD_THRESHOLD })}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
        {TIER_BLURB[tier]}
      </p>
      <dl className="mt-5 grid gap-0 border-t border-[var(--g-line)]">
        {card.map((cell) => {
          const key = `${cell.product}-${cell.cadence}`;
          return (
            <div
              key={key}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--g-line)] py-2.5"
            >
              <dt className="text-[12px] leading-[1.4] text-[var(--g-text-secondary)]">
                {RATE_ROW_LABEL[key]}
              </dt>
              <dd className="text-[16px] font-bold tracking-[-0.02em] text-[var(--g-ink)] tabular-nums">
                {formatEuro(cell.amountCents)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-[11px] leading-[1.5] text-[var(--g-text-muted)]">
        {c.rates.perRenewal}
      </p>
    </article>
  );
}

/**
 * The Elite card. It carries NO number, and structurally cannot: it never
 * touches `publicRateCard`, and the rate authority has no Elite reader.
 */
function CustomTermsCard() {
  return (
    <article
      className="flex flex-col justify-between bg-[#e7e3dd] p-[clamp(20px,2.4vw,30px)]"
      data-testid="affiliate-rate-card-elite"
    >
      <div>
        <h3 className="text-[21px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
          {c.rates.eliteName}
        </h3>
        <p className="mt-4 text-[clamp(18px,1.7vw,22px)] leading-[1.2] font-bold tracking-[-0.03em] text-[var(--g-ink)]">
          {c.rates.eliteTerms}
          <br />
          {c.rates.eliteTalk}
        </p>
        <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
          {c.rates.eliteBody}
        </p>
      </div>
      <a href={APPLY_ANCHOR} className={cn(buttonClasses('primary', 'sm'), 'mt-6 w-fit')}>
        {c.rates.eliteCta}
      </a>
    </article>
  );
}

/**
 * The account-aware hero call to action.
 *
 * It reads the SAME `gellatti_my_partner_application_v1` contract the Work With
 * Us panel reads — there is one application state in this product, and this is
 * a second view of it, never a second source. Signed-out visitors see the join
 * CTA and are never told anything about an account they do not have.
 */
function HeroCta() {
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const authed = authStatus === 'authed';

  const mine = useQuery({
    queryKey: ['partner-application', user?.id ?? 'anonymous'],
    queryFn: getMyPartnerApplication,
    enabled: authed,
  });

  if (!authed) {
    return (
      <button
        type="button"
        onClick={() => openAuthModal()}
        className={buttonClasses('orange', 'md')}
      >
        {c.cta.signedOut}
      </button>
    );
  }

  if (mine.isLoading) {
    return (
      <span className="text-[12px] text-[var(--g-text-muted)]" role="status">
        {c.state.checking}
      </span>
    );
  }

  if (mine.data?.partnerActive) {
    return (
      <Link to={AFFILIATE_PANEL_HREF} className={buttonClasses('orange', 'md')}>
        {c.cta.approved}
      </Link>
    );
  }

  const status = mine.data?.application?.status;
  if (status === 'submitted') {
    return (
      <a href={APPLY_ANCHOR} className={buttonClasses('orange', 'md')}>
        {c.cta.pending}
      </a>
    );
  }
  if (status === 'more_information_needed') {
    return (
      <a href={APPLY_ANCHOR} className={buttonClasses('orange', 'md')}>
        {c.cta.moreInformation}
      </a>
    );
  }

  return (
    <a href={APPLY_ANCHOR} className={buttonClasses('orange', 'md')}>
      {c.cta.signedIn}
    </a>
  );
}

/**
 * GELLATTI AFFILIATE — the public programme page.
 *
 * Six sections and no more (owner §5): hero · one referral pays more than once ·
 * rates + calculator · for whom · how it works · application.
 *
 * This page is NOT Work With Us and does not reuse its information
 * architecture. It also does not reimplement any backend: the application form
 * is the existing `PartnerApplicationPanel` writing the existing
 * `partner_applications` row, and every euro figure is read from the ledger's
 * own rate table through `publicRateAuthority`.
 */
export function AffiliatePage() {
  return (
    <DestinationSurface
      eyebrow={c.page.eyebrow}
      title={c.page.title}
      blurb={c.page.blurb}
      contextLabel={c.page.contextLabel}
      bare
    >
      {/* ── 1 · HERO ───────────────────────────────────────────────────── */}
      <DestinationHero
        variant="editorial"
        eyebrow={c.hero.eyebrow}
        title={`${c.hero.titleLine1} ${c.hero.titleLine2}`}
        blurb={c.hero.lede}
        note={c.hero.note}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <HeroCta />
            {/* The hero band is GRAPHITE. `buttonClasses('ghost')` is
                `border-ink/15 text-ink` — near-black on near-black, i.e. an
                invisible control. The approved vocabulary keeps orange for the
                one primary action, so the secondary is a quiet inverse text
                link rather than a second competing fill. */}
            <a
              href="#affiliate-how"
              className="pro-focus-ring inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[#c6c3bd] underline underline-offset-4 transition-colors hover:text-white"
            >
              {c.cta.secondary}
            </a>
          </div>
        }
        visual={
          <div className="grid h-full place-items-center p-[26px] pt-0 lg:p-[26px]">
            <ul className="w-full space-y-3">
              {c.hero.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-[14px] leading-relaxed font-semibold text-white"
                >
                  <span
                    aria-hidden
                    className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--g-orange)]"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        }
      />

      {/* ── 2 · ONE REFERRAL CAN PAY MORE THAN ONCE ────────────────────── */}
      <DestinationSection>
        <DestinationSectionHead eyebrow={c.recurring.eyebrow} title={c.recurring.title} />
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
          {c.recurring.body}
        </p>
        <ol className="mt-6 grid border-y border-[var(--g-line)] sm:grid-cols-4">
          {c.recurring.steps.map((step, index) => (
            <li
              key={step.title}
              className="border-b border-[var(--g-line)] px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <span aria-hidden className="font-mono text-[12px] text-[var(--g-text-muted)]">
                {index === c.recurring.steps.length - 1 ? '↻' : `0${index + 1}`}
              </span>
              <strong className="mt-3 block text-[14px] leading-[1.35] font-bold text-[var(--g-ink)]">
                {step.title}
              </strong>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] leading-[1.5] text-[var(--g-text-muted)]">
          {c.recurring.honest}
        </p>
      </DestinationSection>

      {/* ── 3 · RATES + CALCULATOR ─────────────────────────────────────── */}
      <DestinationSection id="affiliate-rates">
        <DestinationSectionHead
          eyebrow={c.rates.eyebrow}
          title={c.rates.title}
          helper={c.rates.body}
        />
        <div className="grid gap-px border border-[var(--g-line)] bg-[var(--g-line)] lg:grid-cols-3">
          {PUBLIC_AFFILIATE_TIERS.map((tier) => (
            <PublicRateCard key={tier} tier={tier} />
          ))}
          <CustomTermsCard />
        </div>

        <div className="mt-[18px]">
          <DestinationEyebrow>{c.calculator.eyebrow}</DestinationEyebrow>
          <h3 className="mt-2 mb-4 text-[clamp(20px,2vw,26px)] leading-[1.15] font-bold tracking-[-0.03em] text-[var(--g-ink)]">
            {c.calculator.title}
          </h3>
          <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
            {c.calculator.body}
          </p>
          <AffiliateCalculatorPanel applyHref={APPLY_ANCHOR} />
        </div>
      </DestinationSection>

      {/* ── 4 · FOR WHOM ──────────────────────────────────────────────── */}
      <DestinationSection>
        <DestinationSectionHead eyebrow={c.audience.eyebrow} title={c.audience.title} />
        <div className="grid gap-px border border-[var(--g-line)] bg-[var(--g-line)] sm:grid-cols-3">
          {c.audience.groups.map((group) => (
            <article key={group.title} className="bg-white p-[clamp(20px,2.4vw,30px)]">
              <strong className="block text-[15px] leading-[1.3] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
                {group.title}
              </strong>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                {group.body}
              </p>
            </article>
          ))}
        </div>
      </DestinationSection>

      {/* ── 5 · HOW IT WORKS ──────────────────────────────────────────── */}
      <DestinationSection id="affiliate-how">
        <DestinationSectionHead eyebrow={c.how.eyebrow} title={c.how.title} />
        <ol className="grid border-y border-[var(--g-line)] sm:grid-cols-3">
          {c.how.steps.map((step) => (
            <li
              key={step.index}
              className="border-b border-[var(--g-line)] px-5 py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <span className="font-mono text-[12px] text-[var(--g-text-muted)]">{step.index}</span>
              <strong className="mt-3 block text-[15px] leading-[1.3] font-bold text-[var(--g-ink)]">
                {step.title}
              </strong>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--g-text-secondary)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </DestinationSection>

      {/* ── 6 · APPLICATION ───────────────────────────────────────────── */}
      <DestinationSection>
        <DestinationSectionHead
          eyebrow={c.apply.eyebrow}
          title={c.apply.title}
          helper={c.apply.body}
        />
        <PartnerApplicationPanel
          anchorId="affiliate-application"
          labels={{
            formTitle: c.apply.title,
            signInFirst: c.apply.signedOutBody,
            signInCta: c.apply.signInCta,
            activeTitle: c.state.approvedTitle,
            activeBody: c.state.approvedBody,
            activeCta: c.cta.approved,
            activeHref: AFFILIATE_PANEL_HREF,
            pendingTitle: c.state.pendingTitle,
            pendingBody: c.state.pendingBody,
            informationBody: c.state.moreInformationBody,
          }}
        />
      </DestinationSection>
    </DestinationSurface>
  );
}
