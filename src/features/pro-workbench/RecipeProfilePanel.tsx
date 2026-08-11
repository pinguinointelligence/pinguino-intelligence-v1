import { useEffect, useRef, useState } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import type { CorrectionResult, RecipeInput, RecipeResult } from '@/engine';
import { ContextualEducationView } from '@/features/education/ContextualEducationView';
import { useRecipeStore } from '@/stores/recipeStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { MonitorPanelContent } from './MonitorPanelContent';
import { ProductionCockpit } from '@/features/production-workspace/ProductionCockpit';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import {
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
} from '@/features/practical-recipe/practicalRecipe';
import { useRecipeProcessRuntime } from '@/features/education/useRecipeProcessRuntime';

export type ProContextTab = 'recipe' | 'monitor' | 'production';
export type CockpitTab = 'profile' | 'monitor' | 'production' | 'summary';

const TABS: readonly { id: CockpitTab; label: string }[] = [
  { id: 'profile', label: 'Profil receptury' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'production', label: 'Produkcja' },
  { id: 'summary', label: 'Podsumowanie' },
];

function ProfileContent({
  result,
  onOpenEducation,
}: {
  result: RecipeResult;
  onOpenEducation: () => void;
}) {
  return (
    <div className="p-3" data-testid="pro-context-recipe">
      <div
        className="grid min-w-0 items-start gap-3 xl:grid-cols-[1.08fr_0.92fr]"
        data-testid="profile-desktop-grid"
      >
        <ProfileDirectionAxes result={result} className="min-w-0" />
        <WorkbenchSettingsLine
          actualBatchG={result.total_batch_g}
          actualProteinPercent={result.percentages.protein_percent}
          className="min-w-0"
          compact
        />
      </div>
      <button
        type="button"
        onClick={onOpenEducation}
        className="pro-focus-ring mt-3 flex min-h-11 w-full items-center justify-between rounded-[16px] border border-white/20 bg-white/6 px-4 text-left text-xs font-semibold text-white/82 shadow-pro-e0"
        data-testid="profile-learning-entry"
      >
        <span>Dlaczego taki wynik i jak przygotować recepturę?</span>
        <span aria-hidden>›</span>
      </button>
    </div>
  );
}

function ProductionPanel({ production }: { production?: ProductionWorkspaceView }) {
  if (production) {
    return (
      <div data-testid="pro-context-production">
        <ProductionCockpit production={production} />
      </div>
    );
  }

  return (
    <div data-testid="pro-context-production">
      <div className="m-3 border border-status-error/30 bg-status-error/[0.035] p-3" role="alert">
        <h3 className="text-xs font-semibold text-status-error">
          Nie udało się uruchomić sesji produkcji
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          Wróć do Profilu receptury i otwórz Produkcję ponownie. Receptura nie została zmieniona.
        </p>
      </div>
    </div>
  );
}

const PROCESS_LABEL = {
  cold_process_ok: 'Proces na zimno potwierdzony',
  heat_required_for_function: 'Podgrzanie wymagane technologicznie',
  heat_required_for_safety: 'Podgrzanie wymagane dla bezpieczeństwa',
  heat_required_for_both: 'Podgrzanie wymagane technologicznie i dla bezpieczeństwa',
  unknown: 'Brak pełnych danych procesu',
} as const;

