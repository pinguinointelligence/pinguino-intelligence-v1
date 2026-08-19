import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import {
  calculateRecipe,
  type CorrectionResult,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { ContextualEducationView } from '@/features/education/ContextualEducationView';
import { useRecipeStore } from '@/stores/recipeStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { MonitorPanelContent } from './MonitorPanelContent';
import { ProductionCockpit } from '@/features/production-workspace/ProductionCockpit';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import {
  WorkbenchModuleTabs,
  type WorkbenchModuleTab,
} from './WorkbenchModuleTabs';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
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
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { CatalogVerificationBadge } from '@/features/global-catalog/CatalogVerificationBadge';
import {
  buildRecipeBehaviorAuthority,
  frozenProcessEvidence,
  recipeInputFromFrozenBehavior,
  recipeBehaviorLegacyInspection,
  recipeBehaviorModuleGate,
  recipeToppingsFromFrozenBehavior,
} from '@/features/product-intelligence';

export type ProContextTab = 'recipe' | 'monitor' | 'production';
export type CockpitTab = WorkbenchModuleTab;

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

function NutritionCostProfileGrid({ result, ready }: { result: RecipeResult; ready: boolean }) {
  const nutrition = ready ? result.nutrition_per_100g : null;
  const costs = ready ? result.costs : null;
  const grams = (value: number | null | undefined, precision = 1) =>
    value === null || value === undefined ? '—' : `${value.toFixed(precision)} g`;
  const euro = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : `${value.toFixed(2)} €`;
  return (
    <details
      className="group min-w-0 overflow-hidden rounded-[16px] border border-ink/10 bg-white shadow-pro-e1"
      data-testid="profile-nutrition-cost-summary"
    >
      <summary className="pro-focus-ring flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden className="text-xl text-[#18a83a]">
            ♧
          </span>
          <span>
            <strong className="block font-mono text-sm tabular-nums text-ink">
              {nutrition ? `${nutrition.kcal.toFixed(0)} kcal / 100 g` : '— kcal / 100 g'}
            </strong>
            <span className="block text-[10px] text-stone-600">Wartości odżywcze</span>
          </span>
        </span>
        <span className="h-9 w-px bg-ink/8" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden className="text-xl text-[#18a83a]">
            ◎
          </span>
          <span>
            <strong className="block font-mono text-sm tabular-nums text-ink">
              {costs?.cost_per_kg == null ? '— / kg' : `${costs.cost_per_kg.toFixed(2)} € / kg`}
            </strong>
            <span className="block text-[10px] text-stone-600">Koszt receptury</span>
          </span>
        </span>
        <span className="text-lg text-ink transition-transform group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <div className="profile-nutrition-details grid gap-2 border-t border-ink/8 bg-stone-50/60 p-2 min-[520px]:grid-cols-2">
        <section
          className="min-w-0 rounded-[12px] border border-ink/8 bg-white px-2 py-1.5"
          data-testid="profile-nutrition-card"
        >
          <h3 className="mb-1 text-center text-xs font-semibold text-ink">Wartości odżywcze</h3>
          <dl>
            <CompactMetricRow
              label="Energia"
              value={nutrition ? `${nutrition.kcal.toFixed(0)} kcal` : '—'}
            />
            <CompactMetricRow label="Tłuszcz" value={grams(nutrition?.fat_g)} />
            <CompactMetricRow
              label="w tym kwasy nasycone"
              value={grams(nutrition?.saturated_fat_g)}
              muted
            />
            <CompactMetricRow label="Węglowodany" value={grams(nutrition?.carbohydrate_g)} />
            <CompactMetricRow label="w tym cukry" value={grams(nutrition?.sugars_g)} muted />
            <CompactMetricRow label="Białko" value={grams(nutrition?.protein_g)} />
            <CompactMetricRow label="Sól" value={grams(nutrition?.salt_g, 2)} />
            <CompactMetricRow label="Błonnik" value={grams(nutrition?.fiber_g)} />
          </dl>
        </section>
        <section
          className="min-w-0 rounded-[12px] border border-ink/8 bg-white px-2 py-1.5"
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
          <p className="mt-4 text-center text-[10px] text-stone-500">
            Aktualizuj ceny w produktach
          </p>
        </section>
      </div>
    </details>
  );
}

function ProfileContent({
  result,
  input,
  onOpenEducation,
  recipeBar,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenEducation: () => void;
  recipeBar?: ReactNode;
}) {
  const toppings = useRecipeStore((state) => state.toppings);
  const snapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const authority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots }),
    [input.items, snapshots, toppings],
  );
  const legacyInspection = recipeBehaviorLegacyInspection(authority, savedRecipeId);
  const factsReady = useMemo(
    () =>
      recipeBehaviorModuleGate(authority, 'NUTRITION').ready &&
      recipeBehaviorModuleGate(authority, 'COST').ready &&
      recipeBehaviorModuleGate(authority, 'MONITOR').ready,
    [authority],
  );
  const frozenNutritionResult = useMemo(
    () =>
      legacyInspection
        ? result
        : factsReady
          ? calculateRecipe(recipeInputFromFrozenBehavior(input, authority, 'nutrition'))
          : result,
    [authority, factsReady, input, legacyInspection, result],
  );
  const profileReadable = factsReady || legacyInspection || authority.requiredLineIds.length === 0;
  return (
    <div className="w-full min-w-0 p-3" data-testid="pro-context-recipe">
      {legacyInspection ? (
        <p
          role="status"
          className="mb-2 rounded-lg border border-ink/10 bg-stone-50 px-3 py-2 text-xs text-stone-700"
        >
          Podgląd historyczny. Przed edycją, zapisem lub produkcją utwórz zweryfikowaną wersję.
        </p>
      ) : null}
      <div
        className="grid min-w-0 items-start gap-3"
        data-testid="profile-desktop-grid"
        data-profile-layout="stacked"
      >
        {profileReadable ? (
          <ProfileDirectionAxes result={frozenNutritionResult} className="min-w-0" />
        ) : (
          <div className="min-w-0">
            <LockedPIPreview />
          </div>
        )}
        <WorkbenchSettingsLine
          actualBatchG={result.total_batch_g}
          actualProteinPercent={
            profileReadable ? frozenNutritionResult.percentages.protein_percent : null
          }
          className="min-w-0"
          compact
        />
        {recipeBar ? <div className="min-w-0">{recipeBar}</div> : null}
        <NutritionCostProfileGrid result={frozenNutritionResult} ready={profileReadable} />
      </div>
      <button
        type="button"
        onClick={onOpenEducation}
        className="pro-focus-ring mt-2.5 flex min-h-11 w-full items-center justify-between rounded-[16px] border border-ink/10 bg-white px-4 text-left text-xs font-semibold text-ink shadow-pro-e0"
        data-testid="profile-learning-entry"
      >
        <span>Dlaczego taki wynik i jak przygotować recepturę?</span>
        <span aria-hidden>›</span>
      </button>
    </div>
  );
}

