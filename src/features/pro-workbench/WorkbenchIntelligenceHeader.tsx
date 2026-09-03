import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { useEffect, useMemo } from 'react';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { cn } from '@/lib/cn';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorLegacyInspection,
} from '@/features/product-intelligence';
import { monitorScoreView } from './monitorSummaryView';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { scorePresentationSource } from './scorePresentationSource';
import { assessProteinFormulation } from '@/features/protein-gelato/proteinAuthority';
import { WorkbenchScoreDisplay } from './WorkbenchScoreDisplay';
import { buildCurrentRecipeResultAuthority } from './currentRecipeResultAuthority';
import { friendlyLabRecipeJourneyState } from './friendlyLabRecipeJourney';
import { unfilledUserSuppliedRoles } from '@/features/formulation/formulate';

export function WorkbenchIntelligenceHeader({
  result,
  input,
  onOpenLearning,
  onRecalculate,
  variant = 'panel',
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenLearning?: () => void;
  onRecalculate?: () => void;
  variant?: 'panel' | 'global' | 'dock';
}) {
  const match = monitorScoreView(result, input).match;
  const snapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const draftRevision = useRecipeStore((state) => state.draftRevision);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const hasNewRecipeStarter = useRecipeStore((state) => state.newRecipeStarterKey !== null);
  const preview = useConstraintStudioStore((state) => state.preview);
  const directionBestCandidate = useConstraintStudioStore((state) => state.directionBestCandidate);
  const recalculationTerminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const appliedHistoryCount = useConstraintStudioStore((state) => state.history.length);
  const applyPending = useConstraintStudioStore((state) => state.applyPending);
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const activeDraftIdentity = useRecipeProfileStore((state) => state.activeDraftIdentity);
  const calculatedRecipeAuthority = useRecipeProfileStore(
    (state) => state.calculatedRecipeAuthority,
  );
  const recordCalculatedRecipe = useRecipeProfileStore((state) => state.recordCalculatedRecipe);
  const authority = useMemo(
    // Score currentness belongs to the technical Base. Post-production
    // toppings change final mass/cost only and cannot stale this authority.
    () => buildRecipeBehaviorAuthority({ items: input.items, snapshots }),
    [input.items, snapshots],
  );
  const baseSnapshots = useMemo(() => {
    const requiredLineIds = new Set(authority.requiredLineIds);
    return Object.fromEntries(
      Object.entries(snapshots).filter(([lineId]) => requiredLineIds.has(lineId)),
    );
  }, [authority.requiredLineIds, snapshots]);
  const currentResultAuthority = useMemo(
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
  const legacyInspection = recipeBehaviorLegacyInspection(authority, savedRecipeId);
  const calculatedForDraft =
    activeDraftIdentity !== null &&
    calculatedRecipeAuthority?.draftIdentity === activeDraftIdentity;
  const calculatedAuthorityCurrent =
    calculatedForDraft &&
    calculatedRecipeAuthority?.recipeFingerprint === currentResultAuthority.recipeFingerprint &&
    calculatedRecipeAuthority?.behaviorFingerprint === currentResultAuthority.behaviorFingerprint;
  const completedWithoutApply =
    recalculationTerminal?.state === 'NO_CHANGE_NEEDED' ||
    recalculationTerminal?.state === 'BEST_ACHIEVABLE';
  const shouldRecordCalculatedRecipe =
    activeDraftIdentity !== null &&
    currentResultAuthority.ready &&
    (calculatedAuthorityCurrent ||
      !hasNewRecipeStarter ||
      appliedHistoryCount > 0 ||
      completedWithoutApply);
  useEffect(() => {
    if (!shouldRecordCalculatedRecipe || activeDraftIdentity === null) return;
    if (calculatedAuthorityCurrent) return;
    recordCalculatedRecipe({
      draftIdentity: activeDraftIdentity,
      recipeFingerprint: currentResultAuthority.recipeFingerprint,
      behaviorFingerprint: currentResultAuthority.behaviorFingerprint,
    });
  }, [
    activeDraftIdentity,
    calculatedAuthorityCurrent,
    currentResultAuthority.behaviorFingerprint,
    currentResultAuthority.recipeFingerprint,
    recordCalculatedRecipe,
    shouldRecordCalculatedRecipe,
  ]);
  const journeyState = friendlyLabRecipeJourneyState({
    currentResultAuthority,
    awaitingRecalculation,
    hasNewRecipeStarter,
    appliedHistoryCount,
    recalculationTerminal,
    legacyInspection: Boolean(legacyInspection),
    calculatedForDraft,
    calculatedAuthorityCurrent,
  });

  /* THE ONE HIGHLIGHT. When the save gate's answer is „Przelicz recepturę, aby zapisać.",
     this is the control that sentence names — so this is the control that wears the
     marker, and Settings does not. Read from the same published blocker the card printed,
     never recomputed here: a second opinion could disagree with the sentence beside it. */
  const preflightBlocker = useRecipeProfileStore((state) => state.preflightBlocker);
  const recalcAttention = preflightBlocker?.action === 'recalculate';
  const hasRecipe = result.total_batch_g > 0;
  const previewInput =
    recalculationTerminal?.state === 'PREVIEW_READY'
      ? (preview?.proposedInput ?? directionBestCandidate?.proposedInput ?? null)
      : null;
  const previewMatch = useMemo(
    () =>
      previewInput ? monitorScoreView(calculateRecipe(previewInput), previewInput).match : null,
    [previewInput],
  );
  // The score evaluates the live recipe as written. Verified optimization
  // freshness remains separate in `state`/`journeyState`, and a stale draft
  // keeps its Recalculate control beside this read-only evaluation.
  const current = hasRecipe && currentResultAuthority.baseTechnicalReady && !legacyInspection;
  const verifiedCurrent =
    journeyState === 'CURRENT' && currentResultAuthority.ready && !legacyInspection;
  const displayedMatch = previewMatch ?? (current ? match : null);
  // Protein v2: measured content of the SAME candidate the ring is describing,
  // so a preview that lowers protein while raising the score renders exactly
  // that. Never a target, never an input to the score.
  const displayedProtein = useMemo(() => {
    if (input.category !== 'protein_gelato') return null;
    if (previewInput !== null) {
      const assessment = assessProteinFormulation(previewInput, calculateRecipe(previewInput));
      return {
        percent: assessment.actualPercent,
        energySharePercent: assessment.qualification.energySharePercent,
      };
    }
    if (!current) return null;
    const assessment = assessProteinFormulation(input, result);
    return {
      percent: assessment.actualPercent,
      energySharePercent: assessment.qualification.energySharePercent,
    };
  }, [current, input, previewInput, result]);
  const scoreSource = scorePresentationSource({
    previewReady: previewMatch !== null,
    currentReady: current,
    hasAppliedHistory: appliedHistoryCount > 0,
  });
  const working = recalculationTerminal?.state === 'WORKING';
  // A template role the customer must supply (a sorbet's fruit, a chocolate
  // gelato's chocolate) is never auto-added, so the scaffold deliberately
  // carries less mass than the target batch until they choose. Say so instead
  // of letting the draft read as an ordinary recipe that happens to be short —
  // the batch itself is untouched, only its completeness is reported.
  const missingUserSuppliedRole = useMemo(
    () => unfilledUserSuppliedRoles(input)[0] ?? null,
    [input],
  );
  /** One Polish call to action for every slot that reports the unfinished role. */
  const missingRoleActionPl =
    missingUserSuppliedRole === null
      ? null
      : `Najpierw wybierz składnik: ${missingUserSuppliedRole.labelPl.toLocaleLowerCase('pl')}.`;
  /**
   * A draft still missing a user-supplied role has NO meaningful recipe score to
   * present. Its scaffold is deliberately partial, so the calculated value reads
   * as a BAD recipe instead of an unfinished one — a fresh Sorbet scored 2/10 in
   * the low tone purely for not having its fruit yet. Hand the presentation the
   * neutral no-data state instead (the ring already renders „—" with the no-data
   * tone and no coloured arc) and say what is needed.
   *
   * Scoring itself is untouched: `monitorScoreView` still computes exactly what
   * it computed before, and the normal score returns the moment the role is
   * filled. This replaces only what the header HANDS to the score components.
   */
  const presentedMatch =
    missingRoleActionPl === null
      ? displayedMatch
      : { score: null, label: missingRoleActionPl, display: missingRoleActionPl };
  const pending = !displayedMatch;
  const recalculateNeeded =
    working || (previewMatch === null && (!verifiedCurrent || awaitingRecalculation));

  if (variant === 'dock') {
    return (
      <div
        className="flex min-w-0 items-center gap-2"
        data-testid="workbench-intelligence-header"
        data-score-source={scoreSource ?? 'AWAITING_CALCULATION'}
        data-current-result-state={currentResultAuthority.state}
        data-current-result-revision={currentResultAuthority.draftRevision}
        data-friendly-lab-recipe-state={journeyState}
        data-missing-user-supplied-role={missingUserSuppliedRole?.role ?? undefined}
      >
        {presentedMatch ? (
          <WorkbenchScoreDisplay
            score={presentedMatch.score}
            label={presentedMatch.label}
            proteinPercent={displayedProtein?.percent ?? null}
            proteinEnergySharePercent={displayedProtein?.energySharePercent ?? null}
            preview={previewMatch !== null}
            onOpenLearning={onOpenLearning}
          />
        ) : null}
        {pending || recalculateNeeded ? (
          <>
            {/* OWNER FROZEN PRO VISUAL. The reason the action is asking moves OUT of the
                button and stands beside it, carried by an orange dot and the attention
                ink. Orange states the CONDITION; graphite offers the ACTION. The button
                itself is never permanently orange. */}
            <span
              className="flex min-w-0 shrink items-center gap-2 text-[11px] leading-tight text-[var(--g-attention-ink)]"
              data-testid="pro-workbar-recalc-cue"
            >
              <i aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#f58a07]" />
              <span className="truncate">
                {working
                  ? 'Gellatti przygotowuje wynik'
                  : missingRoleActionPl
                    ? missingRoleActionPl
                    : journeyState === 'STALE'
                      ? 'Receptura się zmieniła'
                      : 'Zaktualizuj wynik receptury'}
              </span>
            </span>
            <button
              type="button"
              onClick={onRecalculate}
              disabled={!onRecalculate || working}
              aria-busy={working}
              data-testid="pro-workbar-recalc"
              data-save-attention={recalcAttention ? 'true' : undefined}
              className={cn(
                'pro-focus-ring flex h-11 shrink-0 items-center justify-center rounded-full bg-[var(--g-graphite)] px-7 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70',
                recalcAttention && 'pro-action-attention',
              )}
            >
              {working ? 'Przeliczanie…' : 'Przelicz'}
            </button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'global'
          ? 'min-w-0 bg-white text-ink'
          : 'border-b border-ink/8 bg-white px-3 py-2 text-ink'
      }
      data-testid="workbench-intelligence-header"
      data-score-source={scoreSource ?? 'AWAITING_CALCULATION'}
      data-current-result-state={currentResultAuthority.state}
      data-current-result-revision={currentResultAuthority.draftRevision}
      data-friendly-lab-recipe-state={journeyState}
      data-missing-user-supplied-role={missingUserSuppliedRole?.role ?? undefined}
      aria-label={`Dopasowanie techniczne receptury: ${presentedMatch ? presentedMatch.display : 'oczekuje na przeliczenie'}`}
    >
      <button
        type="button"
        onClick={recalculateNeeded ? onRecalculate : onOpenLearning}
        disabled={working || (recalculateNeeded ? !onRecalculate : !onOpenLearning)}
        aria-busy={working}
        className={`pro-focus-ring flex items-center justify-end gap-3 rounded-[12px] text-right disabled:cursor-default ${variant === 'global' ? 'min-h-12 sm:min-w-[210px]' : 'min-h-14 w-full'}`}
      >
        <span className={variant === 'global' ? 'hidden min-w-0 sm:block' : 'min-w-0'}>
          <span className="flex items-center justify-end gap-2">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${verifiedCurrent || previewMatch ? 'bg-[#18a83a]' : 'bg-[#f58a07]'}`}
            />
            <strong className="block truncate text-xs font-semibold text-ink">
              {previewMatch
                ? 'Podgląd gotowy'
                : verifiedCurrent
                  ? 'Obliczenia zakończone'
                  : working
                    ? 'Przeliczanie…'
                    : legacyInspection
                      ? 'Podgląd historyczny'
                      : missingUserSuppliedRole
                        ? 'Receptura niekompletna'
                        : journeyState === 'STALE'
                          ? 'Receptura się zmieniła.'
                          : hasRecipe
                            ? 'Oczekuje na przeliczenie'
                            : 'Brak danych'}
            </strong>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-stone-600">
            {presentedMatch
              ? `${presentedMatch.score ?? '—'} · ${previewMatch ? previewMatch.label : presentedMatch.label}`
              : 'Wynik pojawi się po przeliczeniu'}
          </span>
          {/* Protein v2: measured content, never a target and never a control. */}
        </span>
        <span
          className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-[#101113] font-mono text-lg font-semibold text-white shadow-pro-e1"
          data-testid="workbench-ai-mark"
        >
          Gellatti
        </span>
      </button>
    </div>
  );
}
