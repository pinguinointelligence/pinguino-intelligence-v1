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

export function WorkbenchModuleTabs({
  activeTab,
  onTabChange,
  idPrefix,
  className = '',
}: {
  activeTab: WorkbenchModuleTab;
  onTabChange: (tab: WorkbenchModuleTab) => void;
  idPrefix: string;
  className?: string;
}) {
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
      className={`grid grid-cols-4 border-b border-ink/8 bg-white ${className}`}
      data-testid={`${idPrefix}-tabs`}
    >
      {WORKBENCH_MODULE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          id={`${idPrefix}-${tab.id}-tab-control`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`${idPrefix}-${tab.id}-tabpanel`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          data-testid={`${idPrefix}-${tab.id}-tab`}
          onClick={() => onTabChange(tab.id)}
          className={`pro-focus-ring min-h-12 min-w-0 border-b-2 px-2 py-2 text-[11px] font-semibold transition-colors ${activeTab === tab.id ? 'border-[#f58a07] bg-stone-50/70 text-ink' : 'border-transparent text-stone-600 hover:bg-stone-50 hover:text-ink'}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
