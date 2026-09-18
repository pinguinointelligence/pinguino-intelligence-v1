/**
 * DESIGN V3.0 IV D–I — HOME production: „HOME wygląda jak HOME, a od chwili robienia lodów
 * działa jak PRO”.
 *
 * ONE production system. The batch is the canonical Production session
 * (`productionSessionStore`: `setDraftActual` / `confirmLine`, `replaceSession`), its
 * steps are the ONE preparation plan PRO Production renders (`preparationPlanForSession`
 * + the machine's own guide), a confirmed deviation opens the same „Korekta partii” PRO
 * offers (the same decision gate `browserProductionRescueDecision`, the Rescue authority
 * `assessProductionRescue` / `applyVerifiedRescueInput` and `productionDecisionOptions`),
 * and the finish is the same `completeProductionSession`. HOME only brings its own frame:
 * „‹ Wróć”, „Produkcja · krok X z N”, the name, the numbered steps and the thumb-zone dock.
 *
 * No TARA, no „Dodałem dokładnie / Dodałem za dużo”, no simplified machine step: the row
 * being weighed opens „Ile jest w naczyniu?” at the plan and the ✓ confirms it.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { machineEducationForSelection } from '@/features/education/machineEducation';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  completeProductionSession,
  confirmProductionTopUpTask,
  pendingProductionTopUpTasks,
  productionProgress,
  productionStepForGrams,
  setProductionTopUpDraftGrams,
  type ProductionLineState,
  type ProductionTopUpTask,
} from '@/features/production-workspace/productionSession';
import { assessProductionRescue } from '@/features/production-workspace/productionRescue';
import { browserProductionRescueDecision } from '@/features/production-workspace/useProductionWorkspace';
import {
  productionDecisionExplanation,
  productionDecisionOptions,
  productionDecisionTitle,
  recommendedProductionDecision,
  type ProductionDecisionId,
} from '@/features/production-workspace/productionDecisionOptions';
import {
  productionSessionAddressKey,
  useProductionSessionStore,
} from '@/features/production-workspace/productionSessionStore';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import type { TenPointScore } from '@/features/recipe-score';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  productBehaviorRequiredLineIds,
  type ProductProcessReadiness,
} from '@/features/product-intelligence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints';
import { validateRecipeBehaviorOnServer } from '@/services/productIntelligence';
import { carbonatedProductsForRecipe } from '@/features/production-workspace/productionDegassing';
import { preparationPlanForSession } from '@/features/production-workspace/preparationPlan';
import { educationCopy } from '@/copy/education.pl';
import { PreparationIllustrationImage } from '@/features/education/PreparationIllustrationImage';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { homeCustomerNotice } from '../homeCustomerNotice';
import { useHomeDraftStore } from '../homeDraftStore';
import {
  formatProductionGrams,
  homeCurrentStepIndex,
  homeProcessSteps,
  type HomeProcessState,
  type HomeProcessStep,
} from '../homeProductionSteps';
import {
  HomeBackButton,
  HomeCurrentStep,
  HomeDoneSummary,
  HomeFutureStep,
  HomeNoMix,
  HomeProductionColumn,
  HomeProductionDock,
  HomeProductionDone,
  HomeStepBar,
  HomeStepBox,
  HomeStepText,
  HomeTick,
  HomeWeighCurrent,
  HomeWeighList,
  HomeWeighRow,
} from './HomeProductionParts';
import {
  HomeBatchCorrectionSheet,
  HomeTroubleSheet,
  type HomeCorrectionOptionView,
} from './HomeProductionSheets';

const copy = homeCreatorCopy.production;
const GRAMS_EPSILON = 0.000_001;
/** A shown difference: the same 0.05 g the PRO row treats as exact. */
const SHOWN_DIFFERENCE_G = 0.05;

const sessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const scoreFromDisplay = (display: string | undefined): TenPointScore | null => {
  const value = Number(display?.match(/^(\d{1,2})\/10$/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? (value as TenPointScore) : null;
};

const signedGrams = (delta: number): string =>
  `${delta > 0 ? '+' : '−'}${formatProductionGrams(Math.abs(delta))}`;

const latestConfirmed = (lines: readonly ProductionLineState[]): ProductionLineState | null =>
  lines
    .filter((line) => line.confirmationOrder !== null)
    .reduce<ProductionLineState | null>(
      (latest, line) =>
        latest === null || (line.confirmationOrder ?? 0) > (latest.confirmationOrder ?? 0)
          ? line
          : latest,
      null,
    );

export function HomePreparation({
  name,
  onBack,
  onSaveBatch,
  onSave,
  onShare,
  onCommunity,
  saved = false,
  notice = null,
}: {
  name: string;
  /** „‹ Wróć” — back to the recipe; the batch stays in its step. */
  onBack: () => void;
  /** „Zapisz” — the batch is kept on this device in its step; back to the recipe. */
  onSaveBatch: () => void;
  onSave: () => void;
  onShare: () => void;
  onCommunity: () => void;
  /** The recipe is saved and unchanged: „Udostępnij” becomes the one black action. */
  saved?: boolean;
  notice?: string | null;
}) {
  const recipe = useRecipeStore();
  const draft = useHomeDraftStore();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const production = useProductionSessionStore();
  const activateSessionForAddress = production.activateSessionForAddress;
  const [error, setError] = useState<string | null>(null);
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);
  const troubleSuccessor = useRef<(() => HTMLElement | null) | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<{
    basis: string;
    id: ProductionDecisionId;
  } | null>(null);
  const [productionGate, setProductionGate] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'blocked';
    message: string | null;
  } | null>(null);
  const plannedInput = useMemo(() => buildRecipeInput(recipe), [recipe]);
  const plannedComposition = useMemo(() => recipeCompositionFromState(recipe), [recipe]);
  const gateKey = useMemo(
    () =>
      JSON.stringify({
        ownerUserId,
        recipe: plannedInput,
        toppings: plannedComposition.toppings,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
      }),
    [ownerUserId, plannedComposition, plannedInput],
  );
  const source = useMemo(
    () => ({
      // Production may begin before Save. This stable local draft address keeps the
      // physical run continuous when an immutable recipe version is created later.
      recipeId: draft.draftId,
      recipeVersionId: null,
      recipeVersionNumber: null,
      recipeName: name,
    }),
    [draft.draftId, name],
  );
  const address = useMemo(
    () => ({ ownerUserId, recipeId: source.recipeId, recipeVersionId: source.recipeVersionId }),
    [ownerUserId, source.recipeId, source.recipeVersionId],
  );
  const addressKey = productionSessionAddressKey(address);

  useEffect(() => {
    activateSessionForAddress(address);
  }, [activateSessionForAddress, address, addressKey]);

  useEffect(() => {
    const current = useProductionSessionStore.getState();
    if (current.session || current.activeAddressKey !== addressKey) return;
    let cancelled = false;

    void (async () => {
      if (!ownerUserId) {
        if (!cancelled) {
          setProductionGate({
            key: gateKey,
            status: 'blocked',
            message: 'Zaloguj się, aby bezpiecznie rozpocząć przygotowanie.',
          });
        }
        return;
      }
      const localAuthority = evaluateRecipeConstraintAuthority({
        recipe: plannedInput,
        snapshots: plannedComposition.behaviorSnapshots ?? {},
        module: 'RECIPE_VERSION',
        technicalOnlyMainLineIds: plannedComposition.ownerReviewGate?.technicalOnlyMainLineIds,
      });
      if (!localAuthority.valid) {
        if (!cancelled) {
          setProductionGate({
            key: gateKey,
            status: 'blocked',
            message:
              homeCustomerNotice(localAuthority.issues[0]?.messagePl ?? null) ??
              'Nie możemy jeszcze potwierdzić tego kroku przygotowania.',
          });
        }
        return;
      }

      const requiredLineIds = productBehaviorRequiredLineIds({
        items: plannedInput.items,
        toppings: plannedComposition.toppings,
      });
      let processReadiness: ProductProcessReadiness = {
        schemaVersion: 1,
        status: 'READY',
        blockers: [],
        advisories: [],
      };
      if (requiredLineIds.length > 0) {
        const validation = await validateRecipeBehaviorOnServer({
          recipe: plannedInput,
          toppings: plannedComposition.toppings,
          snapshots: plannedComposition.behaviorSnapshots ?? {},
          module: 'PRODUCTION',
          accountId: ownerUserId,
        });
        if (!validation.ready) {
          if (!cancelled) {
            setProductionGate({
              key: gateKey,
              status: 'blocked',
              message:
                'Nie możemy jeszcze potwierdzić przygotowania dla wszystkich wybranych produktów.',
            });
          }
          return;
        }
        processReadiness = validation.processReadiness ?? processReadiness;
      }
      if (cancelled || useProductionSessionStore.getState().activeAddressKey !== addressKey) return;
      const carbonated = carbonatedProductsForRecipe(plannedInput, plannedComposition);
      const processAdvisories = [...processReadiness.blockers, ...processReadiness.advisories];
      useProductionSessionStore.getState().startNewSession({
        ownerUserId,
        source,
        plannedInput,
        plannedComposition,
        now: new Date().toISOString(),
        sessionId: sessionId(),
        processReadiness: processAdvisories.length > 0 ? 'READY_WITH_INFO' : 'READY',
        processAdvisories,
        degassingRequired: carbonated.length > 0,
        carbonatedProductIds: carbonated.map((product) => product.productId),
      });
      setProductionGate({ key: gateKey, status: 'ready', message: null });
    })().catch(() => {
      if (!cancelled) {
        setProductionGate({
          key: gateKey,
          status: 'blocked',
          message: 'Nie udało się potwierdzić przygotowania. Spróbuj ponownie.',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [addressKey, gateKey, ownerUserId, plannedComposition, plannedInput, source]);

  const session = production.session;
  const guide = useMemo(
    () => machineEducationForSelection(recipe.machineId, recipe.machineTechnology),
    [recipe.machineId, recipe.machineTechnology],
  );
  // A Professional recipe (an official Gellatti recipe opened in HOME keeps its
  // Professional machine, §16) has no home-machine guide. PRO Production runs such a
  // batch with no machine hand-off (`machineGuide: null`); HOME does exactly the same
  // rather than ending in „Brakuje instrukcji urządzenia” with no way on (served
  // 2026-09-18: Mango Sorbet → „Zróbmy to”). A HOME machine with no confirmed guide
  // still stops below — that is an unconfirmed process, not a missing hand-off.
  const professionalWithoutGuide = guide === null && recipe.machineKind === 'professional';
  // The same preparation plan PRO Production renders: order, instructions, the heat step,
  // the machine's own sequence and its registered illustration.
  const plan = useMemo(
    () => (session ? preparationPlanForSession(session, guide) : null),
    [guide, session],
  );
  const steps = useMemo<HomeProcessStep[]>(
    () =>
      plan && session
        ? homeProcessSteps(plan, {
            degassingTitle: session.degassingRequired ? copy.degasTitle : null,
          })
        : [],
    [plan, session],
  );
  // The SAME decision gate as PRO Production: a confirmed Base line away from its current
  // target (and not waiting for an authorised top-up) needs a „Korekta partii” decision.
  const decisionGate = useMemo(() => browserProductionRescueDecision(session), [session]);
  const assessment = useMemo(
    () => (session && decisionGate.state === 'options' ? assessProductionRescue(session) : null),
    [decisionGate.state, session],
  );
  const decisionNeeded = assessment !== null && assessment.state !== 'not_needed';
  // The run's frozen plan: later confirmations never change it, so its Score is read once.
  const frozenPlannedInput = session?.plannedInput ?? null;
  const plannedScore = useMemo(
    () =>
      frozenPlannedInput
        ? monitorScoreView(calculateRecipe(frozenPlannedInput), frozenPlannedInput).match.score
        : null,
    [frozenPlannedInput],
  );

  const pendingTopUps: ProductionTopUpTask[] = session ? pendingProductionTopUpTasks(session) : [];
  const pendingTopUpLineIds = new Set(pendingTopUps.map((task) => task.sourceRecipeLineId));
  const deviatingLine = session
    ? latestConfirmed(
        session.lines.filter(
          (line) =>
            line.confirmed &&
            !pendingTopUpLineIds.has(line.lineId) &&
            Math.abs(line.physicalAddedGrams - line.targetGrams) > GRAMS_EPSILON,
        ),
      )
    : null;
  const lastConfirmedBase = session ? latestConfirmed(session.lines) : null;
  const doneStepIds = new Set(
    session && draft.preparationSteps?.sessionId === session.sessionId
      ? draft.preparationSteps.doneStepIds
      : [],
  );
  const processState: HomeProcessState | null = session
    ? {
        confirmedLineIds: new Set(
          [...session.lines, ...session.addonLines]
            .filter((line) => line.confirmed)
            .map((line) => line.lineId),
        ),
        holdLineId:
          decisionNeeded || pendingTopUps.length > 0 ? (lastConfirmedBase?.lineId ?? null) : null,
        degassingDone: !session.degassingRequired || session.degassingAcknowledged,
        machineDone: session.stage === 'addons',
        doneStepIds,
      }
    : null;
  const firstUndone = processState ? homeCurrentStepIndex(steps, processState) : 0;
  const allDone = steps.length > 0 && firstUndone >= steps.length;
  const currentIndex = Math.min(firstUndone, Math.max(steps.length - 1, 0));
  const currentStep = steps[currentIndex] ?? null;
  const isLastStep = currentIndex === steps.length - 1;

  // A new step starts at the top of the frame (the design's „floor” reset).
  const shownStep = useRef<number | null>(null);
  useEffect(() => {
    if (shownStep.current !== null && shownStep.current !== currentIndex) {
      document.getElementById('preparation')?.scrollIntoView?.({ block: 'start' });
    }
    shownStep.current = currentIndex;
  }, [currentIndex]);

  const now = () => new Date().toISOString();
  const run = (action: () => void, fallback: string) => {
    setError(null);
    try {
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    }
  };

  const confirmLine = (line: ProductionLineState) =>
    run(() => {
      const store = useProductionSessionStore.getState();
      store.confirmLine(line.lineId, now());
      const confirmed = useProductionSessionStore.getState().session;
      if (confirmed) {
        // Only a Base confirmation reaches the machine hand-off; a topping never sends the
        // customer back to the machine step.
        const justCompletedBase =
          confirmed.lines.some((candidate) => candidate.lineId === line.lineId) &&
          confirmed.lines.every((candidate) => candidate.confirmed);
        store.replaceSession({
          ...confirmed,
          // The shared confirmer opens `addons` as soon as BASE is complete. HOME holds
          // that existing Production stage until the customer finishes the machine step,
          // then opens the topping stage.
          stage: justCompletedBase && !professionalWithoutGuide ? 'base' : confirmed.stage,
          durableActualRevision: confirmed.durableActualRevision + 1,
        });
      }
      setOpenLineId(null);
    }, 'Nie udało się potwierdzić ilości.');

  const setLineDraft = (line: ProductionLineState, grams: number) =>
    run(
      () => useProductionSessionStore.getState().setDraftActual(line.lineId, grams),
      'Nie udało się zapisać ilości.',
    );

  /** The ✓ of a row already added: the record is corrected, never the vessel emptied. */
  const reopenLine = (line: ProductionLineState) =>
    run(() => {
      useProductionSessionStore.getState().reopenRecord(line.lineId);
      setOpenLineId(line.lineId);
    }, 'Nie udało się otworzyć zapisu.');

  const setTopUpDraft = (task: ProductionTopUpTask, grams: number) =>
    run(() => {
      const current = useProductionSessionStore.getState().session;
      if (!current) return;
      useProductionSessionStore
        .getState()
        .replaceSession(setProductionTopUpDraftGrams(current, task.taskId, grams));
    }, 'Nie udało się zapisać ilości.');

  const confirmTopUp = (task: ProductionTopUpTask) =>
    run(() => {
      const current = useProductionSessionStore.getState().session;
      if (!current) return;
      useProductionSessionStore
        .getState()
        .replaceSession(confirmProductionTopUpTask(current, task.taskId, now()));
    }, 'Nie udało się potwierdzić korekty.');

  const complete = () =>
    run(() => {
      const current = useProductionSessionStore.getState().session;
      if (!current) return;
      useProductionSessionStore
        .getState()
        .replaceSession(
          completeProductionSession(
            current,
            calculateRecipe(buildFinalActualInput(current)),
            now(),
            ownerUserId,
          ),
        );
      document.getElementById('preparation')?.scrollIntoView?.({ block: 'start' });
    }, 'Nie udało się zakończyć partii.');

  /** „Gotowe” on a step that has no weighing of its own. */
  const finishDoStep = (step: HomeProcessStep) =>
    run(() => {
      const current = useProductionSessionStore.getState().session;
      if (!current) return;
      if (step.kind === 'degas') {
        useProductionSessionStore.getState().replaceSession({
          ...current,
          degassingAcknowledged: true,
          degassingAcknowledgedAt: now(),
        });
      } else if (step.kind === 'machine') {
        // The customer does the machine step and moves on: a missing numeric time never
        // holds the flow, and the click claims no elapsed time.
        useProductionSessionStore.getState().replaceSession({ ...current, stage: 'addons' });
      } else {
        useHomeDraftStore.getState().markPreparationStepDone(current.sessionId, step.id);
      }
    }, 'Nie udało się przejść dalej.');

  if (!session) {
    const blocked = productionGate?.key === gateKey && productionGate.status === 'blocked';
    return (
      <HomeProductionColumn testId={blocked ? 'home-preparation-blocked' : 'home-preparation'}>
        <div className="flex min-h-11 items-center">
          <HomeBackButton onClick={onBack} testId="home-production-back" />
        </div>
        <p className="mt-4 text-sm text-stone-600" role={blocked ? 'alert' : undefined}>
          {blocked
            ? productionGate?.message
            : 'Potwierdzamy kroki przygotowania dla tej receptury…'}
        </p>
      </HomeProductionColumn>
    );
  }

  if (!guide && !professionalWithoutGuide) {
    return (
      <HomeProductionColumn testId="home-preparation-blocked">
        <div className="flex min-h-11 items-center">
          <HomeBackButton onClick={onBack} testId="home-production-back" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">Brakuje instrukcji urządzenia</h2>
        <p className="mt-3 text-sm text-stone-600">
          Wybierz ponownie urządzenie. Nie pokażemy niepotwierdzonego procesu.
        </p>
      </HomeProductionColumn>
    );
  }

  if (session.status === 'completed') {
    const finalMassG =
      session.completionSnapshot?.actualFinalMassG ??
      session.lines.reduce((sum, line) => sum + line.physicalAddedGrams, 0);
    return (
      <HomeProductionColumn testId="home-production-complete">
        <div className="flex min-h-11 items-center">
          <HomeBackButton onClick={onBack} testId="home-production-back" />
        </div>
        <HomeProductionDone
          subtitle={`${name} · ${formatProductionGrams(finalMassG)}`}
          stepTitles={steps.map((step) => step.title)}
          notice={notice}
          saved={saved}
          onSave={onSave}
          onShare={onShare}
          onCommunity={onCommunity}
        />
      </HomeProductionColumn>
    );
  }

  const lineById = new Map(
    [...session.lines, ...session.addonLines].map((line) => [line.lineId, line] as const),
  );
  const progress = productionProgress(session);

  /* ---------- „Korekta partii” ---------- */
  const decisionBasis = `${session.sessionId}:${session.durableActualRevision}:${session.durableRescueRevision}`;
  const correctionOptions: HomeCorrectionOptionView[] = [];
  let recommendedId: ProductionDecisionId | null = null;
  if (assessment && decisionNeeded) {
    const byId = new Map(assessment.options.map((option) => [option.id, option] as const));
    for (const option of productionDecisionOptions({
      currentPlanMassG: progress.currentPlanMassG,
      plannedScore,
      forecastScore: scoreFromDisplay(assessment.forecastScoreDisplay),
    })) {
      const verified = byId.get(option.id);
      if (!verified) continue;
      const score = scoreFromDisplay(verified.scoreDisplay);
      correctionOptions.push({
        id: option.id,
        title: productionDecisionTitle(option, verified.finalMassG),
        explanation: productionDecisionExplanation(option, plannedScore, score),
        score,
        finalMassG: verified.finalMassG,
      });
    }
    recommendedId =
      recommendedProductionDecision(
        Object.fromEntries(
          assessment.options.map((option) => [option.id, { scoreDisplay: option.scoreDisplay }]),
        ),
      ) ?? null;
  }
  const selectedId =
    (selectedDecision?.basis === decisionBasis ? selectedDecision.id : null) ?? recommendedId;
  const selectedView = correctionOptions.find((option) => option.id === selectedId) ?? null;
  const applyLabel =
    selectedView?.id === 'restore_original_recipe'
      ? copy.correctionRestoreApply
      : selectedView?.id === 'leave_as_is'
        ? copy.correctionLeaveApply
        : (selectedView?.title ?? copy.correctionTitle);
  const applyDecision = () =>
    run(() => {
      const current = useProductionSessionStore.getState().session;
      const option = assessment?.options.find((candidate) => candidate.id === selectedId);
      if (!current || !option) return;
      const next = applyVerifiedRescueInput(current, option.candidateInput);
      useProductionSessionStore.getState().replaceSession({
        ...next,
        lastDeviationDecision: {
          strategy: option.id,
          acceptedAt: now(),
          sourceActualRevision: current.durableActualRevision,
          rescueRevision: next.durableRescueRevision,
          finalMassG: option.finalMassG,
          scoreDisplay: option.scoreDisplay,
        },
      });
    }, 'Nie udało się zastosować korekty.');
  /** „Wróć” from the correction: back to the row to correct the entry. */
  const backFromCorrection = () => {
    if (deviatingLine) reopenLine(deviatingLine);
  };

  /* ---------- the latest deviation's outcome, on its row ---------- */
  const latestDeviated = latestConfirmed(
    session.lines.filter(
      (line) =>
        line.confirmed && Math.abs(line.physicalAddedGrams - line.plannedGrams) > GRAMS_EPSILON,
    ),
  );
  const decisionWord = session.lastDeviationDecision
    ? session.lastDeviationDecision.strategy === 'leave_as_is'
      ? copy.resultAccepted
      : copy.planCorrected
    : null;

  /* ---------- the current step ---------- */
  const stepNumber = currentIndex + 1;
  const total = steps.length;
  let body: ReactNode = null;
  let dock: { lead: string; detail: string; action: string; onAction: () => void } | null = null;
  let activeFieldLineId: string | null = null;

  if (currentStep?.kind === 'weigh') {
    const planLines = currentStep.lines.filter((planLine) => lineById.has(planLine.lineId));
    const topUps = currentStep.scope === 'base' ? pendingTopUps : [];
    const activeTopUp = topUps[0] ?? null;
    const unconfirmed = planLines.filter((planLine) => !lineById.get(planLine.lineId)!.confirmed);
    const activePlanLine = activeTopUp
      ? null
      : (unconfirmed.find((planLine) => planLine.lineId === openLineId) ?? unconfirmed[0] ?? null);
    const sharedInstruction =
      new Set(planLines.map((planLine) => planLine.instruction)).size === 1
        ? (planLines[0]?.instruction ?? null)
        : null;
    const canReopen = !decisionNeeded && pendingTopUps.length === 0;
    const remaining = unconfirmed.length + topUps.length;

    const rows: ReactNode[] = [];
    topUps.forEach((task, index) => {
      const current = index === 0;
      const delta = task.draftDeltaG - task.authorizedDeltaG;
      const row = (
        <HomeWeighRow
          key={task.taskId}
          rowKey={task.taskId}
          name={task.ingredientName}
          sub={copy.topUpWeighed(formatProductionGrams(task.physicalBaselineG))}
          subTone={current ? 'current' : 'later'}
          grams={`+${formatProductionGrams(task.authorizedDeltaG)}`}
          emphasis={current}
          tick={
            <HomeTick
              state={current ? 'current' : 'later'}
              label={copy.confirmAdded(task.ingredientName)}
              onClick={() => confirmTopUp(task)}
              testId={`home-production-tick-${task.taskId}`}
            />
          }
        />
      );
      if (!current) {
        rows.push(row);
        return;
      }
      activeFieldLineId = task.taskId;
      rows.push(
        <HomeWeighCurrent
          key={task.taskId}
          row={row}
          lineId={task.taskId}
          name={task.ingredientName}
          guidance={null}
          value={task.draftDeltaG}
          min={0}
          step={productionStepForGrams(task.authorizedDeltaG)}
          deviation={
            Math.abs(delta) > SHOWN_DIFFERENCE_G
              ? {
                  text: copy.difference(
                    signedGrams(delta),
                    formatProductionGrams(task.authorizedDeltaG),
                  ),
                  next: copy.differenceNext,
                }
              : null
          }
          onChange={(grams) => setTopUpDraft(task, grams)}
          onTypingChange={setTyping}
        />,
      );
    });

    for (const planLine of planLines) {
      const line = lineById.get(planLine.lineId)!;
      if (line.confirmed) {
        const differs = Math.abs(line.physicalAddedGrams - line.plannedGrams) > GRAMS_EPSILON;
        const sub = differs
          ? [
              copy.addedAmount(formatProductionGrams(line.physicalAddedGrams)),
              latestDeviated?.lineId === line.lineId ? decisionWord : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : copy.added;
        rows.push(
          <HomeWeighRow
            key={line.lineId}
            rowKey={line.lineId}
            name={line.name}
            sub={sub}
            subTone="done"
            grams={formatProductionGrams(line.physicalAddedGrams)}
            tick={
              <HomeTick
                state="done"
                label={copy.reopenAdded(line.name)}
                onClick={canReopen ? () => reopenLine(line) : undefined}
                testId={`home-production-tick-${line.lineId}`}
              />
            }
          />,
        );
        continue;
      }
      const current = planLine.lineId === activePlanLine?.lineId;
      const correctionMode = line.recordCorrectionCount > 0;
      const row = (
        <HomeWeighRow
          key={line.lineId}
          rowKey={line.lineId}
          name={line.name}
          sub={current ? (correctionMode ? copy.correctingRecord : copy.weighNow) : copy.later}
          subTone={current ? 'current' : 'later'}
          grams={formatProductionGrams(line.targetGrams)}
          emphasis={current}
          onOpen={current ? undefined : () => setOpenLineId(line.lineId)}
          tick={
            <HomeTick
              state={current ? 'current' : 'later'}
              label={copy.confirmAdded(line.name)}
              onClick={() => confirmLine(line)}
              testId={`home-production-tick-${line.lineId}`}
            />
          }
        />
      );
      if (!current) {
        rows.push(row);
        continue;
      }
      activeFieldLineId = line.lineId;
      const delta = line.draftActualGrams - line.targetGrams;
      const ownInstruction =
        planLine.instruction !== sharedInstruction ? planLine.instruction : null;
      rows.push(
        <HomeWeighCurrent
          key={line.lineId}
          row={row}
          lineId={line.lineId}
          name={line.name}
          guidance={
            ownInstruction || planLine.note ? (
              <p
                className="mb-2 text-[13px] leading-[1.4] text-[#3b3833]"
                data-testid="home-production-line-guidance"
              >
                {ownInstruction ? (
                  <span className="block font-semibold">{ownInstruction}</span>
                ) : null}
                {planLine.note ? (
                  <span className="block text-[#5f5a52]" data-testid="home-production-line-note">
                    {planLine.note}
                  </span>
                ) : null}
              </p>
            ) : null
          }
          value={line.draftActualGrams}
          min={correctionMode ? 0 : line.physicalAddedGrams}
          step={productionStepForGrams(line.targetGrams)}
          deviation={
            Math.abs(delta) > SHOWN_DIFFERENCE_G
              ? {
                  text: copy.difference(
                    signedGrams(delta),
                    formatProductionGrams(line.targetGrams),
                  ),
                  // Toppings never start a batch correction (they do not change the base).
                  next: currentStep.scope === 'base' ? copy.differenceNext : null,
                }
              : null
          }
          onChange={(grams) => setLineDraft(line, grams)}
          onTypingChange={setTyping}
        />,
      );
    }

    body = (
      <div data-testid={currentStep.scope === 'addon' ? 'home-topping-step' : 'home-base-step'}>
        <HomeStepText text={sharedInstruction}>
          {currentStep.scope === 'addon' ? <HomeNoMix /> : null}
        </HomeStepText>
        <HomeWeighList>{rows}</HomeWeighList>
      </div>
    );

    if (activeTopUp) {
      dock = {
        lead: copy.dockNow(activeTopUp.ingredientName),
        detail: [
          copy.dockTopUp(formatProductionGrams(activeTopUp.authorizedDeltaG)),
          remaining > 1 ? copy.dockThen(remaining - 1) : copy.dockLastInStep,
        ].join(' · '),
        action: copy.next,
        onAction: () => confirmTopUp(activeTopUp),
      };
    } else if (activePlanLine) {
      const line = lineById.get(activePlanLine.lineId)!;
      dock = {
        lead: copy.dockNow(line.name),
        detail: [
          copy.dockPlan(formatProductionGrams(line.targetGrams)),
          remaining > 1 ? copy.dockThen(remaining - 1) : copy.dockLastInStep,
        ].join(' · '),
        action: copy.next,
        onAction: () => confirmLine(line),
      };
    } else {
      dock = {
        lead: `${copy.dockStep(stepNumber, total)} · ${copy.dockWeighed}`,
        detail: currentStep.title,
        action: allDone ? copy.finish : copy.next,
        onAction: allDone ? complete : () => undefined,
      };
    }
  } else if (currentStep) {
    const step = currentStep;
    if (step.kind === 'before') {
      body = (
        <div data-testid="home-preparation-before-start">
          <HomeStepText text={step.details.join(' · ')} note={step.timing} />
        </div>
      );
    } else if (step.kind === 'degas') {
      body = (
        <div data-testid="home-production-degassing">
          <HomeStepText text={copy.degasLead}>
            <ul className="mt-1 text-[14px] text-[#3b3833]">
              {carbonatedProductsForRecipe(session.plannedInput, session.plannedComposition).map(
                (product) => (
                  <li key={product.productId}>• {product.name}</li>
                ),
              )}
            </ul>
          </HomeStepText>
        </div>
      );
    } else if (step.kind === 'heat') {
      body = (
        <div data-testid="home-preparation-heat-step">
          <HomeStepText text={step.details[0] ?? null} note={step.details.slice(1).join(' ')} />
          <HomeStepBox testId="home-preparation-heat-products">
            <span>
              {educationCopy.preparation.heat.lead} {step.productNames.join(', ')}
            </span>
          </HomeStepBox>
          {step.afterCoolingNames.length > 0 ? (
            <HomeStepBox label={educationCopy.preparation.heat.afterCoolingTitle}>
              <span>{step.afterCoolingNames.join(', ')}</span>
            </HomeStepBox>
          ) : null}
        </div>
      );
    } else {
      body = (
        <div data-testid="home-machine-step" data-machine-id={guide?.sourceMachineId ?? undefined}>
          {step.illustration ? (
            <PreparationIllustrationImage
              illustration={step.illustration}
              sizes="168px"
              className="mb-3 w-full max-w-[168px]"
            />
          ) : null}
          <ol className="mb-1 grid gap-1 px-1 text-[16px] leading-[1.3] font-semibold text-[var(--g-ink)]">
            {step.details.map((detail, index) => (
              <li key={`${index}:${detail}`}>
                {step.details.length > 1 ? `${index + 1}. ` : ''}
                {detail}
              </li>
            ))}
          </ol>
          {/* The shared plan decides which timing belongs here (a verified bowl pre-freeze
              was already its own step before start). */}
          {step.timing ? (
            <p className="px-1 text-[13px] leading-[1.4] text-[#5f5a52]">{step.timing}</p>
          ) : null}
          {step.asideNames.length > 0 ? (
            <HomeStepBox tone="no-mix" testId="home-production-set-aside">
              <HomeNoMix inBox />
              <span>{copy.setAside(step.asideNames.join(', '))}</span>
            </HomeStepBox>
          ) : null}
        </div>
      );
    }
    dock = {
      lead: copy.dockStep(stepNumber, total),
      detail: step.title,
      action: isLastStep ? copy.finish : step.kind === 'degas' ? copy.degasDone : copy.next,
      onAction: () => {
        finishDoStep(step);
        if (isLastStep) complete();
      },
    };
  }

  const weighingRowId =
    currentStep?.kind === 'weigh' && activeFieldLineId !== null ? activeFieldLineId : null;
  const weighedFieldInput = () =>
    weighingRowId === null
      ? null
      : document.querySelector<HTMLInputElement>(
          `[data-testid="home-production-field-${weighingRowId}"] input`,
        );
  /** „Zważyłem inną ilość”: the sheet closes onto the amount of the row being weighed. */
  const focusWeighedAmount = () => {
    troubleSuccessor.current = weighedFieldInput;
    setTroubleOpen(false);
  };

  return (
    <HomeProductionColumn testId="home-preparation">
      <div className="flex min-h-11 items-center">
        <HomeBackButton onClick={onBack} testId="home-production-back" />
      </div>
      <p
        className="mt-2 text-[11px] leading-none font-bold tracking-[0.12em] text-[#a29d94] uppercase"
        data-testid="home-production-eyebrow"
      >
        {copy.eyebrow(stepNumber, total)}
      </p>
      <h2 className="mt-1.5 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
        {name}
      </h2>
      {progress.targetChanged ? (
        <p
          className="mt-1 text-[12.5px] leading-[1.3] text-[#65635f]"
          data-testid="home-production-batch-changed"
        >
          {copy.batchChanged(
            formatProductionGrams(progress.currentPlanMassG),
            formatProductionGrams(progress.originalTargetMassG),
          )}
        </p>
      ) : null}
      <HomeStepBar total={total} current={currentIndex} />

      <ol className="grid gap-2" data-testid="home-production-steps">
        {currentIndex > 0 ? (
          <HomeDoneSummary names={steps.slice(0, currentIndex).map((step) => step.title)} />
        ) : null}
        {currentStep ? (
          <HomeCurrentStep
            number={stepNumber}
            total={total}
            title={currentStep.title}
            kind={currentStep.kind}
          >
            {body}
          </HomeCurrentStep>
        ) : null}
        {steps.slice(currentIndex + 1).map((step, offset) => (
          <HomeFutureStep
            key={step.id}
            number={currentIndex + offset + 2}
            title={step.title}
            detail={step.kind === 'weigh' ? step.lines.map((line) => line.name).join(' · ') : null}
          />
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setTroubleOpen(true)}
          data-testid="home-production-trouble-open"
          className="rounded-full bg-white px-3.5 py-2.5 text-[13.5px] leading-none font-semibold text-[#3b3833] shadow-[inset_0_0_0_1px_#e4e0d9] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {copy.trouble}
        </button>
        <button
          type="button"
          onClick={onSaveBatch}
          data-testid="home-production-save"
          className="inline-flex h-10 items-center rounded-full border border-[var(--g-line)] bg-white px-[18px] text-[14px] font-semibold text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {copy.saveBatch}
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--g-attention-ink)' }}>
          {error}
        </p>
      ) : null}

      {dock ? (
        <HomeProductionDock
          lead={dock.lead}
          detail={dock.detail}
          action={dock.action}
          onAction={dock.onAction}
          disabled={decisionNeeded}
          typing={typing}
        />
      ) : null}

      {decisionNeeded ? (
        <HomeBatchCorrectionSheet
          what={
            deviatingLine
              ? {
                  name: deviatingLine.name,
                  actualG: deviatingLine.physicalAddedGrams,
                  planG: deviatingLine.targetGrams,
                }
              : null
          }
          options={correctionOptions}
          impossibleReason={assessment?.state === 'impossible' ? assessment.reason : null}
          recommendedId={recommendedId}
          selectedId={selectedId}
          applyLabel={applyLabel}
          onSelect={(id) => setSelectedDecision({ basis: decisionBasis, id })}
          onApply={applyDecision}
          onBack={backFromCorrection}
        />
      ) : null}

      {troubleOpen && !decisionNeeded ? (
        <HomeTroubleSheet
          onWeighedDifferent={weighingRowId !== null ? focusWeighedAmount : null}
          onBack={() => {
            troubleSuccessor.current = null;
            setTroubleOpen(false);
          }}
          returnFocus={() => troubleSuccessor.current?.() ?? null}
        />
      ) : null}
    </HomeProductionColumn>
  );
}
