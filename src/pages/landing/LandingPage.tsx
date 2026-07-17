/**
 * PINGÜINO public landing (`/`) — UIUX master spec §6, Slice A (owner-approved).
 *
 * REBUILT light-first (owner decision; §21.1): bright premium, highly readable,
 * Polish product language. Replaces the previous unrouted English draft.
 *
 * Structure (spec §6.1 + §6.3):
 *   hero (verbatim headline direction) → Monitor preview (§6.2, static example)
 *   → Jak to działa → Home → Pro → bezpieczna przewaga (ingredient locks)
 *   → plan comparison (qualitative, no invented prices; links /subscription)
 *   → FAQ → final CTA → light footer.
 *
 * Design system: the customer-shell tokens + `touchButtonClasses` — ONE button
 * system, one radius/shadow system, one icon family (§21.1); gold appears ONLY
 * on the golden-range/optimum readout (binding owner decision).
 *
 * SLICE F SEAM: the `#monitor-demo` section is where the interactive Monitor
 * demo will mount later. Until then it renders `LandingMonitorPreview` — a
 * static, honest example (spec §6.2 values), clearly tagged "Przykład".
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { cn } from '@/lib/cn';
import {
  color,
  focusRing,
  motion,
  radius,
  touchButtonClasses,
  type,
} from '@/features/customer-shell/ui';
import { CustomerMenu } from '@/features/customer-shell/ui/CustomerMenu';
import { MonitorHomeReadout } from '@/features/customer-shell/PiMonitorSection';
import { landingCopy as copy } from './landingCopy';
import { buildLandingMonitorDemo } from './landingMonitorDemo';

/** Anchor target of the secondary hero CTA ("Zobacz, jak działa"). */
const HOW_IT_WORKS_ID = 'jak-to-dziala';
/** Slice F mount point — keep this id stable for the interactive Monitor demo. */
const MONITOR_DEMO_ID = 'monitor-demo';

/* ------------------------------------------------------------------ *
 * Local atoms (landing-scoped composition of the shared tokens)      *
 * ------------------------------------------------------------------ */

/** Router-link CTA rendered with the EXACT TouchButton recipe (one system). */
function LinkCta({
  to,
  variant = 'primary',
  size = 'lg',
  children,
  className,
}: {
  to: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'md' | 'lg';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cn(touchButtonClasses(variant, size), className)}>
      {children}
    </Link>
  );
}

/** Quiet uppercase eyebrow above a section title. */
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={cn(type.label, color.textMuted)}>{children}</p>;
}

/** Section container — one readable column, generous rhythm, no walls of text. */
function LandingSection({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  lead?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('border-t border-ink/10', className)}>
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? (
          <h2 className={cn('mt-3 max-w-2xl text-[26px] font-light leading-[1.15] tracking-tight text-ink sm:text-[32px]')}>
            {title}
          </h2>
        ) : null}
        {lead ? <p className={cn('mt-3 max-w-prose', type.secondary, color.textSecondary)}>{lead}</p> : null}
        {children ? <div className={cn((eyebrow || title || lead) && 'mt-10')}>{children}</div> : null}
      </div>
    </section>
  );
}

/** One icon family (stroke, round caps — matches the shell's nav glyphs). */
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
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Bullet list with the shared check glyph — short lines, never a text wall. */
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

/* ------------------------------------------------------------------ *
 * Monitor demo (§6.2, Slice F) — the REAL Monitor, safe demo payload  *
 * ------------------------------------------------------------------ */

/**
 * Owner binding decision (Slice F): this is the SAME `MonitorHomeReadout` the
 * customer flow renders — driven by the real engine through the real customer
 * pipeline on a fixed vanilla payload (see `landingMonitorDemo.ts`). Honestly
 * tagged as an example; no separate imitation exists.
 */
const DEMO_MONITOR_VIEW = buildLandingMonitorDemo();

