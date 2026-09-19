/**
 * The process CONTROLLER for a batch whose authority is the browser — a HOME batch started
 * from a draft (no durable server run yet). It drives the ONE batch process presentation
 * (`ProductionProcess`) through `ProductionProcessController`.
 *
 * Nothing here is a second production system: the batch is the canonical session in
 * `productionSessionStore` (`setDraftActual`, `confirmLine`, `reopenRecord`,
 * `replaceSession`), the steps are the ONE preparation plan, a deviation passes the SAME
 * decision gate as PRO (`browserProductionRescueDecision`) and is decided by the Rescue
 * authority (`assessProductionRescue` → `applyVerifiedRescueInput`) with the shared
 * „Korekta partii” words and recommendation (`productionDecisionOptions`), and the finish
 * is `completeProductionSession`. No gram is recalculated here.
 */
import { useMemo, useState } from 'react';
import { calculateRecipe } from '@/engine';
import type { MachineEducationGuide } from '@/features/education/machineEducation';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { preparationPlanForSession } from '../preparationPlan';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  completeProductionSession,
  confirmProductionTopUpTask,
  pendingProductionTopUpTasks,
  productionProgress,
  setProductionTopUpDraftGrams,
  type ProductionLineState,
  type ProductionSession,
  type ProductionTopUpTask,
} from '../productionSession';
import { assessProductionRescue } from '../productionRescue';
import { useProductionSessionStore } from '../productionSessionStore';
import { browserProductionRescueDecision } from '../useProductionWorkspace';
import {
  productionDecisionExplanation,
  productionDecisionOptions,
  productionDecisionTitle,
  recommendedProductionDecision,
  type ProductionDecisionId,
} from '../productionDecisionOptions';
import { productionProcessCopy as copy } from './productionProcessCopy';
import {
  latestConfirmedLine,
  productionProcessCurrentIndex,
  productionProcessSteps,
  type ProductionCorrectionOptionView,
  type ProductionProcessController,
  type ProductionProcessState,
  type ProductionProcessStep,
} from './productionProcessSteps';

const GRAMS_EPSILON = 0.000_001;

