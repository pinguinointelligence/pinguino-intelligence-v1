import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ComingSoonRow, DestinationSurface } from '@/components/shared/DestinationSurface';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';

const s = copy.nav.subscription;

function Tier({
  name,
  tagline,
  features,
  cta,
  emphasized,
}: {
  name: string;
  tagline: string;
  features: readonly string[];
  cta: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className={cn('rounded-lg p-6', emphasized && 'bg-ivory/[0.03] ring-1 ring-inset ring-ivory/15')}>
      <h2 className="text-xl font-light text-ivory">{name}</h2>
      <p className="mt-1 text-sm text-ivory/55">{tagline}</p>
      <ul className="mt-6 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-ivory/75">
            <span aria-hidden className="mt-[0.4rem] size-1 shrink-0 rounded-full bg-ivory/40" />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-7">{cta}</div>
    </div>
  );
}

const ctaBase =
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-colors';

/** Subscription — public plans info (Phase 6C Slice 3). No payment provider, no checkout flow. */
export function SubscriptionPage() {
  return (
    <DestinationSurface title={s.title} blurb={s.blurb}>
      <p className="max-w-xl text-sm leading-relaxed text-ivory/55">{s.whatUnlocks}</p>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <Tier
          name={s.free}
          tagline={s.freeTagline}
          features={s.freeFeatures}
          cta={
            <Link to="/" className={cn(ctaBase, 'border border-ivory/25 text-ivory hover:border-ivory/50')}>
              {s.freeCta}
            </Link>
          }
        />
        <Tier
          name={s.pro}
          tagline={s.proTagline}
          features={s.proFeatures}
          emphasized
          cta={
            <div>
              {/* Placeholder upgrade — billing is a later release (no payment provider here). */}
              <button type="button" className={cn(ctaBase, 'bg-ivory text-shell hover:bg-ivory/90')}>
                {copy.gate.unlockCta}
              </button>
              <p className="mt-2 text-xs text-ivory/45">{s.comingSoonNote}</p>
            </div>
          }
        />
      </div>

      <div className="mt-14 max-w-md">
        <p className="text-[0.625rem] tracking-label text-ivory/40 uppercase">{s.futureLabel}</p>
        <div className="mt-3 divide-y divide-ivory/10">
          <ComingSoonRow label={s.team} />
          <ComingSoonRow label={s.manage} />
          <ComingSoonRow label={s.change} />
        </div>
      </div>
    </DestinationSurface>
  );
}
