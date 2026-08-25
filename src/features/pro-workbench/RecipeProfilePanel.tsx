import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { LabelWorkspace, type LabelWorkspaceView } from '@/features/master-label/LabelWorkspace';
import {
  calculateRecipe,
  type CorrectionResult,
  type NutritionPer100g,
  type RecipeInput,
  type RecipeCosts,
  type RecipeResult,
} from '@/engine';
import { ContextualEducationView } from '@/features/education/ContextualEducationView';
import { useRecipeStore } from '@/stores/recipeStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { MonitorPanelContent } from './MonitorPanelContent';
import { ProductionCockpit } from '@/features/production-workspace/ProductionCockpit';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import { WorkbenchModuleTabs, type WorkbenchModuleTab } from './WorkbenchModuleTabs';
import { LockedPIPreview } from '@/features/studio/locked/LockedPIPreview';
import {
  calculateFinalProduct,
  type ProductLabelNutritionPer100g,
} from '@/features/recipe-composition/finalProduct';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { applyEffectiveCustomerPricesToToppings } from '@/features/pro-core/effectiveRecipePricing';
import {
  buildRecipeBehaviorAuthority,
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

function NutritionCostProfileGrid({
  result,
  ready,
  nutritionOverride,
  costsOverride,
}: {
  result: RecipeResult;
  ready: boolean;
  nutritionOverride?: NutritionPer100g | ProductLabelNutritionPer100g | null;
  costsOverride?: RecipeCosts | null;
}) {
  const nutrition = ready
    ? nutritionOverride === undefined
      ? result.nutrition_per_100g
      : nutritionOverride
    : null;
  const costs = ready ? (costsOverride === undefined ? result.costs : costsOverride) : null;
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
          {/* AWAITING APPROVED DESIGN — "nutrition" is not covered by the
              approved reference sheet, so no icon is invented for it here. */}
          <span
            aria-hidden
            data-icon-status="awaiting-approved-design"
            className="text-xl text-[#18a83a]"
          >
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
          {/* AWAITING APPROVED DESIGN — "cost" is not covered by the approved
              reference sheet. */}
          <span
            aria-hidden
            data-icon-status="awaiting-approved-design"
            className="text-xl text-[#18a83a]"
          >
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
  const snapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const toppings = useRecipeStore((state) => state.toppings);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  // Recipe profile indicators describe the technical BASE. Post-production
  // toppings intentionally affect final-product Label facts, but they are not
  // ProductBehavior prerequisites for this base-only panel.
  const baseAuthority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, snapshots }),
    [input.items, snapshots],
  );
  const legacyInspection = recipeBehaviorLegacyInspection(baseAuthority, savedRecipeId);
  const factsReady = useMemo(
    () =>
      recipeBehaviorModuleGate(baseAuthority, 'NUTRITION').ready &&
      recipeBehaviorModuleGate(baseAuthority, 'COST').ready &&
      recipeBehaviorModuleGate(baseAuthority, 'MONITOR').ready,
    [baseAuthority],
  );
  const frozenNutritionResult = useMemo(
    () =>
      legacyInspection
        ? result
        : factsReady
          ? calculateRecipe(recipeInputFromFrozenBehavior(input, baseAuthority, 'nutrition'))
          : result,
    [baseAuthority, factsReady, input, legacyInspection, result],
  );
  const profileReadable =
    factsReady || legacyInspection || baseAuthority.requiredLineIds.length === 0;
  const finalAuthority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots }),
    [input.items, snapshots, toppings],
  );
  const finalSummaryReady = useMemo(
    () =>
      recipeBehaviorModuleGate(finalAuthority, 'SUMMARY').ready &&
      recipeBehaviorModuleGate(finalAuthority, 'NUTRITION').ready &&
      !recipeBehaviorLegacyInspection(finalAuthority, savedRecipeId),
    [finalAuthority, savedRecipeId],
  );
  const finalSummaryReadable =
    finalSummaryReady ||
    recipeBehaviorLegacyInspection(finalAuthority, savedRecipeId) ||
    finalAuthority.requiredLineIds.length === 0;
  const finalProduct = useMemo(() => {
    if (!finalSummaryReadable) return null;
    const finalInput = finalSummaryReady
      ? recipeInputFromFrozenBehavior(input, finalAuthority, 'nutrition')
      : input;
    const finalToppings = finalSummaryReady
      ? recipeToppingsFromFrozenBehavior(toppings, finalAuthority, 'nutrition')
      : toppings;
    return calculateFinalProduct(
      finalInput,
      applyEffectiveCustomerPricesToToppings(finalToppings, customerPrices),
      'planning',
    );
  }, [customerPrices, finalAuthority, finalSummaryReadable, finalSummaryReady, input, toppings]);
  return (
    <div className="w-full min-w-0 p-3" data-testid="pro-context-recipe">
      {legacyInspection ? (
        <WorkflowNotice
          className="mb-2"
          eyebrow="Historia receptury"
          title="Podgląd historyczny"
          description="Przed edycją, zapisem lub produkcją utwórz zweryfikowaną wersję."
          variant="neutral"
        />
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
        <WorkbenchSettingsLine actualBatchG={result.total_batch_g} className="min-w-0" compact />
        {recipeBar ? <div className="min-w-0">{recipeBar}</div> : null}
        <NutritionCostProfileGrid
          result={frozenNutritionResult}
          ready={finalSummaryReadable}
          nutritionOverride={finalProduct?.finalLabelNutritionPer100g}
          costsOverride={finalProduct?.finalCosts}
        />
      </div>
      <button
        type="button"
        onClick={onOpenEducation}
        className="pro-focus-ring mt-2.5 flex min-h-11 w-full items-center justify-between rounded-[16px] border border-ink/10 bg-white px-4 text-left text-xs font-semibold text-ink shadow-pro-e0"
        data-testid="profile-learning-entry"
      >
        <span>Wiedza o recepturze</span>
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
  onOpenLabel,
}: {
  production?: ProductionWorkspaceView;
  onOpenPreview: () => void;
  onRecalculate: () => void;
  onReturnToRecipe: () => void;
  onOpenLabel: () => void;
}) {
  if (production) {
    return (
      <div data-testid="pro-context-production">
        <ProductionCockpit
          production={production}
          onOpenPreview={onOpenPreview}
          onRecalculate={onRecalculate}
          onReturnToRecipe={onReturnToRecipe}
          onOpenLabel={onOpenLabel}
        />
      </div>
    );
  }

  return (
    <div data-testid="pro-context-production">
      <WorkflowNotice
        className="m-3"
        eyebrow="Produkcja"
        title="Nie udało się uruchomić sesji produkcji"
        description="Wróć do Profilu receptury i otwórz Produkcję ponownie. Receptura nie została zmieniona."
        variant="blocking"
        role="alert"
      />
    </div>
  );
}

function SummaryPanel({
  production,
  onOpenProduction,
  initialLabelView,
  labelViewRequestKey,
}: {
  production?: ProductionWorkspaceView;
  onOpenProduction: () => void;
  initialLabelView: LabelWorkspaceView;
  labelViewRequestKey?: string;
}) {
  const completed = production?.session?.completionSnapshot ?? null;
  if (completed) {
    return (
      <div className="pro-scroll-safe" data-testid="pro-context-summary">
        <LabelWorkspace
          key={labelViewRequestKey ?? initialLabelView}
          snapshot={completed}
          initialView={initialLabelView}
        />
      </div>
    );
  }

  return (
    <div className="pro-scroll-safe p-3" data-testid="pro-context-summary">
      <section
        className="rounded-[20px] border border-ink/10 bg-[#fffdf8] p-5 shadow-pro-e0"
        data-testid="label-workspace-empty"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9b7d37]">Etykieta</p>
        <h2 className="mt-2 text-lg font-semibold text-ink">Najpierw zakończ Produkcję</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
          Etykieta powstaje z faktycznie wykonanej partii. Po zakończeniu runu pojawią się tutaj
          składniki ACTUAL, wartości odżywcze, koszt, baza techniczna i automatyczny LOT.
        </p>
        <Button className="mt-4" onClick={onOpenProduction}>
          Otwórz Produkcję
        </Button>
      </section>
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
  initialLabelView = 'label',
  labelViewRequestKey,
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
  initialLabelView?: LabelWorkspaceView;
  labelViewRequestKey?: string;
}) {
  const [educationOpen, setEducationOpen] = useState(false);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const machineId = useRecipeStore((state) => state.machineId);
  const machineLabel = useRecipeStore((state) => state.machineLabel);
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
            machineLabel={machineLabel}
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
          <div className="pro-scroll-safe p-2 text-ink" data-testid="pro-context-monitor">
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
            onOpenLabel={() => onTabChange('summary')}
          />
        ) : null}
        {activeTab === 'summary' ? (
          <SummaryPanel
            production={production}
            onOpenProduction={() => onTabChange('production')}
            initialLabelView={initialLabelView}
            labelViewRequestKey={labelViewRequestKey}
          />
        ) : null}
      </div>
    </div>
  );
}
