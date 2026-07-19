import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, touchButtonClasses, type } from '@/features/customer-shell/ui';
import { CustomerMenu } from '@/features/customer-shell/ui/CustomerMenu';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { landingCopy } from '@/pages/landing/landingCopy';
import { publicOffersForProduct } from '@/billing/catalog/offerDisplay';
import { resolveActiveOfferFlags } from '@/billing/catalog/offerFlags';
import {
  startCheckout,
  checkoutOfferKey,
  type BillingCycle,
  type BillingProductId,
} from '@/services/billingCheckout';

/**
 * `/subscription` — the plans / conversion page.
 *
 * Track C (design-system unification, owner 2026-07-17): REBUILT on the
 * light-first customer system so the paywall's own destination stops looking
 * like a different, darker application. It reuses the SAME `landingCopy.plans`
 * tiers the landing shows and the SAME `CustomerMenu` + token system (one
 * button/radius/shadow language). Presentation only — the real checkout arrives
 * with the monetization track; until then the Pro action is honest (sign in to
 * be first), never a dead button.
 */
const s = landingCopy.subscription;
const plans = landingCopy.plans;

function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-1 shrink-0 text-ink">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

/** Monthly + yearly price lines for a product, from the canonical offer catalogue. */
function PriceBlock({ product }: { product: 'home' | 'pro' }) {
  const { monthly, yearly } = publicOffersForProduct(product, resolveActiveOfferFlags());
  return (
    <div className="mt-4 flex items-baseline gap-2">
      {monthly ? (
        <span className={cn('text-[24px] font-medium leading-none tracking-tight tabular-nums', color.textPrimary)}>
          {monthly.label}
        </span>
      ) : null}
      {yearly ? (
        <span className={cn(type.secondary, color.textMuted)}>
          {landingCopy.subscription.orYearly} {yearly.label}
        </span>
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  badge,
  product,
  emphasized,
  children,
}: {
  plan: { name: string; tagline: string; bullets: readonly string[] };
  badge: string;
  product: 'home' | 'pro';
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col border bg-paper p-6 sm:p-7',
        radius.card,
        emphasized ? 'border-ink/20 bg-stone-50 shadow-[0_10px_40px_rgba(16,17,19,0.07)]' : 'border-ink/10 shadow-[0_1px_2px_rgba(16,17,19,0.05)]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn(type.heading, color.textPrimary)}>{plan.name}</h2>
        <span className={cn('rounded-full border border-ink/10 bg-paper px-2.5 py-1 text-[11px] font-medium', color.textSecondary)}>
          {badge}
        </span>
      </div>
      <p className={cn('mt-1', type.secondary, color.textSecondary)}>{plan.tagline}</p>
      {/* Paid plan — price shown from the catalogue (never hardcoded, never "free"). */}
      <PriceBlock product={product} />
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
  const [searchParams] = useSearchParams();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [pending, setPending] = useState<BillingProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = s.checkout;
  const checkoutParam = searchParams.get('checkout');

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
    const result = await startCheckout(checkoutOfferKey(product, cycle));
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

  const cycleButton = (value: BillingCycle, label: string) => (
    <button
      type="button"
      aria-pressed={cycle === value}
      onClick={() => setCycle(value)}
      className={cn(
        'rounded-full px-4 py-1.5 text-[13px] font-medium transition',
        focusRing,
        cycle === value ? 'bg-ink text-paper' : color.textSecondary,
      )}
    >
      {label}
    </button>
  );

  const planButton = (product: BillingProductId, label: string, variant: 'primary' | 'secondary') => (
    <>
      <button
        type="button"
        onClick={() => void onBuy(product)}
        disabled={!available || pending !== null}
        className={cn(touchButtonClasses(variant, 'lg'), 'w-full', pending !== null && 'opacity-70')}
      >
        {pending === product ? c.pending : label}
      </button>
      <p className={cn('mt-3', type.caption, color.textMuted)}>
        {available ? s.billingNote : s.billingUnavailable}
      </p>
    </>
  );

  return (
    <div className="min-h-[100dvh] w-full bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link to="/" className={cn('flex items-center gap-3 rounded', focusRing)}>
          <IvoryLogoMark size={24} tone="ink" />
          <span className="text-base font-light tracking-wordmark">{landingCopy.brand.name}</span>
        </Link>
        <CustomerMenu showBrand={false} />
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-6 sm:px-8 sm:pt-10">
        <p className={cn(type.label, color.textMuted)}>{s.eyebrow}</p>
        <h1 className="mt-3 max-w-2xl text-balance text-[30px] font-light leading-[1.14] tracking-tight text-ink sm:text-[38px]">
          {s.title}
        </h1>
        <p className={cn('mt-4 max-w-prose text-[16px] leading-relaxed', color.textSecondary)}>{s.lead}</p>
        <p className={cn('mt-3 max-w-prose', type.secondary, color.textMuted)}>{s.whatUnlocks}</p>

        {checkoutParam === 'success' ? (
          <p className={cn('mt-6 rounded-xl border border-ink/10 bg-stone-50 px-4 py-3', type.secondary, color.textSecondary)}>
            {c.successNote}
          </p>
        ) : checkoutParam === 'cancelled' ? (
          <p className={cn('mt-6 rounded-xl border border-ink/10 bg-stone-50 px-4 py-3', type.secondary, color.textMuted)}>
            {c.cancelNote}
          </p>
        ) : null}

        <div className="mt-8 flex items-center gap-2">
          <span className={cn(type.caption, color.textMuted)}>{c.cycleLabel}:</span>
          <div className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-paper p-1">
            {cycleButton('monthly', c.monthly)}
            {cycleButton('yearly', c.yearly)}
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <PlanCard plan={plans.home} badge={s.homeBadge} product="home">
            {planButton('home', s.homeCta, 'secondary')}
          </PlanCard>
          <PlanCard plan={plans.pro} badge={s.proBadge} product="pro" emphasized>
            {planButton('pro', s.proCta, 'primary')}
          </PlanCard>
        </div>

        {error ? (
          <p role="alert" className={cn('mt-4 text-[#b4232a]', type.secondary)}>
            {error}
          </p>
        ) : null}

        {/* The only FREE customer experience is Demo — kept clearly separate from
            the paid Home/Pro plans above (owner P0). */}
        <div className={cn('mt-8 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-stone-50 p-5 sm:flex-row sm:items-center sm:justify-between')}>
          <p className={cn('max-w-prose', type.secondary, color.textSecondary)}>{s.demoNote}</p>
          <Link to="/start" className={cn(touchButtonClasses('secondary', 'md'), 'shrink-0')}>
            {s.demoCta}
          </Link>
        </div>

        <section className="mt-16 max-w-md">
          <p className={cn(type.label, color.textMuted)}>{s.futureLabel}</p>
          <ul className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
            {s.future.map((item) => (
              <li key={item} className={cn('flex items-center justify-between gap-3 py-3', type.secondary, color.textSecondary)}>
                {item}
                <span
                  className={cn('shrink-0 rounded-full border border-ink/10 bg-stone-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]', color.textMuted)}
                >
                  {s.futureLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-14 border-t border-ink/10 pt-8">
          <Link
            to="/start"
            className={cn('inline-flex items-center gap-2 rounded underline-offset-4 hover:underline', type.secondary, color.textSecondary, focusRing, motion.base)}
          >
            ← {landingCopy.nav.cta}
          </Link>
        </div>
      </main>
    </div>
  );
}
