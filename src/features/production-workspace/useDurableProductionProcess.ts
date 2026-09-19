/**
 * THE controller of a DURABLE batch process — Produkcja v3, Etap 2.
 *
 * `useLocalProductionProcess` already drives the one process presentation
 * (`process/ProductionProcess`) for a batch whose authority is the browser (HOME, no
 * server run yet). This is its twin for a batch whose authority is the SERVER: the PRO
 * run behind `useProductionWorkspace`, with the authorised Rescue gate
 * (`authorizeRescue` / `consumeRescue`) rather than the browser decision.
 *
 * Nothing here is a second production system, and that is the whole point of the file:
 *
 *  - ONE store — every write goes through `useProductionWorkspace`, which owns the
 *    canonical `productionSessionStore` session and its server reconciliation;
 *  - ONE run — the workspace resolves it by address (`activateSessionForAddress`), so
 *    „Partie" and the recipe's Produkcja tab show the SAME batch, never two;
 *  - ONE set of steps — `preparationPlanForSession`, exactly as the local controller and
 *    `ProductionCockpit` read it. This module adds no step, no order and no wording;
 *  - ONE Rescue — `rescueOptionStates` from the server authority, ranked by the shared
 *    `productionDecisionOptions`; no local `assessProductionRescue` on this path;
 *  - ONE batch target and ONE gram arithmetic — `session.plannedInput.target_batch_grams`
 *    and the recorded line grams are consumed as they are. Nothing is recalculated here.
 *
 * The presentation writes nothing itself: it reads a `ProductionProcessController` and
 * every action lands in the workspace.
 */
import { useCallback, useMemo, useState } from 'react';
import { preparationPlanForSession } from './preparationPlan';
import {
  pendingProductionTopUpTasks,
  productionProgress,
  type ProductionLineState,
  type ProductionTopUpTask,
} from './productionSession';
import { useProductionSessionStore } from './productionSessionStore';
import {
  productionDecisionExplanation,
  productionDecisionOptions,
  productionDecisionTitle,
  type ProductionDecisionId,
} from './productionDecisionOptions';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { productionProcessCopy as copy } from './process/productionProcessCopy';
import {
  latestConfirmedLine,
  productionProcessCurrentIndex,
  productionProcessSteps,
  type ProductionCorrectionOptionView,
  type ProductionProcessController,
  type ProductionProcessState,
  type ProductionProcessStep,
} from './process/productionProcessSteps';

const GRAMS_EPSILON = 0.000_001;

