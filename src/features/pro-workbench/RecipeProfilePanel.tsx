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
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { applyEffectiveCustomerPricesToToppings } from '@/features/pro-core/effectiveRecipePricing';
import { SummaryBaseRecipeList } from './SummaryBaseRecipeList';

export type ProContextTab = 'recipe' | 'monitor' | 'production';
export type CockpitTab = 'profile' | 'monitor' | 'production' | 'summary';

const TABS: readonly { id: CockpitTab; label: string }[] = [
  { id: 'profile', label: 'Profil receptury' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'production', label: 'Produkcja' },
  { id: 'summary', label: 'Etykieta' },
];

function CompactMetricRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-h-5 items-center justify-between gap-3 border-b border-ink/7 py-0.5 last:border-0">
      <dt className={muted ? 'pl-2 text-[10px] text-stone-500' : 'text-[11px] text-stone-600'}>
        {label}
      </dt>
      <dd className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

function NutritionCostProfileGrid({ result }: { result: RecipeResult }) {
  const nutrition = result.nutrition_per_100g;
  const costs = result.costs;
  const grams = (value: number | null | undefined, precision = 1) =>
    value === null || value === undefined ? '—' : `${value.toFixed(precision)} g`;
  const euro = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : `${value.toFixed(2)} €`;
  return (
    <>
      <section
        className="min-w-0 rounded-[22px] border border-white/55 bg-[#f7f5f0] px-2 py-1.5 shadow-pro-e1"
        data-testid="profile-nutrition-card"
      >
        <h3 className="mb-1 text-center text-xs font-semibold text-ink">Wartości odżywcze</h3>
        <dl>
          <CompactMetricRow label="Energia" value={nutrition ? `${nutrition.kcal.toFixed(0)} kcal` : '—'} />
          <CompactMetricRow label="Tłuszcz" value={grams(nutrition?.fat_g)} />
          <CompactMetricRow label="w tym kwasy nasycone" value={grams(nutrition?.saturated_fat_g)} muted />
          <CompactMetricRow label="Węglowodany" value={grams(nutrition?.carbohydrate_g)} />
          <CompactMetricRow label="w tym cukry" value={grams(nutrition?.sugars_g)} muted />
          <CompactMetricRow label="Białko" value={grams(nutrition?.protein_g)} />
          <CompactMetricRow label="Sól" value={grams(nutrition?.salt_g, 2)} />
          <CompactMetricRow label="Błonnik" value={grams(nutrition?.fiber_g)} />
        </dl>
      </section>
      <section
        className="min-w-0 rounded-[22px] border border-white/55 bg-[#f7f5f0] px-2 py-1.5 shadow-pro-e1"
        data-testid="profile-cost-card"
      >
        <h3 className="mb-1 text-center text-xs font-semibold text-ink">Koszt</h3>
        <dl>
          <CompactMetricRow label="Na 1 kg" value={euro(costs?.cost_per_kg)} />
          <CompactMetricRow label="Cała partia" value={euro(costs?.total_cost)} />
          <CompactMetricRow label="Porcja 60 g" value={euro(costs?.cost_per_serving_60g)} />
          <CompactMetricRow label="Porcja 70 g" value={euro(costs?.cost_per_serving_70g)} />
          <CompactMetricRow label="Porcja 80 g" value={euro(costs?.cost_per_serving_80g)} />
        </dl>
        <p className="mt-4 text-center text-[10px] text-stone-500">Aktualizuj ceny w produktach</p>
      </section>
    </>
  );
}

