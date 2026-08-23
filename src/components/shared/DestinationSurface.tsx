import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppShell } from '@/features/shell/AppShell';
import { APP_PAGE_MEASURE, APP_PAGE_WORKSPACE } from '@/features/shell/shellGeometry';

/**
 * Reusable premium destination surface. Owner P0 (2026-07-22): destinations render under the
 * ONE canonical AppShell (logo left, canonical hamburger right, the one right-side drawer with
 * the identical menu) — the legacy black TopNav/mega-menu shell is gone from every routed page.
 * Destination pages share the white editorial PINGÜINO language: strong headline,
 * generous whitespace and hairline structure. Existing ivory utilities are remapped
 * through the same light token scope used by Pro, so content and behavior stay intact.
 */
export function DestinationSurface({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  children?: ReactNode;
}) {
  return (
    <div className="pro-studio-radius-system theme-pro-light">
      <AppShell>
        <SurfaceToneContext.Provider value="paper">
          <div className="min-h-screen bg-paper text-ink">
            <div className={`${APP_PAGE_WORKSPACE} pt-12 pb-32 sm:pt-16`}>
              <div className={APP_PAGE_MEASURE}>
                {eyebrow ? <SectionLabel tone="ivory">{eyebrow}</SectionLabel> : null}
                <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[0.99] tracking-[-0.04em] text-balance text-ivory md:text-6xl">
                  {title}
                </h1>
                {blurb ? (
                  <p className="mt-5 max-w-xl text-lg leading-relaxed text-ivory/60">{blurb}</p>
                ) : null}
                {children ? <div className="mt-20">{children}</div> : null}
              </div>
            </div>
          </div>
        </SurfaceToneContext.Provider>
      </AppShell>
    </div>
  );
}

/** A titled section block — ivory section label + content, hairline-separated. */
export function DestinationSection({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('border-t border-ivory/10 pt-8', className)}>
      {label ? <SectionLabel tone="ivory">{label}</SectionLabel> : null}
      <div className={label ? 'mt-6' : undefined}>{children}</div>
    </section>
  );
}

/** Muted "Coming soon" row — a future feature listed but not yet active. */
export function ComingSoonRow({ label, description }: { label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <span className="text-sm text-ivory/70">{label}</span>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ivory/40">{description}</p>
        ) : null}
      </div>
      <span className="mt-0.5 shrink-0 rounded border border-ivory/15 px-2 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-ivory/45 uppercase">
        {copy.nav.comingSoon}
      </span>
    </div>
  );
}