const scoreFromDisplay = (display: string | undefined): number | null => {
  const value = Number(display?.match(/^(\d{1,2})\/10$/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
};

/**
 * The controller for the durable run the workspace is already managing. Returns null
 * while there is no batch — an empty „Partie" never starts one.
 */
export function useDurableProductionProcess(
  production: ProductionWorkspaceView,
  {
    doneStepIds,
    onStepDone,
  }: {
    /** Steps without a production record the operator finished (kept by the host). */
    doneStepIds: readonly string[];
    onStepDone: (sessionId: string, stepId: string) => void;
  },
): ProductionProcessController | null {
  const [localError, setLocalError] = useState<string | null>(null);
  const session = production.session;
  const guide = production.machineGuide;

  // The same preparation plan the cockpit renders: order, instructions, the heat step,
  // the machine's own sequence and its registered illustration.
  const plan = useMemo(
    () => (session ? preparationPlanForSession(session, guide) : null),
    [guide, session],
  );
  const steps = useMemo(
    () =>
      plan === null || session === null
        ? []
        : productionProcessSteps(plan, {
            degassingTitle: session.degassingRequired ? copy.degasTitle : null,
          }),
    [plan, session],
  );

  const store = useCallback(() => useProductionSessionStore.getState(), []);
  const run = useCallback((action: () => void, fallback: string) => {
    setLocalError(null);
    try {
      action();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : fallback);
    }
  }, []);
  const runAsync = useCallback((action: () => Promise<void>, fallback: string) => {
    setLocalError(null);
    void action().catch((cause: unknown) => {
      setLocalError(cause instanceof Error ? cause.message : fallback);
    });
  }, []);

  if (session === null) return null;

  // A machine step exists: the Base stays in `base` until the operator finishes it.
  const holdBaseForMachine = steps.some((step) => step.kind === 'machine');
  /* The SERVER decision gate. `rescue.state === 'options'` is the workspace's own
     authorised verdict — this path never runs the browser assessment. */
  const decisionNeeded = production.deviationDecisionUnresolved;
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

  /* ---------- „Korekta partii" — the AUTHORISED options, ranked by the shared rule ---- */
  const correctionOptions: ProductionCorrectionOptionView[] = [];
  if (decisionNeeded) {
    for (const option of productionDecisionOptions({
      currentPlanMassG: productionProgress(session).currentPlanMassG,
      plannedScore: production.plannedScore?.score,
      forecastScore: production.score?.score,
    })) {
      const evaluation = production.rescueOptionStates?.[option.id];
      if (evaluation?.status !== 'available') continue;
      const preview = evaluation.authorization.preview;
      const score = scoreFromDisplay(preview.scoreDisplay);
      correctionOptions.push({
        id: option.id,
        title: productionDecisionTitle(option, preview.finalMassG),
        explanation: productionDecisionExplanation(option, production.plannedScore?.score, score),
        score,
        finalMassG: preview.finalMassG,
      });
    }
  }
  const selectedId = production.selectedRescueOptionId;
  const selectedView = correctionOptions.find((option) => option.id === selectedId) ?? null;
  /* An empty option list has three very different meanings, and the operator is holding a
     vessel while we decide which: the authority is still answering, it refused every
     option, or the request failed. Silence is the one answer that is never acceptable. */
  const evaluations = Object.values(production.rescueOptionStates ?? {});
  const unavailableReason =
    evaluations.find((evaluation) => evaluation?.status === 'unavailable') ?? null;
  const evaluationFailed = evaluations.some((evaluation) => evaluation?.status === 'error');
  const calculating = production.rescueOptionsCalculating === true;

  const reopenLine = (line: ProductionLineState) =>
    run(() => production.reopenRecord(line.lineId), copy.errors.reopen);

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
          pendingReason:
            correctionOptions.length === 0 && calculating ? copy.correctionCalculating : null,
          impossibleReason:
            correctionOptions.length > 0 || calculating
              ? null
              : unavailableReason?.status === 'unavailable'
                ? unavailableReason.reason
                : copy.correctionUnavailable,
          recommendedId: production.recommendedRescueOptionId,
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
    error: production.persistenceError ?? localError,
    confirmLine: (line) =>
      runAsync(async () => {
        await production.confirmLine(line.lineId);
        const confirmed = useProductionSessionStore.getState().session;
        if (!confirmed) return;
        // Only a Base confirmation reaches the machine hand-off; a topping never sends the
        // operator back to the machine step.
        const justCompletedBase =
          confirmed.lines.some((candidate) => candidate.lineId === line.lineId) &&
          confirmed.lines.every((candidate) => candidate.confirmed);
        // The shared confirmer opens `addons` as soon as BASE is complete. With a machine
        // step the process holds that existing stage until the operator finishes it.
        if (justCompletedBase && holdBaseForMachine && confirmed.stage === 'addons') {
          store().replaceSession({ ...confirmed, stage: 'base' });
        }
      }, copy.errors.confirm),
    setLineDraft: (line, grams) =>
      run(() => production.setDraftActual(line.lineId, grams), copy.errors.draft),
    reopenLine,
    setTopUpDraft: (task: ProductionTopUpTask, grams: number) =>
      run(() => production.setTopUpDraft(task.taskId, grams), copy.errors.draft),
    confirmTopUp: (task: ProductionTopUpTask) =>
      runAsync(() => production.confirmTopUpTask(task.taskId), copy.errors.topUp),
    finishStep: (step: ProductionProcessStep) => {
      if (step.kind === 'degas') {
        runAsync(() => production.acknowledgeDegassing(), copy.errors.step);
        return;
      }
      run(() => {
        const current = useProductionSessionStore.getState().session;
        if (!current) return;
        if (step.kind === 'machine') {
          // The operator does the machine step and moves on: a missing numeric time never
          // holds the flow, and the click claims no elapsed time.
          store().replaceSession({ ...current, stage: 'addons' });
        } else {
          onStepDone(current.sessionId, step.id);
        }
      }, copy.errors.step);
    },
    complete: () => runAsync(() => production.complete(), copy.errors.complete),
    selectDecision: (id: ProductionDecisionId) => production.selectRescueOption(id),
    applyDecision: () => runAsync(() => production.applySelectedRescueOption(), copy.errors.decision),
    backFromCorrection: () => {
      if (!deviatingLine) return null;
      reopenLine(deviatingLine);
      return deviatingLine.lineId;
    },
    // Asking again is only honest when the request itself failed; a refusal is an answer.
    retryDecision:
      evaluationFailed && production.retryRescueOptions
        ? () => production.retryRescueOptions?.()
        : null,
  };
}

/**
 * The ONE host of the durable process. Both „Partie" and the recipe's Produkcja tab mount
 * THIS component, so there is exactly one `useProductionWorkspace(true)` behind the
 * process wherever it is shown. They are different routes, so the two never mount at once.
 *
 * `empty` is what the host renders when there is no batch — mounting never starts one.
 */
