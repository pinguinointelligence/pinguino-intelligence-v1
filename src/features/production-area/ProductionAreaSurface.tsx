/**
 * The Produkcja area frame (package PRODUKCJA V3, Etap 1 §1.3).
 *
 * It wraps the existing `DestinationSurface` — ONE `AppShell`, the one global header, no nesting —
 * and adds only what makes four destinations one area: the title „Produkcja”, the section bar,
 * a place for the section's own heading and actions, and the one unsaved-changes question.
 *
 * The props mirror `DestinationSurface`, so a destination moves into the area by changing its
 * wrapper and naming its section. `title` / `blurb` / `actions` become the SECTION heading
 * under the bar; `eyebrow` and `contextLabel` are accepted and ignored (the area has one name).
 *
 * A Pro-only section (Etykiety) opened by a HOME or signed-out visitor shows where the tools
 * live instead of the tools — the section stays reachable from the bar for everyone.
 */
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { PageHeading } from '@/components/shared/PageHeading';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { productionAreaCopy } from '@/copy/productionArea';
import { cn } from '@/lib/cn';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useAuthStore } from '@/stores/authStore';
import { ProductionAreaNav } from './ProductionAreaNav';
import { rememberProductionAreaAddress } from './productionAreaMemory';
import { productionAreaSection, type ProductionAreaSectionId } from './productionAreaSections';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const c = productionAreaCopy();

export function ProductionAreaSurface({
  section,
  title,
  blurb,
  actions,
  headingClassName,
  children,
}: {
  section: ProductionAreaSectionId;
  /** The section's own heading, painted under the bar. */
  title?: string;
  blurb?: ReactNode;
  /** The section's actions (e.g. „Zapisz ustawienia”, „Skanuj produkt”). */
  actions?: ReactNode;
  /** Extra classes for the section heading row (e.g. hide it behind a phone detail view). */
  headingClassName?: string;
  /** Accepted for drop-in parity with `DestinationSurface`; the area has one name. */
  eyebrow?: string;
  contextLabel?: string;
  children?: ReactNode;
}) {
  const location = useLocation();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const gated = productionAreaSection(section).proOnly && !capabilities.canUseProductionMode;
  const address = `${location.pathname}${location.search}`;

  useEffect(() => {
    rememberProductionAreaAddress(ownerUserId, section, address);
  }, [address, ownerUserId, section]);

  return (
    <DestinationSurface title={c.title} contextLabel={c.title} bare>
      <div data-production-area={section}>
        <PageHeading title={c.title} />
        <ProductionAreaNav current={section} />
        <div className="mt-6" data-testid="production-area-section-body">
          {gated ? (
            <WorkflowNotice
              title={c.proGate.labelsTitle}
              description={c.proGate.labelsBody}
              variant="attention"
              emphasis="lead"
              stackAction
              action={
                <Link to="/subscription" className={buttonClasses('ghost', 'sm')}>
                  {c.proGate.action}
                </Link>
              }
              testId="production-area-pro-gate"
            />
          ) : (
            <>
              {title || blurb || actions ? (
                <div
                  className={cn(
                    'mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
                    headingClassName,
                  )}
                >
                  <div className="min-w-0">
                    {title ? (
                      <h2 className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] text-[var(--g-ink)]">
                        {title}
                      </h2>
                    ) : null}
                    {blurb ? (
                      <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
                        {blurb}
                      </p>
                    ) : null}
                  </div>
                  {actions ? (
                    <div
                      className="flex w-full min-w-0 items-center gap-2 max-sm:*:flex-1 sm:w-auto"
                      data-testid="production-area-section-actions"
                    >
                      {actions}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {children}
            </>
          )}
        </div>
      </div>
      <UnsavedChangesDialog />
    </DestinationSurface>
  );
}