const scoreFromDisplay = (display: string | undefined): number | null => {
  const value = Number(display?.match(/^(\d{1,2})\/10$/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
};

export function useLocalProductionProcess({
  session,
  guide,
  doneStepIds,
  onStepDone,
  operatorUserId,
}: {
  session: ProductionSession;
  /** The machine's guide; null when the batch has no machine hand-off (Professional). */
  guide: MachineEducationGuide | null;
  /** Steps without a production record the operator finished (kept by the host). */
  doneStepIds: readonly string[];
  onStepDone: (sessionId: string, stepId: string) => void;
  operatorUserId: string | null;
}): ProductionProcessController {
  const [error, setError] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<{
    basis: string;
    id: ProductionDecisionId;
  } | null>(null);

  // The same preparation plan PRO Production renders: order, instructions, the heat step,
  // the machine's own sequence and its registered illustration.
  const plan = useMemo(() => preparationPlanForSession(session, guide), [guide, session]);
  const steps = useMemo(
    () =>
      productionProcessSteps(plan, {
        degassingTitle: session.degassingRequired ? copy.degasTitle : null,
      }),
    [plan, session.degassingRequired],
  );
  // A machine step exists: the Base stays in `base` until the operator finishes it.
  const holdBaseForMachine = steps.some((step) => step.kind === 'machine');
  // The SAME decision gate as PRO Production: a confirmed Base line away from its current
  // target (and not waiting for an authorised top-up) needs a „Korekta partii” decision.
  const decisionGate = useMemo(() => browserProductionRescueDecision(session), [session]);
  const assessment = useMemo(
    () => (decisionGate.state === 'options' ? assessProductionRescue(session) : null),
    [decisionGate.state, session],
  );
  const decisionNeeded = assessment !== null && assessment.state !== 'not_needed';
  // The run's frozen plan: later confirmations never change it, so its Score is read once.
  const frozenPlannedInput = session.plannedInput;
  const plannedScore = useMemo(
    () => monitorScoreView(calculateRecipe(frozenPlannedInput), frozenPlannedInput).match.score,
    [frozenPlannedInput],
  );

  const pendingTopUps = pendingProductionTopUpTasks(session);
  const pendingTopUpLineIds = new Set(pendingTopUps.map((task) => task.sourceRecipeLineId));
  const deviatingLine = latestConfirmedLine(
    session.lines.filter(
      (line) =>
        line.confirmed &&
        !pendingTopUpLineIds.has(line.lineId) &&
        Math.abs(line.physicalAddedGrams - line.targetGrams) > GRAMS_EPSILON,
    ),
  );
  const lastConfirmedBase = latestConfirmedLine(session.lines);
  const state: ProductionProcessState = {
    confirmedLineIds: new Set(
      [...session.lines, ...session.addonLines]
        .filter((line) => line.confirmed)
        .map((line) => line.lineId),
    ),
    holdLineId:
      decisionNeeded || pendingTopUps.length > 0 ? (lastConfirmedBase?.lineId ?? null) : null,
    degassingDone: !session.degassingRequired || session.degassingAcknowledged,
    machineDone: session.stage === 'addons',
    doneStepIds: new Set(doneStepIds),
  };
  const firstUndone = productionProcessCurrentIndex(steps, state);
  const allDone = steps.length > 0 && firstUndone >= steps.length;
  const currentIndex = Math.min(firstUndone, Math.max(steps.length - 1, 0));

  /* ---------- „Korekta partii” ---------- */
  const decisionBasis = `${session.sessionId}:${session.durableActualRevision}:${session.durableRescueRevision}`;
  const correctionOptions: ProductionCorrectionOptionView[] = [];
  let recommendedId: ProductionDecisionId | null = null;
  if (assessment && decisionNeeded) {
    const byId = new Map(assessment.options.map((option) => [option.id, option] as const));
    for (const option of productionDecisionOptions({
      currentPlanMassG: productionProgress(session).currentPlanMassG,
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

  const now = () => new Date().toISOString();
  const run = (action: () => void, fallback: string) => {
    setError(null);
    try {
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    }
  };
  const store = () => useProductionSessionStore.getState();
  const current = () => useProductionSessionStore.getState().session;

  const reopenLine = (line: ProductionLineState) =>
    run(() => store().reopenRecord(line.lineId), copy.errors.reopen);

  return {
    session,
    steps,
    state,
    currentIndex,
    allDone,
    pendingTopUps,
    correction: decisionNeeded
      ? {
          what: deviatingLine
            ? {
                name: deviatingLine.name,
                actualG: deviatingLine.physicalAddedGrams,
                planG: deviatingLine.targetGrams,
              }
            : null,
          options: correctionOptions,
          impossibleReason: assessment?.state === 'impossible' ? assessment.reason : null,
          recommendedId,
          selectedId,
          applyLabel:
            selectedView?.id === 'restore_original_recipe'
              ? copy.correctionRestoreApply
              : selectedView?.id === 'leave_as_is'
                ? copy.correctionLeaveApply
                : (selectedView?.title ?? copy.correctionTitle),
        }
      : null,
    canReopen: !decisionNeeded && pendingTopUps.length === 0,
    error,
    confirmLine: (line) =>
      run(() => {
        store().confirmLine(line.lineId, now());
        const confirmed = current();
        if (!confirmed) return;
        // Only a Base confirmation reaches the machine hand-off; a topping never sends the
        // operator back to the machine step.
        const justCompletedBase =
          confirmed.lines.some((candidate) => candidate.lineId === line.lineId) &&
          confirmed.lines.every((candidate) => candidate.confirmed);
        store().replaceSession({
          ...confirmed,
          // The shared confirmer opens `addons` as soon as BASE is complete. With a machine
          // step the process holds that existing stage until the operator finishes it.
          stage: justCompletedBase && holdBaseForMachine ? 'base' : confirmed.stage,
          durableActualRevision: confirmed.durableActualRevision + 1,
        });
      }, copy.errors.confirm),
    setLineDraft: (line, grams) =>
      run(() => store().setDraftActual(line.lineId, grams), copy.errors.draft),
    reopenLine,
    setTopUpDraft: (task: ProductionTopUpTask, grams: number) =>
      run(() => {
        const session = current();
        if (session) {
          store().replaceSession(setProductionTopUpDraftGrams(session, task.taskId, grams));
        }
      }, copy.errors.draft),
    confirmTopUp: (task: ProductionTopUpTask) =>
      run(() => {
        const session = current();
        if (session) {
          store().replaceSession(confirmProductionTopUpTask(session, task.taskId, now()));
        }
      }, copy.errors.topUp),
    finishStep: (step: ProductionProcessStep) =>
      run(() => {
        const session = current();
        if (!session) return;
        if (step.kind === 'degas') {
          store().replaceSession({
            ...session,
            degassingAcknowledged: true,
            degassingAcknowledgedAt: now(),
          });
        } else if (step.kind === 'machine') {
          // The operator does the machine step and moves on: a missing numeric time never
          // holds the flow, and the click claims no elapsed time.
          store().replaceSession({ ...session, stage: 'addons' });
        } else {
          onStepDone(session.sessionId, step.id);
        }
      }, copy.errors.step),
    complete: () =>
      run(() => {
        const session = current();
        if (!session) return;
        store().replaceSession(
          completeProductionSession(
            session,
            calculateRecipe(buildFinalActualInput(session)),
            now(),
            operatorUserId,
          ),
        );
      }, copy.errors.complete),
    selectDecision: (id) => setSelectedDecision({ basis: decisionBasis, id }),
    applyDecision: () =>
      run(() => {
        const session = current();
        const option = assessment?.options.find((candidate) => candidate.id === selectedId);
        if (!session || !option) return;
        const next = applyVerifiedRescueInput(session, option.candidateInput);
        store().replaceSession({
          ...next,
          lastDeviationDecision: {
            strategy: option.id,
            acceptedAt: now(),
            sourceActualRevision: session.durableActualRevision,
            rescueRevision: next.durableRescueRevision,
            finalMassG: option.finalMassG,
            scoreDisplay: option.scoreDisplay,
          },
        });
      }, copy.errors.decision),
    backFromCorrection: () => {
      if (!deviatingLine) return null;
      reopenLine(deviatingLine);
      return deviatingLine.lineId;
    },
  };
}
