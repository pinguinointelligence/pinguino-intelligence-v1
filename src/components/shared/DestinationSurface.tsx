import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { AppShell } from '@/features/shell/AppShell';
import { DestinationHomeProSwitch } from './DestinationHomeProSwitch';
import {
  APP_PAGE_BLOCK,
  APP_PAGE_CANVAS,
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
  actions,
  headerActions = <DestinationHomeProSwitch />,
  bare = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  actions?: ReactNode;
  /**
   * Retained so no destination page has to change, but it NO LONGER REACHES THE
   * GLOBAL HEADER: since the parity forward fix the header carries the
   * hamburger, the official wordmark and HOME | PRO and nothing else. Page
   * identity lives below the header. Retiring the prop across every caller is a
   * separate cleanup, not a header change.
   */
  contextLabel?: string;
  /**
   * Controls for the GLOBAL header row — in practice the HOME | PRO switch.
   *
   * They are handed straight to `AppShell`, which since the global header
   * parity change (#76) places non-workbench actions at the trailing edge of
   * the left work column. This is consumption of that slot, not a second
   * header implementation: no geometry is declared here.
   *
   * `actions` (unprefixed) still belongs to the PAGE heading.
   */
  headerActions?: ReactNode;
  /**
   * GELLATTI V2.1 §5 — the commercial destinations (Sklep, Franchise,
   * Współpraca) open on a HERO that carries the page title itself, so the
   * shared `PageHeading` would render the same title twice, 40 px above the
   * approved canvas start. `bare` hands the top of the canvas to `children`;
   * `title` is still required and still names the page for the lockup and the
   * document, it simply is not painted a second time.
   */
  bare?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="pro-studio-radius-system theme-pro-light">
      <AppShell
        /* The canonical global header (#76) carries hamburger, logo and HOME | PRO
           at one x on every route. A destination CONSUMES that slot (#77) and
           declares no geometry of its own. The default lives on the prop, so this
           stays a single unconditional hand-off. */
        globalSwitch={headerActions}
        navigationPosition="trailing"
        /* GLOBAL HEADER PARITY, FORWARD FIX (owner, 2026-09-01): the global row
           carries the hamburger, the official wordmark and HOME | PRO — nothing
           else. The destination lockup that used to sit beside the logo
           („Sklep · Gellatti Workspace", „Współpraca · Gellatti Workspace") is
           gone, so no route can grow its own header identity. Page identity
           belongs BELOW the header, where `PageHeading` and each page's own
           eyebrow already carry it. No `brand` override: `AppShell` renders the
           canonical `OfficialProLogo`, exactly as HOME and PRO do. */
      >
        <SurfaceToneContext.Provider value="paper">
          <div className="gellatti-destination min-h-screen bg-paper text-ink">
            {/* The SAME heading rhythm and the SAME workspace geometry as the
                Pro workspace — a destination is a page of one instrument, not a
                marketing page that happens to sit behind a login. */}
            <div className={`${APP_PAGE_WORKSPACE} ${APP_PAGE_BLOCK}`}>
              <div className={APP_PAGE_CANVAS}>
                {bare ? null : (
                  <PageHeading eyebrow={eyebrow} title={title} blurb={blurb} actions={actions} />
                )}
                {children ? (
                  <div className={bare ? undefined : PAGE_HEADING_CONTENT_GAP}>{children}</div>
                ) : null}
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
