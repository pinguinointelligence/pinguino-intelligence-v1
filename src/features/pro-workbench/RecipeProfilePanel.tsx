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
    /* OWNER FROZEN PRO VISUAL: the result opens the display column as a
       READOUT — the number leads at 22 px with its unit tucked in beside it,
       and the label sits underneath. The old card put a 14 px value behind an
       icon and a shadow; here the figure you came for is the largest thing in
       the column. The breakdown stays exactly as expandable as it was. */
    <section className="min-w-0 border-b border-[var(--g-line)] pb-5">
      <div className="mb-[13px] flex items-center gap-2.5">
        {/* WYNIK is the label whose glyph box lands on the panel's rounded,
            clipped corner — the reason the shared 2 px eyebrow inset exists.
            The rule and its full reasoning live in `gellatti-v2-1.css` under
            `[data-band-eyebrow]`, so all five band labels move together. */}
        <h3
          data-band-eyebrow
          className="shrink-0 text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
        >
          Wynik
        </h3>
        <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
      </div>
      <details className="group min-w-0" data-testid="profile-nutrition-cost-summary">
        {/* OWNER AUTHORITY 2026-09-02 (approved desktop PDF, §4). The result was
            a bordered two-cell box on ivory — a container competing with the
            numbers inside it. It is now a READOUT on the column ground: a quiet
            icon in a ring, the figure at 30 px as the largest thing in the
            band, its unit underneath, and a single hairline separating the two
            measures. Explicitly NOT another card. The breakdown stays exactly
            as expandable as it was, and the expand line is the only chrome. */}
        <summary
          className="pro-focus-ring cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          data-result-presentation="readout"
        >
          {/* 7.5 px so the 44 px ring is CENTRED on the same vertical axis as
              the 17 px chevron below it (21 + 17/2 = 29.5 = 7.5 + 44/2), which
              is also the axis the band legends sit on. Aligning their left
              edges instead pushed the ring 13.5 px right of the chevron. */}
          <span className="flex min-w-0 items-center pl-[7.5px]">
            <span className="flex min-w-0 shrink-0 items-center gap-[14px]">
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--g-line)] text-[var(--g-ink)]">
                <NutritionSummaryIcon tone="current" className="size-[18px] shrink-0" />
              </span>
              <span className="min-w-0">
                <b className="block text-[30px] leading-none font-extrabold tracking-[-0.042em] tabular-nums text-[var(--g-ink)]">
                  {nutrition ? nutrition.kcal.toFixed(0) : '—'}
                </b>
                <span className="mt-[7px] block text-[13px] leading-4 text-[var(--g-text-muted)]">
                  kcal / 100 g
                </span>
              </span>
            </span>
            <span aria-hidden className="mx-[18px] w-px shrink-0 self-stretch bg-[var(--g-line)]" />
            <span className="flex min-w-0 shrink-0 items-center gap-[14px]">
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--g-line)] text-[var(--g-ink)]">
                <CostSummaryIcon tone="current" className="size-[18px] shrink-0" />
              </span>
              <span className="min-w-0">
                <b className="block text-[30px] leading-none font-extrabold tracking-[-0.042em] tabular-nums text-[var(--g-ink)]">
                  {costs?.cost_per_kg == null ? '—' : `${costs.cost_per_kg.toFixed(2)} €`}
                </b>
                <span className="mt-[7px] block text-[13px] leading-4 text-[var(--g-text-muted)]">
                  za kg
                </span>
              </span>
            </span>
          </span>
          <span className="mt-[26px] flex min-w-0 items-start gap-3 pl-[21px] text-[15.5px] leading-[22px] font-medium tracking-[-0.02em] text-[var(--g-text-secondary)]">
            <svg
              aria-hidden
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              className="mt-[3px] shrink-0 text-[var(--g-text-muted)] transition-transform group-open:rotate-180"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="min-w-0">Rozwiń pełny rozkład składników i kosztów</span>
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
    </section>
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
      {/* OWNER AUTHORITY 2026-09-02 (approved desktop PDF, §2). The display
          column now opens with the recipe's IDENTITY, then the result it
          produced, then the controls that move that result, then the settings
          behind it. RECEPTURA used to sit fourth of five — the user read the
          numbers before knowing whose numbers they were. The cards are gone, so
          the rhythm between bands, not a border, is what separates them. */}
      <div
        className="grid min-w-0 items-start gap-5 xl:gap-[18px]"
        data-testid="profile-desktop-grid"
        data-profile-layout="stacked"
        data-profile-band-order="recipe,result,direction,settings"
      >
        {recipeBar ? <div className="min-w-0">{recipeBar}</div> : null}
        <NutritionCostProfileGrid
          result={frozenNutritionResult}
          nutritionReady={finalNutritionReady}
          costReady={finalCostReady}
          nutritionOverride={finalNutritionProduct?.finalLabelNutritionPer100g}
          costsOverride={finalCostProduct?.finalCosts}
        />
        <ProfileDirectionAxes result={frozenNutritionResult} className="min-w-0" />
        <WorkbenchSettingsLine className="min-w-0" compact />
      </div>
      {/* OWNER FROZEN PRO VISUAL: WIEDZA is a BAND like every other section —
          its own eyebrow closed by a hairline, then one quiet row. It used to
          be a 58 px bordered card with a permanent orange chevron, which spent
          the accent colour on a link that is never urgent. */}
      <section className="mt-5">
        <div className="mb-[13px] flex items-center gap-2.5">
          <h3
            data-band-eyebrow
            className="shrink-0 text-[10px] leading-[14px] font-semibold tracking-[0.16em] text-[var(--g-text-muted)] uppercase"
          >
            Wiedza
          </h3>
          <span aria-hidden className="h-px flex-1 bg-[var(--g-line)]" />
        </div>
        <button
          type="button"
          onClick={onOpenEducation}
          className="pro-focus-ring flex min-h-11 w-full items-center gap-3 bg-transparent text-left"
          data-testid="profile-learning-entry"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] leading-[19px] font-semibold tracking-[-0.015em] text-[var(--g-ink)]">
              Wiedza o recepturze
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] leading-[16px] font-normal text-[var(--g-text-muted)]">
              Dlaczego taki wynik i jak przygotować recepturę?
            </span>
          </span>
          <svg
            aria-hidden
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            className="ml-auto shrink-0 text-[var(--g-text-muted)]"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </section>
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
