import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { announceFriendlyLabMoment } from '@/components/shared/friendlyLabMoment';
import { LabelWorkspace, type LabelWorkspaceView } from '@/features/master-label/LabelWorkspace';
import { DraftLabelPanel } from '@/features/master-label/DraftLabelPanel';
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
  recipeToppingsFromFrozenBehavior,
} from '@/features/product-intelligence';
import { useRecipeProfileStore } from './recipeProfileStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildCurrentRecipeResultAuthority } from './currentRecipeResultAuthority';
import { friendlyLabRecipeJourneyState } from './friendlyLabRecipeJourney';
import { CostSummaryIcon, NutritionSummaryIcon } from '@/components/icons/PinguinoIcons';

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
    <div className="flex min-h-[26px] items-baseline justify-between gap-3 border-b border-[var(--g-line)] py-1 last:border-0">
      <dt
        className={
          muted
            ? 'pl-3 text-[10px] leading-[16px] text-[var(--g-text-muted)]'
            : 'text-[11px] leading-[16px] text-[var(--g-text-secondary)]'
        }
      >
        {label}
      </dt>
      <dd className="shrink-0 text-[11px] leading-[16px] font-semibold tabular-nums text-[var(--g-ink)]">
        {value}
      </dd>
    </div>
  );
}

