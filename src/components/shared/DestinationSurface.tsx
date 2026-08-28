import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppShell } from '@/features/shell/AppShell';
import {
  APP_PAGE_BLOCK,
  APP_PAGE_MEASURE,
  APP_PAGE_WORKSPACE,
} from '@/features/shell/shellGeometry';
import { PAGE_HEADING_CONTENT_GAP, PageHeading } from '@/components/shared/PageHeading';
import { StatusChip } from '@/components/shared/StatusChip';

/**
 * Reusable premium destination surface. Destinations render under the ONE canonical
 * AppShell (canonical hamburger first, then the wordmark; the one LEFT-side drawer with
 * the identical menu) — the legacy black TopNav/mega-menu shell is gone from every routed page.
 *
 * Owner „global subpage style unification" (2026-08-24): a destination is a page of the
 * SAME instrument, so it now uses the shared workspace geometry and the shared
 * `PageHeading` rhythm instead of the editorial headline scale it used to own. Existing
 * ivory utilities are remapped through the same light token scope used by Pro, so content
 * and behavior stay intact.
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
            {/* The SAME heading rhythm and the SAME workspace geometry as the
                Pro workspace — a destination is a page of one instrument, not a
                marketing page that happens to sit behind a login. */}
            <div className={`${APP_PAGE_WORKSPACE} ${APP_PAGE_BLOCK}`}>
              <div className={APP_PAGE_MEASURE}>
                <PageHeading eyebrow={eyebrow} title={title} blurb={blurb} />
                {children ? <div className={PAGE_HEADING_CONTENT_GAP}>{children}</div> : null}
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
      <StatusChip status="locked" className="mt-0.5 shrink-0">
        {copy.nav.comingSoon}
      </StatusChip>
    </div>
  );
}