function ProductionPanel({
  production,
  onOpenPreview,
  onRecalculate,
  onReturnToRecipe,
}: {
  production?: ProductionWorkspaceView;
  onOpenPreview: () => void;
  onRecalculate: () => void;
  onReturnToRecipe: () => void;
}) {
  if (production) {
    return (
      <div data-testid="pro-context-production">
        <ProductionCockpit
          production={production}
          onOpenPreview={onOpenPreview}
          onRecalculate={onRecalculate}
          onReturnToRecipe={onReturnToRecipe}
        />
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
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const dirty = useRecipeStore((state) => state.dirty);
  const constraints = useConstraintStudioStore((state) => state.constraints);
  const lastApplied = useConstraintStudioStore((state) => state.history.at(-1));
  const restoredAudit = useRecipeStore((state) => state.practicalRecipeAudit);
  const toppings = useRecipeStore((state) => state.toppings);
  const behaviorSnapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  const completed = production?.session?.completionSnapshot ?? null;
  const authorityItems = completed?.finalActualInput.items ?? input.items;
  const processInput = completed?.finalActualInput ?? input;
  const authorityToppings = completed?.productComposition.toppings ?? toppings;
  const authoritySnapshots = completed?.productComposition.behaviorSnapshots ?? behaviorSnapshots;
  const practical = practicalizeRecipeCandidate(input, constraints);
  const behaviorAuthority = useMemo(
    () =>
      buildRecipeBehaviorAuthority({
        items: authorityItems,
        toppings: authorityToppings,
        snapshots: authoritySnapshots,
      }),
    [authorityItems, authoritySnapshots, authorityToppings],
  );
  const summaryGate = useMemo(
    () => recipeBehaviorModuleGate(behaviorAuthority, 'SUMMARY'),
    [behaviorAuthority],
  );
  const nutritionGate = useMemo(
    () => recipeBehaviorModuleGate(behaviorAuthority, 'NUTRITION'),
    [behaviorAuthority],
  );
  const legacyInspection = recipeBehaviorLegacyInspection(behaviorAuthority, savedRecipeId);
  const processFacts = useMemo(() => frozenProcessEvidence(behaviorAuthority), [behaviorAuthority]);
  const process = useRecipeProcessRuntime(
    processInput,
    behaviorAuthority.requiredLineIds.length > 0
      ? legacyInspection
        ? []
        : processFacts.evidence
      : undefined,
  );
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
  const summaryReady = summaryGate.ready && nutritionGate.ready && !legacyInspection;
  const summaryReadable =
    summaryReady || legacyInspection || behaviorAuthority.requiredLineIds.length === 0;
  const summaryInput = completed?.finalActualInput ?? executableInput;
  const summaryToppings = completed?.productComposition.toppings ?? toppings;
  const frozenSummaryInput = summaryReady
    ? recipeInputFromFrozenBehavior(summaryInput, behaviorAuthority, 'nutrition')
    : summaryInput;
  const frozenSummaryToppings = summaryReady
    ? recipeToppingsFromFrozenBehavior(summaryToppings, behaviorAuthority, 'nutrition')
    : [];
  const plannedFinalProduct =
    summaryReadable && !completed
      ? calculateFinalProduct(
          summaryReady ? frozenSummaryInput : summaryInput,
          summaryReady
            ? applyEffectiveCustomerPricesToToppings(frozenSummaryToppings, customerPrices)
            : summaryToppings,
          'planning',
        )
      : null;
  const finalProduct =
    completed && summaryReadable
      ? {
          finalItems: completed.finalProduct.items,
          finalNutritionPer100g: completed.finalProduct.nutritionPer100g,
          finalLabelNutritionPer100g: completed.finalProduct.labelNutritionPer100g,
          finalCosts: completed.finalProduct.costs,
          baseMassG: completed.finalProduct.baseMassG,
          toppingMassG: completed.finalProduct.toppingMassG,
          finalMassG: completed.finalProduct.finalMassG,
          toppingCount: completed.productComposition.toppings.length,
        }
      : plannedFinalProduct;
  const summaryBaseResult =
    completed?.finalResult ??
    (summaryReady ? calculateRecipe(frozenSummaryInput) : executableResult);
  const finalDisplayResult: RecipeResult = {
    ...summaryBaseResult,
    // RecipeResult remains an Engine/Base result. Label-only POST_PROCESS_ADDON
    // rows are presented through the product-layer mass/nutrition projection.
    items: summaryBaseResult.items,
    total_batch_g: finalProduct?.finalMassG ?? 0,
    nutrition_per_100g: finalProduct?.finalNutritionPer100g ?? null,
    costs: finalProduct?.finalCosts ?? null,
  };
  return (
    <div className="pro-scroll-safe space-y-3 p-3 text-ink" data-testid="pro-context-summary">
      {legacyInspection ? (
        <p
          role="status"
          data-testid="summary-legacy-inspection"
          className="rounded-lg border border-ink/10 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700"
        >
          Podgląd historyczny korzysta z zapisanych danych receptury. Przed edycją, przeliczeniem,
          zapisem lub produkcją utwórz nową wersję z aktualną walidacją produktów.
        </p>
      ) : null}
      <section className="rounded-[18px] border border-ink/10 bg-white p-4 shadow-pro-e0">
        <p className="text-xs font-semibold text-[#d7b768]">
          {completed ? 'Faktyczna zakończona partia' : 'Finalna bieżąca wersja'}
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Receptura wykonawcza</h3>
          <span className="text-xs text-stone-600">
            {version ? `v${version}` : 'wersja robocza'} ·{' '}
            {dirty ? 'niezapisane zmiany' : 'zapisana'}
          </span>
        </div>
        {summaryReadable &&
        (completed || legacyInspection || (practicalCurrent && practical.ok)) ? (
          <SummaryBaseRecipeList items={summaryInput.items} completed={completed !== null} />
        ) : (
          <div
            className="mt-4 rounded-[18px] border border-[#d7b768]/30 bg-[#d7b768]/8 p-3"
            data-testid="summary-practical-blocked"
          >
            <strong className="text-sm text-[#f0dca7]">
              Najpierw przygotuj recepturę wykonawczą w Preview
            </strong>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Summary nie zaokrągla liczb tylko do wyświetlenia. Zastosuj zweryfikowany kandydat
              pełnogramowy, aby lista była fizycznie wykonalna.
            </p>
          </div>
        )}
      </section>
      <section
        className="rounded-[18px] border border-ink/10 bg-white p-4 shadow-pro-e0"
        data-testid="summary-base-final-mass"
      >
        <h3 className="text-sm font-semibold text-ink">Baza i produkt finalny</h3>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-stone-600">
            <dt>Baza lodowa</dt>
            <dd className="font-mono tabular-nums text-ink">
              {finalProduct ? `${finalProduct.baseMassG.toFixed(0)} g` : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-stone-600">
            <dt>Toppingi · {finalProduct?.toppingCount ?? '—'}</dt>
            <dd className="font-mono tabular-nums text-ink">
              {finalProduct ? `+${finalProduct.toppingMassG.toFixed(0)} g` : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-2 text-ink">
            <dt className="font-semibold">Produkt finalny</dt>
            <dd className="font-mono text-base font-semibold tabular-nums">
              {finalProduct ? `${finalProduct.finalMassG.toFixed(0)} g` : '—'}
            </dd>
          </div>
        </dl>
        {summaryReadable && summaryToppings.length > 0 ? (
          <div className="mt-3 divide-y divide-ink/8 border-t border-ink/8">
            {summaryToppings.map((item) => (
              <div key={item.id} className="flex justify-between gap-3 py-2 text-xs text-stone-600">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">Topping · {item.ingredient.name}</span>
                  {isCatalogLabelToppingIngredient(item.ingredient) ? (
                    <CatalogVerificationBadge
                      status={item.ingredient.verification_status}
                      tone="dark"
                    />
                  ) : null}
                </span>
                <span className="font-mono tabular-nums text-ink">
                  {(completed
                    ? (item.actual_grams ?? item.planned_grams)
                    : item.planned_grams
                  ).toFixed(0)}{' '}
                  g
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {summaryReadable ? (
        <section className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <div className="rounded-[18px] border border-ink/9 bg-stone-50 p-4">
            <h3 className="text-sm font-semibold text-ink">Baza · analiza techniczna</h3>
            <dl className="mt-3 space-y-2 text-xs text-stone-600">
              {[
                ['Woda', summaryBaseResult.percentages.water_percent],
                ['Ciała stałe', summaryBaseResult.percentages.solids_percent],
                ['Tłuszcz', summaryBaseResult.percentages.fat_percent],
                ['Białko', summaryBaseResult.percentages.protein_percent],
                ['Laktoza', summaryBaseResult.percentages.lactose_percent],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-3">
                  <dt>{label}</dt>
                  <dd className="font-mono tabular-nums text-ink">
                    {typeof value === 'number' ? `${value.toFixed(1)}%` : '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-[18px] border border-ink/9 bg-stone-50 p-4">
            <h3 className="text-sm font-semibold text-ink">Proces i gotowość</h3>
            <dl className="mt-3 space-y-2 text-xs text-stone-600">
              <div className="flex justify-between gap-3">
                <dt>Proces</dt>
                <dd className="text-right text-ink">
                  {process.loading ? 'Sprawdzam…' : PROCESS_LABEL[process.classification.status]}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Masa całej partii produktu finalnego</dt>
                <dd className="font-mono text-ink">{finalProduct?.finalMassG.toFixed(0)} g</dd>
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
      ) : null}
      <div
        className="rounded-[22px] bg-[#f7f5f0] p-2 text-ink"
        data-testid="summary-final-nutrition-cost"
      >
        <NutritionCostScorePanel
          result={finalDisplayResult}
          nutritionOverride={finalProduct?.finalLabelNutritionPer100g ?? null}
        />
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
        <p className="text-xs text-stone-600">
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
  production,
  recipeBar,
  idPrefix,
  showTabs,
  onOpenPreview,
  onRecalculate,
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
  production?: ProductionWorkspaceView;
  recipeBar?: ReactNode;
  idPrefix: string;
  showTabs: boolean;
  onOpenPreview: () => void;
  onRecalculate: () => void;
}) {
  const [educationOpen, setEducationOpen] = useState(false);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const machineId = useRecipeStore((state) => state.machineId);
  useEffect(() => {
    if (tabPanelRef.current) tabPanelRef.current.scrollTop = 0;
  }, [activeTab, educationOpen]);
  useEffect(() => {
    const openLearning = () => {
      onTabChange('profile');
      setEducationOpen(true);
    };
    window.addEventListener('pinguino:open-learning', openLearning);
    return () => window.removeEventListener('pinguino:open-learning', openLearning);
  }, [onTabChange]);
  return (
    <div
      data-testid="pro-profile-panel"
      data-testid-shell="pro-intelligence-shell"
      className="right-pane min-h-full bg-white text-ink lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-ink/10 lg:shadow-pro-e1"
    >
      {showTabs ? (
        <div className="sticky top-0 z-30 bg-white" data-testid="workbench-sticky-chrome">
          <WorkbenchModuleTabs
            activeTab={activeTab}
            onTabChange={(tab) => {
              setEducationOpen(false);
              onTabChange(tab);
            }}
            idPrefix={idPrefix}
            className="px-2"
          />
        </div>
      ) : null}

      <div
        ref={tabPanelRef}
        id={`${idPrefix}-${activeTab}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-${activeTab}-tab-control`}
        tabIndex={0}
        className="intelligence-tabpanel-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-hidden lg:[scrollbar-gutter:stable] 2xl:[scrollbar-gutter:auto]"
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
          <ProfileContent
            result={result}
            input={input}
            onOpenEducation={() => setEducationOpen(true)}
            recipeBar={recipeBar}
          />
        ) : null}
        {activeTab === 'monitor' ? (
          <div className="pro-scroll-safe p-3 text-ink" data-testid="pro-context-monitor">
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
        {activeTab === 'production' ? (
          <ProductionPanel
            production={production}
            onOpenPreview={onOpenPreview}
            onRecalculate={onRecalculate}
            onReturnToRecipe={() => onTabChange('profile')}
          />
        ) : null}
        {activeTab === 'summary' ? (
          <SummaryPanel result={result} input={input} production={production} />
        ) : null}
      </div>
    </div>
  );
}