function NutritionCostProfileGrid({
  result,
  nutritionReady,
  costReady,
  nutritionOverride,
  costsOverride,
}: {
  result: RecipeResult;
  nutritionReady: boolean;
  costReady: boolean;
  nutritionOverride?: NutritionPer100g | ProductLabelNutritionPer100g | null;
  costsOverride?: RecipeCosts | null;
}) {
  const nutrition = nutritionReady
    ? nutritionOverride === undefined
      ? result.nutrition_per_100g
      : nutritionOverride
    : null;
  const costs = costReady ? (costsOverride === undefined ? result.costs : costsOverride) : null;
  const grams = (value: number | null | undefined, precision = 1) =>
    value === null || value === undefined ? '—' : `${value.toFixed(precision)} g`;
  const euro = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : `${value.toFixed(2)} €`;
  return (
    /* OWNER FROZEN PRO VISUAL: the result opens the display column as an
       EDITORIAL READOUT — two labelled values on the page ground, not a
       shadowed 16 px card. The breakdown stays exactly as expandable as it
       was; it just stopped being a box inside a box. */
    <details className="group min-w-0" data-testid="profile-nutrition-cost-summary">
      <summary className="pro-focus-ring grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-[var(--g-line)] pb-3">
        <span className="grid min-w-0 gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-[9px] leading-[14px] font-semibold tracking-[0.08em] text-[var(--g-text-muted)] uppercase">
              <NutritionSummaryIcon
                tone="current"
                className="size-3.5 shrink-0 self-center text-[var(--g-text-muted)]"
              />
              <span className="truncate">Wartości odżywcze</span>
            </span>
            <strong className="shrink-0 text-[15px] leading-[20px] font-bold tabular-nums text-[var(--g-ink)]">
              {nutrition ? `${nutrition.kcal.toFixed(0)} kcal / 100 g` : '— kcal / 100 g'}
            </strong>
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-[9px] leading-[14px] font-semibold tracking-[0.08em] text-[var(--g-text-muted)] uppercase">
              <CostSummaryIcon
                tone="current"
                className="size-3.5 shrink-0 self-center text-[var(--g-text-muted)]"
              />
              <span className="truncate">Koszt receptury</span>
            </span>
            <strong className="shrink-0 text-[15px] leading-[20px] font-bold tabular-nums text-[var(--g-ink)]">
              {costs?.cost_per_kg == null ? '— / kg' : `${costs.cost_per_kg.toFixed(2)} € / kg`}
            </strong>
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 text-[var(--g-text-muted)] transition-transform group-open:rotate-180"
        >
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path
              d="M1 1.5 6 6.5 11 1.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      <div className="profile-nutrition-details grid gap-x-8 gap-y-5 pt-4 min-[520px]:grid-cols-2">
        <section className="min-w-0" data-testid="profile-nutrition-card">
          <h3 className="mb-1.5 text-[9px] leading-[14px] font-semibold tracking-[0.08em] text-[var(--g-text-muted)] uppercase">
            Wartości odżywcze
          </h3>
          <dl>
            <CompactMetricRow
              label="Energia"
              value={nutrition ? `${nutrition.kcal.toFixed(0)} kcal` : '—'}
            />
            <CompactMetricRow label="Tłuszcz" value={grams(nutrition?.fat_g)} />
            <CompactMetricRow
              label="W tym kwasy nasycone"
              value={grams(nutrition?.saturated_fat_g)}
              muted
            />
            <CompactMetricRow label="Węglowodany" value={grams(nutrition?.carbohydrate_g)} />
            <CompactMetricRow label="W tym cukry" value={grams(nutrition?.sugars_g)} muted />
            <CompactMetricRow label="Białko" value={grams(nutrition?.protein_g)} />
            <CompactMetricRow label="Sól" value={grams(nutrition?.salt_g, 2)} />
            <CompactMetricRow label="Błonnik" value={grams(nutrition?.fiber_g)} />
          </dl>
        </section>
        <section className="min-w-0" data-testid="profile-cost-card">
          <h3 className="mb-1.5 text-[9px] leading-[14px] font-semibold tracking-[0.08em] text-[var(--g-text-muted)] uppercase">
            Koszt
          </h3>
          <dl>
            <CompactMetricRow label="Na 1 kg" value={euro(costs?.cost_per_kg)} />
            <CompactMetricRow label="Cała partia" value={euro(costs?.total_cost)} />
            <CompactMetricRow label="Porcja 60 g" value={euro(costs?.cost_per_serving_60g)} />
            <CompactMetricRow label="Porcja 70 g" value={euro(costs?.cost_per_serving_70g)} />
            <CompactMetricRow label="Porcja 80 g" value={euro(costs?.cost_per_serving_80g)} />
          </dl>
          <p className="mt-2 text-[10px] leading-[15px] text-[var(--g-text-muted)]">
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
  const draftRevision = useRecipeStore((state) => state.draftRevision);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const hasNewRecipeStarter = useRecipeStore((state) => state.newRecipeStarterKey !== null);
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const activeDraftIdentity = useRecipeProfileStore((state) => state.activeDraftIdentity);
  const calculatedRecipeAuthority = useRecipeProfileStore(
    (state) => state.calculatedRecipeAuthority,
  );
  const recordCalculatedRecipe = useRecipeProfileStore((state) => state.recordCalculatedRecipe);
  const applyPending = useConstraintStudioStore((state) => state.applyPending);
  const applyBlocked = useConstraintStudioStore((state) => state.blocked);
  const appliedHistoryCount = useConstraintStudioStore((state) => state.history.length);
  const recalculationTerminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const customerPrices = useCustomerPriceStore((state) => state.overridesByCanonicalId);
  // Recipe profile indicators describe the technical BASE. Post-production
  // toppings intentionally affect final-product Label facts, but they are not
  // ProductBehavior prerequisites for this base-only panel.
  const baseAuthority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, snapshots }),
    [input.items, snapshots],
  );
  const baseSnapshots = useMemo(() => {
    const requiredLineIds = new Set(baseAuthority.requiredLineIds);
    return Object.fromEntries(
      Object.entries(snapshots).filter(([lineId]) => requiredLineIds.has(lineId)),
    );
  }, [baseAuthority.requiredLineIds, snapshots]);
  const legacyInspection = recipeBehaviorLegacyInspection(baseAuthority, savedRecipeId);
  const finalAuthority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots }),
    [input.items, snapshots, toppings],
  );
  const baseCurrentResultAuthority = useMemo(
    () =>
      buildCurrentRecipeResultAuthority({
        recipe: input,
        toppings: [],
        snapshots: baseSnapshots,
        draftRevision,
        awaitingRecalculation,
        loading: applyPending || recalculationTerminal?.state === 'WORKING',
      }),
    [
      applyPending,
      awaitingRecalculation,
      baseSnapshots,
      draftRevision,
      input,
      recalculationTerminal,
    ],
  );
  const finalCurrentResultAuthority = useMemo(
    () =>
      buildCurrentRecipeResultAuthority({
        recipe: input,
        toppings,
        snapshots,
        draftRevision,
        awaitingRecalculation,
        loading: applyPending || recalculationTerminal?.state === 'WORKING',
      }),
    [
      applyPending,
      awaitingRecalculation,
      draftRevision,
      input,
      recalculationTerminal,
      snapshots,
      toppings,
    ],
  );
  const finalLegacyInspection = recipeBehaviorLegacyInspection(finalAuthority, savedRecipeId);
  const calculatedForDraft =
    activeDraftIdentity !== null &&
    calculatedRecipeAuthority?.draftIdentity === activeDraftIdentity;
  const calculatedAuthorityCurrent =
    calculatedForDraft &&
    calculatedRecipeAuthority?.recipeFingerprint === baseCurrentResultAuthority.recipeFingerprint &&
    calculatedRecipeAuthority?.behaviorFingerprint ===
      baseCurrentResultAuthority.behaviorFingerprint;
  const completedWithoutApply =
    recalculationTerminal?.state === 'NO_CHANGE_NEEDED' ||
    recalculationTerminal?.state === 'BEST_ACHIEVABLE';
  const shouldRecordCalculatedRecipe =
    activeDraftIdentity !== null &&
    baseCurrentResultAuthority.ready &&
    (calculatedAuthorityCurrent ||
      !hasNewRecipeStarter ||
      appliedHistoryCount > 0 ||
      completedWithoutApply);
  useEffect(() => {
    if (!shouldRecordCalculatedRecipe || activeDraftIdentity === null) return;
    if (calculatedAuthorityCurrent) return;
    recordCalculatedRecipe({
      draftIdentity: activeDraftIdentity,
      recipeFingerprint: baseCurrentResultAuthority.recipeFingerprint,
      behaviorFingerprint: baseCurrentResultAuthority.behaviorFingerprint,
    });
  }, [
    activeDraftIdentity,
    baseCurrentResultAuthority.behaviorFingerprint,
    baseCurrentResultAuthority.recipeFingerprint,
    calculatedAuthorityCurrent,
    recordCalculatedRecipe,
    shouldRecordCalculatedRecipe,
  ]);
  const currentResultReady = baseCurrentResultAuthority.ready && !legacyInspection;
  const journeyState = friendlyLabRecipeJourneyState({
    currentResultAuthority: baseCurrentResultAuthority,
    awaitingRecalculation,
    hasNewRecipeStarter,
    appliedHistoryCount,
    recalculationTerminal,
    legacyInspection: Boolean(legacyInspection),
    calculatedForDraft,
    calculatedAuthorityCurrent,
  });
  const friendlyCurrentResultReady = journeyState === 'CURRENT' && currentResultReady;
  const previousApplyPending = useRef(applyPending);
  const applyStartHistoryCount = useRef(appliedHistoryCount);
  const applySuccessAwaitingCurrent = useRef(false);
  useEffect(() => {
    if (!previousApplyPending.current && applyPending) {
      applyStartHistoryCount.current = appliedHistoryCount;
      applySuccessAwaitingCurrent.current = false;
    }
    if (previousApplyPending.current && !applyPending) {
      applySuccessAwaitingCurrent.current =
        applyBlocked === null && appliedHistoryCount > applyStartHistoryCount.current;
    }
    if (!applyPending && friendlyCurrentResultReady && applySuccessAwaitingCurrent.current) {
      applySuccessAwaitingCurrent.current = false;
      announceFriendlyLabMoment('apply-complete', `apply:${draftRevision}:${appliedHistoryCount}`);
    }
    previousApplyPending.current = applyPending;
  }, [appliedHistoryCount, applyBlocked, applyPending, draftRevision, friendlyCurrentResultReady]);
  const liveBaseNutritionReady = baseCurrentResultAuthority.nutritionReady && !legacyInspection;
  const frozenNutritionResult = useMemo(
    () =>
      legacyInspection
        ? result
        : liveBaseNutritionReady
          ? calculateRecipe(recipeInputFromFrozenBehavior(input, baseAuthority, 'nutrition'))
          : result,
    [baseAuthority, input, legacyInspection, liveBaseNutritionReady, result],
  );
  const finalNutritionReady =
    finalLegacyInspection || (!legacyInspection && finalCurrentResultAuthority.nutritionReady);
  const finalCostReady =
    finalLegacyInspection || (!legacyInspection && finalCurrentResultAuthority.costReady);
  const finalNutritionProduct = useMemo(() => {
    if (!finalNutritionReady) return null;
    const finalInput = finalLegacyInspection
      ? input
      : recipeInputFromFrozenBehavior(input, finalAuthority, 'nutrition');
    const finalToppings = finalLegacyInspection
      ? toppings
      : recipeToppingsFromFrozenBehavior(toppings, finalAuthority, 'nutrition');
    return calculateFinalProduct(
      finalInput,
      applyEffectiveCustomerPricesToToppings(finalToppings, customerPrices),
      'planning',
    );
  }, [customerPrices, finalAuthority, finalLegacyInspection, finalNutritionReady, input, toppings]);
  const finalCostProduct = useMemo(() => {
    if (!finalCostReady) return null;
    return calculateFinalProduct(
      input,
      applyEffectiveCustomerPricesToToppings(toppings, customerPrices),
      'planning',
    );
  }, [customerPrices, finalCostReady, input, toppings]);
  return (
    <div
      className="w-full min-w-0 p-3 xl:p-0"
      data-testid="pro-context-recipe"
      data-current-result-state={baseCurrentResultAuthority.state}
      data-current-result-revision={baseCurrentResultAuthority.draftRevision}
      data-base-technical-ready={baseCurrentResultAuthority.baseTechnicalReady ? 'true' : 'false'}
      data-nutrition-ready={finalNutritionReady ? 'true' : 'false'}
      data-cost-ready={finalCostReady ? 'true' : 'false'}
      data-label-ready={finalCurrentResultAuthority.labelReady ? 'true' : 'false'}
      data-friendly-lab-recipe-state={journeyState}
    >
      {legacyInspection ? (
        <WorkflowNotice
          className="mb-2"
          eyebrow="Historia receptury"
          title="Podgląd historyczny"
          description="Przed edycją, zapisem lub produkcją utwórz zweryfikowaną wersję."
          variant="neutral"
        />
      ) : null}
      {/* OWNER FROZEN PRO VISUAL: the display column opens with WYNIK, then the
          controls that move it, then settings, then the recipe. The cards are
          gone, so the rhythm between bands — not a border — is what separates
          them; the gap has to carry the work the boxes used to do. */}
      <div
        className="grid min-w-0 items-start gap-5 xl:gap-[18px]"
        data-testid="profile-desktop-grid"
        data-profile-layout="stacked"
      >
        <NutritionCostProfileGrid
          result={frozenNutritionResult}
          nutritionReady={finalNutritionReady}
          costReady={finalCostReady}
          nutritionOverride={finalNutritionProduct?.finalLabelNutritionPer100g}
          costsOverride={finalCostProduct?.finalCosts}
        />
        <ProfileDirectionAxes result={frozenNutritionResult} className="min-w-0" />
        <WorkbenchSettingsLine actualBatchG={result.total_batch_g} className="min-w-0" compact />
        {recipeBar ? <div className="min-w-0">{recipeBar}</div> : null}
      </div>
      {/* OWNER FROZEN PRO VISUAL: WIEDZA is ONE quiet row, not a 58 px card.
          It closes the column, so it is a hairline above a single line of
          text — the disclosure mark carries the affordance and the orange is
          spent on state elsewhere, not on a permanent chevron. */}
      <button
        type="button"
        onClick={onOpenEducation}
        className="pro-focus-ring mt-5 flex min-h-11 w-full items-center justify-between gap-3 border-t border-[var(--g-line)] bg-transparent pt-3 text-left"
        data-testid="profile-learning-entry"
      >
        <span className="min-w-0">
          <span className="block text-[11px] leading-[16px] font-semibold text-[var(--g-ink)]">
            Wiedza o recepturze
          </span>
          <span className="block truncate text-[9px] leading-[14px] font-normal text-[var(--g-text-muted)]">
            Dlaczego taki wynik i jak przygotować recepturę?
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[var(--g-text-muted)]">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path
              d="M1.5 1 6.5 6l-5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
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
  result,
  recipeName,
}: {
  production?: ProductionWorkspaceView;
  onOpenProduction: () => void;
  initialLabelView: LabelWorkspaceView;
  labelViewRequestKey?: string;
  result: RecipeResult;
  recipeName: string | null;
}) {
  const completed = production?.session?.completionSnapshot ?? null;
  if (completed) {
    return (
      <div className="pro-scroll-safe" data-testid="pro-context-summary">
        {/* OWNER DECISION (2026-08-30): the workbench `Etykieta` tab is the
            CURRENT label plus the fields still missing for it — never a second
            settings screen. `settingsHome="production"` removes the settings
            view from this instance and points at Produkcja → Etykiety, which
            owns every persistent label setting. */}
        <LabelWorkspace
          key={labelViewRequestKey ?? initialLabelView}
          snapshot={completed}
          initialView={initialLabelView}
          settingsHome="production"
        />
      </div>
    );
  }

  /* OWNER DECISION (2026-08-30) — an explicit, approved divergence from the
     older V2.1 `pro-label-draft` gate. Before Production completes the reader
     now sees a LIVE DRAFT of the label they are making, with only the data that
     is still missing listed underneath it, instead of a panel telling them to
     go somewhere else. Nothing is fabricated: `buildMasterLabelData` and every
     regulatory and nutrition calculation are untouched, and LOT, the production
     date and the confirmed declaration are shown as outstanding. The final
     print stays unavailable until a real completed run exists — at which point
     the branch above takes over with the existing authority.

     The gate below is still the fallback for the one case a draft cannot be
     drawn truthfully: no saved label profile yet. */
  return (
    <div className="pro-scroll-safe p-3 xl:p-0" data-testid="pro-context-summary">
      <DraftLabelPanel
        result={result}
        productName={recipeName}
        fallback={<LabelProfileMissingNotice onOpenProduction={onOpenProduction} />}
      />
    </div>
  );
}

