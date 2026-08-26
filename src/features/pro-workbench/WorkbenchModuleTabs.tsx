import type { RefObject } from 'react';
import { cn } from '@/lib/cn';

export type WorkbenchModuleTab = 'profile' | 'monitor' | 'production' | 'summary';

const WORKBENCH_MODULE_TABS: readonly {
  id: WorkbenchModuleTab;
  label: string;
}[] = [
  { id: 'profile', label: 'Receptura' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'production', label: 'Produkcja' },
  { id: 'summary', label: 'Etykieta' },
];

/**
 * The four workspace modules — Receptura | Monitor | Produkcja | Etykieta.
 *
 * ONE component, two placements. `variant="header"` is the accepted desktop
 * header row (unchanged). `variant="bottom"` is the mobile preview bar (owner
 * mobile UX §11/§12): the same labels, typography, active state and hairlines,
 * pinned above the home indicator, where tapping the ALREADY-OPEN module
 * collapses it again instead of hunting for a close icon.
 */
export function WorkbenchModuleTabs({
  activeTab,
  onTabChange,
  idPrefix,
  className = '',
  variant = 'header',
  expanded = false,
  onCollapse,
  triggerRef,
  attentionTab = null,
}: {
  activeTab: WorkbenchModuleTab;
  onTabChange: (tab: WorkbenchModuleTab) => void;
  idPrefix: string;
  className?: string;
  variant?: 'header' | 'bottom';
  /** Bottom variant only: is a preview panel currently open? */
  expanded?: boolean;
  /** Bottom variant only: tapping the open module again collapses it. */
  onCollapse?: () => void;
  /** Bottom variant only: focus returns here when the panel closes. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Bottom variant only: the single unresolved next action, if any. */
  attentionTab?: WorkbenchModuleTab | null;
}) {
  const bottom = variant === 'bottom';
  const select = (tab: WorkbenchModuleTab) => {
    if (bottom && expanded && tab === activeTab) {
      onCollapse?.();
      return;
    }
    onTabChange(tab);
  };

  return (
    <nav
      aria-label="Kokpit aktualnej receptury"
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = WORKBENCH_MODULE_TABS.findIndex((tab) => tab.id === activeTab);
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? WORKBENCH_MODULE_TABS.length - 1
              : (currentIndex +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  WORKBENCH_MODULE_TABS.length) %
                WORKBENCH_MODULE_TABS.length;
        const next = WORKBENCH_MODULE_TABS[nextIndex]!;
        onTabChange(next.id);
        const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs[nextIndex]?.focus();
      }}
      className={cn(
        'grid grid-cols-4 bg-white',
        bottom
          ? 'border-t border-ink/10 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_0_rgb(16_17_19_/_0.04)]'
          : 'border-b border-ink/8',
        className,
      )}
      data-testid={`${idPrefix}-tabs`}
      data-variant={variant}
    >
      {WORKBENCH_MODULE_TABS.map((tab) => {
        const active = activeTab === tab.id;
        const open = bottom && expanded && active;
        const attention = bottom && attentionTab === tab.id && !open;
        return (
          <button
            key={tab.id}
            ref={bottom && active ? triggerRef : undefined}
            type="button"
            id={`${idPrefix}-${tab.id}-tab-control`}
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-${tab.id}-tabpanel`}
            aria-haspopup={bottom && tab.id !== 'profile' ? 'dialog' : undefined}
            aria-expanded={bottom && tab.id !== 'profile' ? open : undefined}
            aria-label={attention ? `${tab.label} — wymaga działania` : undefined}
            tabIndex={active ? 0 : -1}
            data-testid={`${idPrefix}-${tab.id}-tab`}
            data-open={open ? 'true' : undefined}
            data-attention={attention ? 'required' : undefined}
            onClick={() => select(tab.id)}
            className={cn(
              'pro-focus-ring min-w-0 px-2 text-[11px] font-semibold transition-colors',
              bottom
                ? 'flex min-h-[var(--pro-bottom-nav-height)] flex-col items-center justify-center gap-1 border-t-2 py-1'
                : 'min-h-12 border-b-2 py-2',
              active
                ? 'border-[#f58a07] bg-stone-50/70 text-ink'
                : 'border-transparent text-stone-600 hover:bg-stone-50 hover:text-ink',
              attention && 'gellatti-next-action-attention text-attention',
            )}
          >
            <span className="truncate">{tab.label}</span>
            {bottom ? (
              <span
                aria-hidden
                className={cn(
                  'block h-px w-4 transition-opacity',
                  open ? 'bg-ink opacity-100' : 'opacity-0',
                )}
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