function SummaryPanel({ result, input }: { result: RecipeResult; input: RecipeInput }) {
  const version = useRecipeStore((state) => state.currentVersionNumber);
  const dirty = useRecipeStore((state) => state.dirty);
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const lastApplied = useConstraintStudioStore((state) => state.history.at(-1));
  const restoredAudit = useRecipeStore((state) => state.practicalRecipeAudit);
  const practical = practicalizeRecipeCandidate(input, constraints);
  const process = useRecipeProcessRuntime(input);
  const practicalCurrent =
    practical.ok &&
    ((lastApplied?.practicalization !== undefined &&
      JSON.stringify(lastApplied.after.input) === JSON.stringify(input)) ||
      practicalRecipeAuditMatchesInput(input, restoredAudit)) &&
    practical.audit.executableInput.items.every((item, index) =>
      Object.is(item.planned_grams, input.items[index]?.planned_grams),
    );
  const executableResult =
    practicalCurrent && practical.ok ? practical.audit.executableResult : result;
  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-white" data-testid="pro-context-summary">
      <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4 shadow-pro-e0">
        <p className="text-xs font-semibold text-[#d7b768]">Finalna bieżąca wersja</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Receptura wykonawcza</h3>
          <span className="text-xs text-white/55">
            {version ? `v${version}` : 'wersja robocza'} ·{' '}
            {dirty ? 'niezapisane zmiany' : 'zapisana'}
          </span>
        </div>
        {practicalCurrent && practical.ok ? (
          <div className="mt-4 divide-y divide-white/8" data-testid="summary-executable-recipe">
            {practical.audit.executableInput.items
              .filter((item) => item.planned_grams > 0)
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="min-w-0 truncate text-sm text-white/82">
                    {item.ingredient.name}
                  </span>
                  <strong className="font-mono text-sm tabular-nums text-white">
                    {item.planned_grams.toFixed(0)} g
                  </strong>
                </div>
              ))}
          </div>
        ) : (
          <div
            className="mt-4 rounded-[18px] border border-[#d7b768]/30 bg-[#d7b768]/8 p-3"
            data-testid="summary-practical-blocked"
          >
            <strong className="text-sm text-[#f0dca7]">
              Najpierw przygotuj recepturę wykonawczą w Preview
            </strong>
            <p className="mt-1 text-xs leading-relaxed text-white/62">
              Summary nie zaokrągla liczb tylko do wyświetlenia. Zastosuj zweryfikowany kandydat
              pełnogramowy, aby lista była fizycznie wykonalna.
            </p>
          </div>
        )}
      </section>
      <section className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="rounded-[20px] border border-white/9 bg-white/[0.035] p-4">
          <h3 className="text-sm font-semibold text-white">Kompozycja</h3>
          <dl className="mt-3 space-y-2 text-xs text-white/65">
            {[
              ['Woda', executableResult.percentages.water_percent],
              ['Ciała stałe', executableResult.percentages.solids_percent],
              ['Tłuszcz', executableResult.percentages.fat_percent],
              ['Białko', executableResult.percentages.protein_percent],
              ['Laktoza', executableResult.percentages.lactose_percent],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <dt>{label}</dt>
                <dd className="font-mono tabular-nums text-white">
                  {typeof value === 'number' ? `${value.toFixed(1)}%` : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-[20px] border border-white/9 bg-white/[0.035] p-4">
          <h3 className="text-sm font-semibold text-white">Proces i gotowość</h3>
          <dl className="mt-3 space-y-2 text-xs text-white/65">
            <div className="flex justify-between gap-3">
              <dt>Proces</dt>
              <dd className="text-right text-white">
                {process.loading ? 'Sprawdzam…' : PROCESS_LABEL[process.classification.status]}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Ilość netto</dt>
              <dd className="font-mono text-white">
                {executableResult.total_batch_g.toFixed(0)} g
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Etykieta</dt>
              <dd className="text-nonprod-soft">wymaga weryfikacji danych</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Eksport / druk</dt>
              <dd className="text-nonprod-soft">zablokowane do preflight</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="rounded-[22px] bg-[#f7f5f0] p-2 text-ink">
        <NutritionCostScorePanel result={executableResult} />
      </div>
      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Alergeny i deklaracja"
        compact
        tone="dark"
        details={{
          limitation: 'Brak pełnej, zweryfikowanej deklaracji wszystkich składników.',
          calculationImpact: 'Nie wpływa na obliczenia techniczne.',
          remaining: 'Uzupełnić dane i przejść Master Label preflight.',
        }}
      >
        <p className="text-xs text-white/72">
          Nie deklarujemy claimów ani gotowości druku bez danych źródłowych.
        </p>
      </ReadinessFrame>
    </div>
  );
}

export function RecipeProfilePanel({
  activeTab,
  onTabChange,
  result,
  servingTemperatureC,
  corrections,
  input,
  canonicalResult,
  canonicalInput,
  production,
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
  canonicalResult?: RecipeResult;
  canonicalInput?: RecipeInput;
  production?: ProductionWorkspaceView;
}) {
  const [educationOpen, setEducationOpen] = useState(false);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const machineId = useRecipeStore((state) => state.machineId);
  useEffect(() => {
    if (tabPanelRef.current) tabPanelRef.current.scrollTop = 0;
  }, [activeTab, educationOpen]);
  return (
    <div
      data-testid="pro-profile-panel"
      data-testid-shell="pro-intelligence-shell"
      className="min-h-full bg-[#17191d] text-ink lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-white/10 lg:shadow-pro-e2"
    >
      <div className="sticky top-0 z-30 bg-[#17191d]" data-testid="workbench-sticky-chrome">
        <WorkbenchIntelligenceHeader
          result={canonicalResult ?? result}
          input={canonicalInput ?? input}
          onOpenLearning={() => {
            onTabChange('profile');
            setEducationOpen(true);
          }}
        />
        <nav
          aria-label="Kokpit aktualnej receptury"
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? TABS.length - 1
                  : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) %
                    TABS.length;
            const next = TABS[nextIndex]!;
            setEducationOpen(false);
            onTabChange(next.id);
            const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
            tabs[nextIndex]?.focus();
          }}
          className="grid grid-cols-4 border-b border-white/10 bg-[#17191d]/95 px-2 pt-2 backdrop-blur"
          data-testid="pro-context-tabs"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`pro-context-${tab.id}-tab-control`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`pro-context-${tab.id}-tabpanel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              data-testid={`pro-context-${tab.id}-tab`}
              onClick={() => {
                setEducationOpen(false);
                onTabChange(tab.id);
              }}
              className={`pro-focus-ring min-h-11 min-w-0 rounded-t-[12px] border-b-2 px-1 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'border-[#d7b768] bg-white/10 text-white' : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        ref={tabPanelRef}
        id={`pro-context-${activeTab}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`pro-context-${activeTab}-tab-control`}
        tabIndex={0}
        className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {activeTab === 'profile' && educationOpen ? (
          <ContextualEducationView
            input={input}
            machineId={machineId}
            audience="pro"
            onBack={() => setEducationOpen(false)}
          />
        ) : null}
        {activeTab === 'profile' && !educationOpen ? (
          <ProfileContent result={result} onOpenEducation={() => setEducationOpen(true)} />
        ) : null}
        {activeTab === 'monitor' ? (
          <div className="pro-scroll-safe p-3 text-white" data-testid="pro-context-monitor">
            <MonitorPanelContent
              result={result}
              servingTemperatureC={servingTemperatureC}
              corrections={corrections}
              input={input}
              onOpenProfile={() => onTabChange('profile')}
            />
          </div>
        ) : null}
        {activeTab === 'production' ? <ProductionPanel production={production} /> : null}
        {activeTab === 'summary' ? <SummaryPanel result={result} input={input} /> : null}
      </div>
    </div>
  );
}