function LabelProfileMissingNotice({ onOpenProduction }: { onOpenProduction: () => void }) {
  return (
    <>
      {/* GELLATTI V2.1 §18 — the approved Label gate: eyebrow, 18 px title, its
          own body line, then the graphite action BELOW the copy. Structure and
          copy only; every Production → Label gate and calculation is untouched. */}
      <WorkflowNotice
        eyebrow="Etykieta"
        title="Etykieta potrzebuje zakończonej partii"
        description="Gdy zakończysz produkcję, pojawią się tu potwierdzone składniki, wartości odżywcze, koszt, baza techniczna i numer partii (LOT)."
        variant="attention"
        emphasis="lead"
        stackAction
        action={
          <Button size="sm" onClick={onOpenProduction}>
            Otwórz Produkcję
          </Button>
        }
        testId="label-workspace-empty"
      />
    </>
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
  initialLabelView = 'data',
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
  const savedRecipeName = useRecipeStore((state) => state.savedRecipeName);
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
      /* GELLATTI V2.1: on the desktop workbench the display column is NOT a card —
         it is a transparent 520 px track holding the approved cards on a 10 px
         rhythm. The mobile cockpit sheet keeps its own white surface. */
      className="right-pane min-h-full bg-white text-ink lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-[10px] lg:border lg:border-ink/10 lg:shadow-pro-e0 xl:rounded-none xl:border-0 xl:bg-transparent xl:shadow-none"
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
        /* The approved display column is a full 520 px: a permanently reserved
           scrollbar gutter would inset every card by ~15 px and break the 1:1
           geometry, so the gutter is claimed only when a scrollbar exists. */
        className="intelligence-tabpanel-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-hidden lg:[scrollbar-gutter:stable] xl:[scrollbar-gutter:auto]"
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
          <div className="pro-scroll-safe p-2 text-ink xl:p-0" data-testid="pro-context-monitor">
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
            result={result}
            recipeName={savedRecipeName}
          />
        ) : null}
      </div>
    </div>
  );
}
