import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { cn } from '@/lib/cn';
import {
  color,
  elevation,
  focusRing,
  motion,
  radius,
  touchButtonClasses,
  type,
} from '@/features/customer-shell/ui';
import { AppShell } from '@/features/shell/AppShell';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { landingCopy } from '@/pages/landing/landingCopy';
import { PlanComparisonTable } from './PlanComparisonTable';
import { CUSTOMER_HOME_PATH } from '@/app/redirectState';
import {
  annualEconomics,
  monthsGenitivePl,
  publicOffersForProduct,
  type AnnualEconomics,
} from '@/billing/catalog/offerDisplay';
import { resolveActiveOfferFlags } from '@/billing/catalog/offerFlags';
import {
  startCheckout,
  checkoutOfferKey,
  type BillingCycle,
  type BillingProductId,
} from '@/services/billingCheckout';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import {
  CONTINUATION_PARAM,
  decodeContinuation,
  postCheckoutDestination,
} from '@/features/community/domain/shareContinuation';

/**
 * `/subscription` — the plans / conversion page.
 *
 * Track C (design-system unification, owner 2026-07-17): built on the
 * light-first customer system so the paywall's own destination does not look
 * like a different, darker application. It reuses the SAME `landingCopy.plans`
 * tiers and the canonical `AppShell` header. Checkout, authentication and
 * continuation behavior remain owned by this page.
 *
 * Owner redesign (2026-09-18) — THE BOOK: there is no global
 * „Miesięcznie | Rocznie" toggle. Each plan (Home, Pro) owns its own pair of
 * adjacent cadence panels, like two pages of an open book: the selected one
 * takes ≈2/3 of the width, the other ≈1/3, and clicking the narrow one turns
 * the page. Home and Pro are selected INDEPENDENTLY, so a visitor can compare
 * „Home rocznie" against „Pro miesięcznie" without a mode switch.
 *
 * The annual side SELLS ON SIGHT, with real numbers only — the yearly price,
 * the effective monthly, the euro saving and the floored percentage — all from
 * `annualEconomics()`, which derives them from the locked PRICE_CATALOG. The
 * monthly side carries the no-risk promise. The exact conversion top-up is
 * never guessed here; it belongs to the conversion preview.
 *
 * On narrow screens the 2/3–1/3 split is dropped (it would squeeze the price
 * lines): the panels stack, the selected one keeps its full detail and the
 * other collapses to a single readable summary row — same hierarchy, legible.
 */
const s = landingCopy.subscription;
const plans = landingCopy.plans;

function CheckGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="mt-1 shrink-0 text-ink"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <CheckGlyph />
          <span className={cn(type.secondary, color.textSecondary)}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const cy = s.checkout.cycle;

/** „−59%" — the floored, never-overstated discount, shown on both panel states. */
function SavingsBadge({ percent }: { percent: number }) {
  return (
    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold tabular-nums text-paper">
      −{percent}%
    </span>
  );
}

function PriceLine({ amount, unit, large }: { amount: string; unit: string; large?: boolean }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span
        className={cn(
          'font-medium leading-none tracking-tight tabular-nums',
          large ? 'text-[30px]' : 'text-[19px]',
          color.textPrimary,
        )}
      >
        {amount}
      </span>
      <span className={cn(type.caption, color.textMuted, 'whitespace-nowrap')}>{unit}</span>
    </p>
  );
}

/**
 * One page of the book. Selected → full detail at ≈2/3 width; unselected → a
 * single summary row at ≈1/3 that still carries the annual saving. The whole
 * panel is the control (a radio in a two-option group), so the tap target is
 * the page, not a small pill.
 */