function LandingMonitorPreview() {
  const m = copy.monitor;
  return (
    <div className={cn('w-full max-w-[420px] border border-ink/10 bg-paper p-6', radius.card, 'shadow-[0_10px_40px_rgba(16,17,19,0.08)]')}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn(type.label, color.textMuted)}>{m.label}</p>
        <span className={cn('rounded-full border border-ink/10 bg-stone-50 px-2.5 py-1 text-[11px] font-medium', color.textSecondary)}>
          {m.exampleTag}
        </span>
      </div>

      <MonitorHomeReadout home={DEMO_MONITOR_VIEW} />

      <p className={cn('mt-6 border-t border-ink/10 pt-4', type.caption, color.textSecondary)}>{m.plansNote}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page                                                               *
 * ------------------------------------------------------------------ */

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] w-full scroll-smooth bg-paper text-ink motion-reduce:scroll-auto">
      {/* Top bar (owner hotfix §2/§3): the SAME global menu the rest of the app
          uses — the landing had no hamburger, so a visitor could not reach the
          machine profile, plans or sign-in from here at all. The header's own
          „Stwórz recepturę” is gone: it duplicated the hero's primary CTA in
          the same viewport (§3) — the hamburger carries navigation instead. */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Wordmark />
        <CustomerMenu showBrand={false} />
      </header>

      {/* Hero (§6.1) — headline left, Monitor preview right / below on mobile. */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-16">
          <div>
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
            <h1 className="mt-4 max-w-2xl text-balance text-[34px] font-light leading-[1.12] tracking-tight sm:text-[44px] lg:text-[52px]">
              {copy.hero.headline}
            </h1>
            <p className={cn('mt-5 max-w-prose text-[17px] leading-relaxed', color.textSecondary)}>
              {copy.hero.subline}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LinkCta to="/start" variant="primary" size="lg">
                {copy.hero.ctaPrimary}
              </LinkCta>
              <a href={`#${HOW_IT_WORKS_ID}`} className={cn(touchButtonClasses('secondary', 'lg'))}>
                {copy.hero.ctaSecondary}
              </a>
            </div>
          </div>

          {/* SLICE F SEAM — the interactive Monitor demo mounts here later. */}
          <section id={MONITOR_DEMO_ID} aria-label={copy.monitor.label} className="justify-self-center lg:justify-self-end">
            <LandingMonitorPreview />
          </section>
        </div>
      </section>

      {/* Jak to działa (§6.3.1). */}
      <LandingSection id={HOW_IT_WORKS_ID} eyebrow={copy.how.label} title={copy.how.title}>
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {copy.how.steps.map((step, i) => (
            <li key={step.title}>
              <p className="font-mono text-[13px] tabular-nums text-stone-500">{String(i + 1).padStart(2, '0')}</p>
              <h3 className={cn('mt-3', type.heading, color.textPrimary)}>{step.title}</h3>
              <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>{step.body}</p>
            </li>
          ))}
        </ol>
      </LandingSection>

      {/* Home + Pro (§6.3.2–3) — two quiet columns, short lines. */}
      <LandingSection>
        <div className="grid gap-12 md:grid-cols-2 md:gap-8">
          <div>
            <Eyebrow>{copy.homeSection.label}</Eyebrow>
            <h2 className={cn('mt-3 text-[22px] font-medium tracking-tight text-ink')}>{copy.homeSection.title}</h2>
            <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>{copy.homeSection.body}</p>
            <div className="mt-6">
              <CheckList items={copy.homeSection.bullets} />
            </div>
          </div>
          <div>
            <Eyebrow>{copy.proSection.label}</Eyebrow>
            <h2 className={cn('mt-3 text-[22px] font-medium tracking-tight text-ink')}>{copy.proSection.title}</h2>
            <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>{copy.proSection.body}</p>
            <div className="mt-6">
              <CheckList items={copy.proSection.bullets} />
            </div>
          </div>
        </div>
      </LandingSection>

      {/* Bezpieczna przewaga (§6.3.4) — descriptive, no fake numbers. */}
      <LandingSection eyebrow={copy.advantage.label} title={copy.advantage.title} lead={copy.advantage.body}>
        <div className="max-w-2xl">
          <CheckList items={copy.advantage.bullets} />
        </div>
      </LandingSection>

      {/* Plan comparison (§6.3.5) — qualitative, NO invented prices. */}
      <LandingSection eyebrow={copy.plans.label} title={copy.plans.title} lead={copy.plans.lead}>
        <div className="grid gap-6 md:grid-cols-2">
          {[copy.plans.home, copy.plans.pro].map((plan) => (
            <div key={plan.name} className={cn('border border-ink/10 bg-paper p-6', radius.card, 'shadow-[0_1px_2px_rgba(16,17,19,0.05)]')}>
              <h3 className={cn(type.heading, color.textPrimary)}>{plan.name}</h3>
              <p className={cn('mt-1', type.secondary, color.textSecondary)}>{plan.tagline}</p>
              <div className="mt-5">
                <CheckList items={plan.bullets} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <LinkCta to="/subscription" variant="secondary" size="md">
            {copy.plans.cta}
          </LinkCta>
          <p className={cn(type.caption, color.textMuted)}>{copy.plans.note}</p>
        </div>
      </LandingSection>

      {/* FAQ (§6.3.6) — plain language, native accessible disclosures. */}
      <LandingSection eyebrow={copy.faq.label} title={copy.faq.title}>
        <div className="max-w-2xl divide-y divide-ink/10 border-y border-ink/10">
          {copy.faq.items.map((item) => (
            <details key={item.q} className="group">
              <summary
                className={cn(
                  'flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden',
                  type.bodyStrong,
                  color.textPrimary,
                  focusRing,
                  motion.base,
                )}
              >
                {item.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className={cn('shrink-0 text-stone-500 group-open:rotate-45', motion.transform)}
                >
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </summary>
              <p className={cn('max-w-prose pb-5', type.secondary, color.textSecondary)}>{item.a}</p>
            </details>
          ))}
        </div>
      </LandingSection>

      {/* Final CTA (§6.3.7). */}
      <LandingSection>
        <div className="flex flex-col items-start gap-6">
          <div>
            <h2 className="max-w-2xl text-[26px] font-light leading-[1.15] tracking-tight text-ink sm:text-[32px]">
              {copy.finalCta.title}
            </h2>
            <p className={cn('mt-3 max-w-prose', type.secondary, color.textSecondary)}>{copy.finalCta.body}</p>
          </div>
          <LinkCta to="/start" variant="primary" size="lg">
            {copy.finalCta.cta}
          </LinkCta>
        </div>
      </LandingSection>

      {/* Light, ordered footer (§6.3.7). */}
      <footer className="border-t border-ink/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3">
            <IvoryLogoMark size={18} tone="ink" className="opacity-70" />
            <span className={cn(type.caption, color.textMuted)}>{copy.footer.tagline}</span>
          </div>
          <nav aria-label="Stopka" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {copy.footer.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  type.caption,
                  color.textSecondary,
                  'rounded underline-offset-4 hover:text-ink hover:underline',
                  focusRing,
                  motion.base,
                )}
              >
                {link.label}
              </Link>
            ))}
            <span className={cn('font-mono text-[12px] tabular-nums', color.textMuted)}>
              © {new Date().getFullYear()} {copy.brand.name}
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Wordmark() {
  return (
    <Link to="/" className={cn('flex items-center gap-3 rounded', focusRing)}>
      <IvoryLogoMark size={26} tone="ink" />
      <span className="leading-none">
        <span className="block text-base font-light tracking-wordmark">{copy.brand.name}</span>
        <span className={cn('mt-1 block text-[0.55rem] font-light tracking-wordmark', color.textMuted)}>
          {copy.brand.sub}
        </span>
      </span>
    </Link>
  );
}