function ProfileContent({
  result,
  onOpenEducation,
}: {
  result: RecipeResult;
  onOpenEducation: () => void;
}) {
  return (
    <div className="p-2.5" data-testid="pro-context-recipe">
      <div
        className="grid min-w-0 items-stretch gap-2.5 xl:grid-cols-[1.08fr_0.92fr]"
        data-testid="profile-desktop-grid"
        data-profile-layout="2x2"
      >
        <ProfileDirectionAxes result={result} className="min-w-0" />
        <WorkbenchSettingsLine
          actualBatchG={result.total_batch_g}
          actualProteinPercent={result.percentages.protein_percent}
          className="min-w-0"
          compact
        />
        <NutritionCostProfileGrid result={result} />
      </div>
      <button
        type="button"
        onClick={onOpenEducation}
        className="pro-focus-ring mt-2.5 flex min-h-11 w-full items-center justify-between rounded-[16px] border border-white/20 bg-white/6 px-4 text-left text-xs font-semibold text-white/82 shadow-pro-e0"
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

function SummaryPanel({
  result,
  input,
  production,
}: {
  result: RecipeResult;
  input: RecipeInput;
  production?: ProductionWorkspaceView;
}) {
  const version = useRecipeStore((state) => state.currentVersionNumber);
  const dirty = useRecipeStore((state) => state.dirty);
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const lastApplied = useConstraintStudioStore((state) => state.history.at(-1));
  const restoredAudit = useRecipeStore((state) => state.practicalRecipeAudit);
  const toppings = useRecipeStore((state) => state.toppings);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
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
  const executableInput =
    practicalCurrent && practical.ok ? practical.audit.executableInput : input;
  const plannedFinalProduct = calculateFinalProduct(
    executableInput,
    applyEffectiveCustomerPricesToToppings(toppings, customerPrices),
    'planning',
  );
  const completed = production?.session?.completionSnapshot ?? null;
  const summaryInput = completed?.finalActualInput ?? executableInput;
  const summaryToppings = completed?.productComposition.toppings ?? toppings;
  const finalProduct = completed
    ? {
        finalItems: completed.finalProduct.items,
        finalNutritionPer100g: completed.finalProduct.nutritionPer100g,
        finalCosts: completed.finalProduct.costs,
        baseMassG: completed.finalProduct.baseMassG,
        toppingMassG: completed.finalProduct.toppingMassG,
        finalMassG: completed.finalProduct.finalMassG,
        toppingCount: completed.productComposition.toppings.length,
      }
    : plannedFinalProduct;
  const summaryBaseResult = completed?.finalResult ?? executableResult;
  const finalDisplayResult: RecipeResult = {
    ...summaryBaseResult,
    items: finalProduct.finalItems,
    total_batch_g: finalProduct.finalMassG,
    nutrition_per_100g: finalProduct.finalNutritionPer100g,
    costs: finalProduct.finalCosts,
  };
  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-white" data-testid="pro-context-summary">
      <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4 shadow-pro-e0">
        <p className="text-xs font-semibold text-[#d7b768]">
          {completed ? 'Faktyczna zakończona partia' : 'Finalna bieżąca wersja'}
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Receptura wykonawcza</h3>
          <span className="text-xs text-white/55">
            {version ? `v${version}` : 'wersja robocza'} ·{' '}
            {dirty ? 'niezapisane zmiany' : 'zapisana'}
          </span>
        </div>
        {completed || (practicalCurrent && practical.ok) ? (
          <SummaryBaseRecipeList items={summaryInput.items} completed={completed !== null} />
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
      <section
        className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4 shadow-pro-e0"
        data-testid="summary-base-final-mass"
      >
        <h3 className="text-sm font-semibold text-white">Baza i produkt finalny</h3>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-white/65">
            <dt>Baza lodowa</dt>
            <dd className="font-mono tabular-nums text-white">{finalProduct.baseMassG.toFixed(0)} g</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-white/65">
            <dt>Toppingi · {finalProduct.toppingCount}</dt>
            <dd className="font-mono tabular-nums text-white">+{finalProduct.toppingMassG.toFixed(0)} g</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-white">
            <dt className="font-semibold">Produkt finalny</dt>
            <dd className="font-mono text-base font-semibold tabular-nums">{finalProduct.finalMassG.toFixed(0)} g</dd>
          </div>
        </dl>
        {summaryToppings.length > 0 ? (
          <div className="mt-3 divide-y divide-white/8 border-t border-white/8">
            {summaryToppings.map((item) => (
              <div key={item.id} className="flex justify-between gap-3 py-2 text-xs text-white/72">
                <span className="truncate">Topping · {item.ingredient.name}</span>
                <span className="font-mono tabular-nums text-white">
                  {(completed ? (item.actual_grams ?? item.planned_grams) : item.planned_grams).toFixed(0)} g
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="rounded-[20px] border border-white/9 bg-white/[0.035] p-4">
          <h3 className="text-sm font-semibold text-white">Baza · analiza techniczna</h3>
          <dl className="mt-3 space-y-2 text-xs text-white/65">
            {[
              ['Woda', summaryBaseResult.percentages.water_percent],
              ['Ciała stałe', summaryBaseResult.percentages.solids_percent],
              ['Tłuszcz', summaryBaseResult.percentages.fat_percent],
              ['Białko', summaryBaseResult.percentages.protein_percent],
              ['Laktoza', summaryBaseResult.percentages.lactose_percent],
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
              <dt>Masa całej partii produktu finalnego</dt>
              <dd className="font-mono text-white">
                {finalProduct.finalMassG.toFixed(0)} g
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
      <div className="rounded-[22px] bg-[#f7f5f0] p-2 text-ink" data-testid="summary-final-nutrition-cost">
        <NutritionCostScorePanel result={finalDisplayResult} />
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
        className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[scrollbar-gutter:stable]"
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
              production={production}
            />
          </div>
        ) : null}
        {activeTab === 'production' ? <ProductionPanel production={production} /> : null}
        {activeTab === 'summary' ? (
          <SummaryPanel result={result} input={input} production={production} />
        ) : null}
      </div>
    </div>
  );
}