function CadencePanel({
  selected,
  onSelect,
  name,
  label,
  summary,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  /** Radio-group name — scoped per plan so Home and Pro never share a selection. */
  name: string;
  label: string;
  summary: ReactNode;
  detail: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      name={name}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        'group flex w-full flex-col items-start gap-2 p-5 text-left sm:p-6',
        // The page turn: 2/3 vs 1/3 of the spread, animated. Dropped below `sm`,
        // where squeezing a price line to a third of a phone would break it.
        'sm:min-w-0 sm:flex-[1_1_0%] sm:transition-[flex-grow] sm:duration-300 sm:ease-out',
        'motion-reduce:transition-none',
        selected ? 'sm:flex-[2_1_0%] bg-paper' : 'bg-[var(--g-ivory)] hover:brightness-[0.985]',
        focusRing,
      )}
    >
      <span
        className={cn(
          type.label,
          selected ? color.textSecondary : color.textMuted,
          'flex items-center gap-2',
        )}
      >
        {label}
      </span>
      {selected ? detail : summary}
    </button>
  );
}

/**
 * A plan's own monthly/annual spread. `economics` is null when the catalogue
 * offers no comparable pair under the active flags — then no saving is claimed
 * at all rather than invented.
 */
function PlanBook({
  product,
  cycle,
  onCycle,
}: {
  product: BillingProductId;
  cycle: BillingCycle;
  onCycle: (cycle: BillingCycle) => void;
}) {
  const flags = resolveActiveOfferFlags();
  const { monthly, yearly } = publicOffersForProduct(product, flags);
  const economics: AnnualEconomics | null = annualEconomics(product, flags);

  if (!monthly || !yearly) {
    // Half a catalogue → show the one real price, never a fabricated pair.
    const only = monthly ?? yearly;
    return only ? <PriceLine amount={only.label} unit="" large /> : null;
  }

  const monthlyAmount = economics?.monthlyLabel ?? monthly.label;
  const annualAmount = economics?.annualLabel ?? yearly.label;

  return (
    <div
      role="radiogroup"
      aria-label={`${s.checkout.cycleLabel} — ${landingCopy.plans[product].name}`}
      className={cn(
        'mt-5 flex flex-col overflow-hidden border border-[var(--g-line)] sm:flex-row sm:items-stretch',
        radius.card,
        elevation.card,
      )}
    >
      <CadencePanel
        name={`cycle-${product}`}
        selected={cycle === 'monthly'}
        onSelect={() => onCycle('monthly')}
        label={cy.monthlyTitle}
        summary={<PriceLine amount={monthlyAmount} unit={cy.perMonth} />}
        detail={
          <>
            <PriceLine amount={monthlyAmount} unit={cy.perMonth} large />
            {/* No-risk promise: the exact top-up is quoted in the conversion
                preview, never guessed on a plan card. */}
            <span className={cn('mt-2 block', type.caption, color.textSecondary)}>
              <span className={cn('font-medium', color.textPrimary)}>{cy.noRiskTitle}.</span>{' '}
              {cy.noRiskBody}
            </span>
          </>
        }
      />

      <div className="h-px w-full bg-[var(--g-line)] sm:h-auto sm:w-px" aria-hidden />

      <CadencePanel
        name={`cycle-${product}`}
        selected={cycle === 'yearly'}
        onSelect={() => onCycle('yearly')}
        label={cy.annualTitle}
        summary={
          <>
            <PriceLine amount={annualAmount} unit={cy.perYear} />
            {economics ? (
              <>
                <span className={cn(type.caption, color.textSecondary, 'tabular-nums')}>
                  {cy.effectivePrefix} {economics.effectiveMonthlyLabel} {cy.effectiveSuffix}
                </span>
                {/* The collapsed page still SELLS: percent + euro saving are
                    visible before anyone clicks. */}
                <span className={cn(type.caption, color.textSecondary, 'tabular-nums')}>
                  {cy.savingsLabel}{' '}
                  <span className={cn('font-medium', color.textPrimary)}>
                    {economics.savingsLabel}
                  </span>
                </span>
                <SavingsBadge percent={economics.savingsPercent} />
              </>
            ) : null}
          </>
        }
        detail={
          <>
            <div className="flex items-center gap-2">
              <PriceLine amount={annualAmount} unit={cy.perYear} large />
              {economics ? <SavingsBadge percent={economics.savingsPercent} /> : null}
            </div>
            {economics ? (
              <>
                <span className={cn(type.secondary, color.textPrimary, 'tabular-nums')}>
                  {cy.effectivePrefix} {economics.effectiveMonthlyLabel} {cy.effectiveSuffix}
                </span>
                <dl className={cn('mt-2 w-full space-y-1', type.caption, color.textSecondary)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>
                      {cy.savingsLabel} {cy.savingsPerYear}
                    </dt>
                    <dd className={cn('font-medium tabular-nums', color.textPrimary)}>
                      {economics.savingsLabel}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>{cy.twelveMonthlyLabel}</dt>
                    <dd className="tabular-nums">{economics.twelveMonthlyLabel}</dd>
                  </div>
                </dl>
                {economics.freeMonthsEquivalent !== null ? (
                  <span className={cn('mt-1 block', type.caption, color.textSecondary)}>
                    {cy.equivalentPrefix} {economics.freeMonthsEquivalent}{' '}
                    {monthsGenitivePl(economics.freeMonthsEquivalent)} {cy.equivalentSuffix}.
                  </span>
                ) : null}
                <span className={cn('mt-1 block', type.caption, color.textMuted)}>
                  {cy.annualAnchorNote}
                </span>
              </>
            ) : null}
          </>
        }
      />
    </div>
  );
}

function PlanCard({
  plan,
  badge,
  product,
  cycle,
  onCycle,
  emphasized,
  children,
}: {
  plan: { name: string; tagline: string; bullets: readonly string[] };
  badge: string;
  product: BillingProductId;
  cycle: BillingCycle;
  onCycle: (cycle: BillingCycle) => void;
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col border bg-paper p-6 sm:p-7',
        radius.card,
        emphasized
          ? 'border-[var(--g-line-strong)] bg-[var(--g-ivory)] shadow-[0_10px_40px_rgba(16,17,19,0.07)]'
          : 'border-[var(--g-line)] shadow-[0_1px_2px_rgba(16,17,19,0.05)]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn(type.heading, color.textPrimary)}>{plan.name}</h2>
        <span
          className={cn(
            'rounded-full border border-[var(--g-line)] bg-paper px-2.5 py-1 text-[11px] font-medium',
            color.textSecondary,
          )}
        >
          {badge}
        </span>
      </div>
      <p className={cn('mt-1', type.secondary, color.textSecondary)}>{plan.tagline}</p>
      {/* This plan's OWN cadence spread — independent of the other plan's. */}
      <PlanBook product={product} cycle={cycle} onCycle={onCycle} />
      <div className="mt-6 flex-1">
        <CheckList items={plan.bullets} />
      </div>
      <div className="mt-7">{children}</div>
    </div>
  );
}

export function SubscriptionPage() {
  const available = useAuthStore((st) => st.available);
  const status = useAuthStore((st) => st.status);
  const openAuthModal = useAuthModalStore((st) => st.open);
  const persona = useProCorePersona();
  const [searchParams] = useSearchParams();
  // Each plan carries its OWN cadence — there is no global toggle, so a
  // visitor can weigh „Home rocznie" against „Pro miesięcznie" side by side.
  const [cycle, setCycle] = useState<Record<BillingProductId, BillingCycle>>({
    home: 'monthly',
    pro: 'monthly',
  });
  const [pending, setPending] = useState<BillingProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = s.checkout;
  const navigate = useNavigate();
  const checkoutParam = searchParams.get('checkout');
  // §14/§19: a visitor who arrived from a shared recipe or a Community page
  // carries that journey in the URL. It is preserved THROUGH checkout and
  // consumed on the way back, so „zobaczyłam recepturę → kupiłam → mogę ją
  // zrobić" never breaks at the redirect.
  const continuation = decodeContinuation(searchParams.get(CONTINUATION_PARAM));

  useEffect(() => {
    if (checkoutParam !== 'success') return;
    const destination = postCheckoutDestination(searchParams.toString(), 'success');
    if (destination) navigate(destination, { replace: true });
  }, [checkoutParam, searchParams, navigate]);

  // The paid CTA: a signed-out visitor is sent to sign in first (the checkout
  // function authenticates from the JWT); a signed-in visitor is redirected to
  // the hosted checkout for the selected plan + cycle. Failures are shown honestly.
  const onBuy = async (product: BillingProductId) => {
    setError(null);
    if (!available) return;
    if (status !== 'authed') {
      openAuthModal();
      return;
    }
    setPending(product);
    const result = await startCheckout(checkoutOfferKey(product, cycle[product]), continuation);
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setPending(null);
    if (result.reason === 'not_signed_in') {
      openAuthModal();
      return;
    }
    setError(
      result.reason === 'already_subscribed'
        ? c.errorAlready
        : result.reason === 'unavailable'
          ? c.errorUnavailable
          : c.errorGeneric,
    );
  };

  const selectCycle = (product: BillingProductId) => (next: BillingCycle) =>
    setCycle((current) => ({ ...current, [product]: next }));

  /** "49 € / rok" for the cadence this plan's book currently shows. */
  const selectedOfferLabel = (product: BillingProductId): string => {
    const offers = publicOffersForProduct(product, resolveActiveOfferFlags());
    const offer = cycle[product] === 'yearly' ? offers.yearly : offers.monthly;
    return offer?.label ?? '';
  };

  // Tier ranking so each card reflects the user's plan honestly: the card that
  // MATCHES the plan says "current plan", a LOWER card says "included in your
  // plan", and a HIGHER card keeps its upgrade CTA (e.g. Home user → Pro card).
  const tierRank = { demo: 0, home: 1, pro: 2 } as const;
  const personaRank = tierRank[persona];

  const statusPill = (glyph: boolean, label: string, note: string) => (
    <>
      <div
        className={cn(
          'flex w-full items-center justify-center gap-2 border border-[var(--g-line)] bg-[var(--g-ivory)] px-4 py-3 text-[15px] font-medium',
          radius.card,
          color.textSecondary,
        )}
      >
        {glyph ? <CheckGlyph /> : null}
        {label}
      </div>
      <p className={cn('mt-3', type.caption, color.textMuted)}>{note}</p>
    </>
  );

  const planButton = (
    product: BillingProductId,
    label: string,
    variant: 'primary' | 'secondary',
  ) => {
    const productRank = tierRank[product];
    if (personaRank === productRank) return statusPill(true, c.owned, c.ownedNote);
    if (personaRank > productRank) return statusPill(false, c.included, c.includedNote);
    return (
      <>
        <button
          type="button"
          onClick={() => void onBuy(product)}
          disabled={!available || pending !== null}
          className={cn(
            touchButtonClasses(variant, 'lg'),
            'w-full',
            pending !== null && 'opacity-70',
          )}
        >
          {/* The button names the cadence it will charge — the selected page of
              the book, never a stale global mode. */}
          {pending === product ? c.pending : `${label} · ${selectedOfferLabel(product)}`}
        </button>
        <p className={cn('mt-3', type.caption, color.textMuted)}>
          {available ? s.billingNote : s.billingUnavailable}
        </p>
      </>
    );
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-6 sm:px-8 sm:pt-10">
        <p className={cn(type.label, color.textMuted)}>{s.eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-balance text-[38px] font-semibold leading-[0.99] tracking-[-0.04em] text-ink sm:text-[52px]">
          {s.title}
        </h1>
        <p className={cn('mt-4 max-w-prose text-[16px] leading-relaxed', color.textSecondary)}>
          {s.lead}
        </p>
        <ul className="mt-4 grid max-w-prose gap-1" data-testid="plan-hero-lines">
          {s.whatUnlocks.map((line) => (
            <li key={line} className={cn(type.secondary, color.textSecondary)}>
              {line}
            </li>
          ))}
        </ul>

        {checkoutParam === 'success' ? (
          <p
            className={cn(
              'mt-6 rounded-xl border border-[var(--g-line)] bg-[var(--g-ivory)] px-4 py-3',
              type.secondary,
              color.textSecondary,
            )}
          >
            {c.successNote}
          </p>
        ) : checkoutParam === 'cancelled' ? (
          <p
            className={cn(
              'mt-6 rounded-xl border border-[var(--g-line)] bg-[var(--g-ivory)] px-4 py-3',
              type.secondary,
              color.textMuted,
            )}
          >
            {c.cancelNote}
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <PlanCard
            plan={plans.home}
            badge={s.homeBadge}
            product="home"
            cycle={cycle.home}
            onCycle={selectCycle('home')}
          >
            {planButton('home', s.homeCta, 'secondary')}
          </PlanCard>
          <PlanCard
            plan={plans.pro}
            badge={s.proBadge}
            product="pro"
            cycle={cycle.pro}
            onCycle={selectCycle('pro')}
            emphasized
          >
            {planButton('pro', s.proCta, 'primary')}
          </PlanCard>
        </div>

        {error ? (
          <p role="alert" className={cn('mt-4 text-status-error', type.secondary)}>
            {error}
          </p>
        ) : null}

        {/* The only FREE customer experience is Demo — kept clearly separate from
            the paid Home/Pro plans above (owner P0). */}
        <div
          className={cn(
            'mt-8 flex flex-col gap-3 rounded-2xl border border-[var(--g-line)] bg-[var(--g-ivory)] p-5 sm:flex-row sm:items-center sm:justify-between',
          )}
        >
          <p className={cn('max-w-prose', type.secondary, color.textSecondary)}>{s.demoNote}</p>
          <Link
            to={CUSTOMER_HOME_PATH}
            className={cn(touchButtonClasses('secondary', 'md'), 'shrink-0')}
          >
            {s.demoCta}
          </Link>
        </div>

        {/* DESIGN V3.0 §P1 — the comparison, then who each plan is for, then the
            bridge to the account. The „Wkrótce" list that used to sit here is gone
            in full: two of its three items are shipped (they live in Konto → Plan
            i rozliczenia) and the third was never a plan we sell. */}
        <PlanComparisonTable />

        <section className="mt-14 grid gap-6 sm:grid-cols-2" data-testid="plan-audience">
          <div>
            <h3 className={cn('text-[15px] font-semibold', color.textPrimary)}>
              {s.audience.homeTitle}
            </h3>
            <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>
              {s.audience.homeBody}
            </p>
          </div>
          <div>
            <h3 className={cn('text-[15px] font-semibold', color.textPrimary)}>
              {s.audience.proTitle}
            </h3>
            <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>
              {s.audience.proBody}
            </p>
          </div>
        </section>

        <section className="mt-14 max-w-prose" data-testid="plan-account-bridge">
          <p className={cn(type.label, color.textMuted)}>{s.bridge.label}</p>
          <ul className="mt-3 grid gap-2">
            {s.bridge.lines.map((line) => (
              <li key={line} className={cn(type.secondary, color.textSecondary)}>
                {line}
              </li>
            ))}
          </ul>
          <Link
            to="/account?section=billing"
            className={cn(touchButtonClasses('secondary', 'md'), 'mt-4 inline-flex')}
            data-testid="plan-account-bridge-cta"
          >
            {s.bridge.cta}
          </Link>
        </section>

        <div className="mt-14 border-t border-[var(--g-line)] pt-8">
          <Link
            to={CUSTOMER_HOME_PATH}
            className={cn(
              'inline-flex items-center gap-2 rounded underline-offset-4 hover:underline',
              type.secondary,
              color.textSecondary,
              focusRing,
              motion.base,
            )}
          >
            ← {landingCopy.nav.cta}
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
