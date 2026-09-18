/**
 * THE batch process as numbered steps („Produkcja · krok X z N”) — DESIGN V3.0 IV D–I,
 * §13–14. ONE presentation of a running Production batch, shared by HOME production now
 * and by the Produkcja area („Partie”, Etap 2) / PRO later.
 *
 * PURE. The steps are a presentation of the ONE preparation plan
 * (`preparationPlanForSession`) that PRO Production renders too: its order, titles,
 * instructions, heat step, machine sequence and illustrations. This module only groups
 * the plan's consecutive weighing lines into one step and decides which step is the
 * current one from the canonical Production session. It adds no process wording, no
 * temperature, no time and no illustration of its own — the step texts and pictures of
 * the design preview were a layout demonstration only (Produkcja v3, Etap 2) — and it
 * never recalculates a gram: Production consumes the final recipe's grams as they are.
 */
import { educationCopy } from '@/copy/education.pl';
import type { PreparationIllustration } from '@/features/education/preparationIllustrations';
import type { PreparationPlan, PreparationStep } from '../preparationPlan';
import type {
  ProductionLineState,
  ProductionSession,
  ProductionTopUpTask,
} from '../productionSession';
import type { ProductionDecisionId } from '../productionDecisionOptions';

export type PreparationLineStep = Extract<PreparationStep, { kind: 'line' }>;

export type ProductionProcessStep =
  | {
      kind: 'before';
      id: 'machine:before';
      title: string;
      details: readonly string[];
      timing: string;
    }
  | { kind: 'degas'; id: 'degas'; title: string }
  | {
      kind: 'weigh';
      id: string;
      scope: 'base' | 'addon';
      title: string;
      lines: readonly PreparationLineStep[];
    }
  | {
      kind: 'heat';
      id: 'heat';
      title: string;
      productNames: readonly string[];
      details: readonly string[];
      /** Lines the plan adds after the heat step and its cooling. */
      afterCoolingNames: readonly string[];
    }
  | {
      kind: 'machine';
      id: 'machine:run';
      title: string;
      details: readonly string[];
      timing: string | null;
      illustration: PreparationIllustration | null;
      /** Toppings waiting for the moment after the machine. */
      asideNames: readonly string[];
    };

const copy = educationCopy.preparation;

/**
 * The plan's steps as the process shows them. Consecutive Base lines become one weighing
 * step (before the heat step: „Baza”; after it: „Po schłodzeniu”); the toppings become
 * one weighing step after the machine. A carbonated product adds the existing degassing
 * confirmation before the first weighing.
 */
export function productionProcessSteps(
  plan: PreparationPlan,
  options: { degassingTitle: string | null },
): ProductionProcessStep[] {
  const steps: ProductionProcessStep[] = [];
  const addonNames = plan.steps
    .filter((step): step is PreparationLineStep => step.kind === 'line' && step.scope === 'addon')
    .map((step) => step.name);
  let heatSeen = false;
  let degasPlaced = options.degassingTitle === null;
  const placeDegas = () => {
    if (degasPlaced || options.degassingTitle === null) return;
    steps.push({ kind: 'degas', id: 'degas', title: options.degassingTitle });
    degasPlaced = true;
  };

  for (const step of plan.steps) {
    if (step.kind === 'machine_before') {
      steps.push({
        kind: 'before',
        id: step.id,
        title: step.title,
        details: step.details,
        timing: step.timing,
      });
      continue;
    }
    if (step.kind === 'line') {
      if (step.scope === 'base') placeDegas();
      const previous = steps.at(-1);
      if (previous?.kind === 'weigh' && previous.scope === step.scope) {
        steps[steps.length - 1] = { ...previous, lines: [...previous.lines, step] };
        continue;
      }
      steps.push({
        kind: 'weigh',
        id: `weigh:${step.scope}:${step.lineId}`,
        scope: step.scope,
        title:
          step.scope === 'addon'
            ? copy.addonsTitle
            : heatSeen
              ? copy.heat.afterCoolingTitle
              : copy.baseTitle,
        lines: [step],
      });
      continue;
    }
    if (step.kind === 'heat') {
      heatSeen = true;
      steps.push({
        kind: 'heat',
        id: 'heat',
        title: step.title,
        productNames: step.productNames,
        details: step.details,
        afterCoolingNames: plan.steps
          .filter(
            (candidate): candidate is PreparationLineStep =>
              candidate.kind === 'line' && candidate.afterCooling,
          )
          .map((candidate) => candidate.name),
      });
      continue;
    }
    placeDegas();
    steps.push({
      kind: 'machine',
      id: step.id,
      title: step.title,
      details: step.details,
      timing: step.timing,
      illustration: step.illustration,
      asideNames: addonNames,
    });
  }
  placeDegas();
  return steps;
}

/** What the canonical Production session (and the operator's „Gotowe”) already did. */
export interface ProductionProcessState {
  /** Base and topping line ids whose physical addition is confirmed. */
  confirmedLineIds: ReadonlySet<string>;
  /**
   * While a „Korekta partii” decision or an authorised top-up still waits, the step of
   * the last confirmed Base line stays the current one (its line id), so the operator is
   * never moved past the moment the deviation was found.
   */
  holdLineId: string | null;
  degassingDone: boolean;
  /** The machine hand-off is done: the session opened the topping stage. */
  machineDone: boolean;
  /** Steps without a production record that the operator finished with „Gotowe”. */
  doneStepIds: ReadonlySet<string>;
}

export function productionProcessStepDone(
  steps: readonly ProductionProcessStep[],
  index: number,
  state: ProductionProcessState,
): boolean {
  const step = steps[index]!;
  const laterLineConfirmed = steps
    .slice(index + 1)
    .some(
      (later) =>
        later.kind === 'weigh' &&
        later.lines.some((line) => state.confirmedLineIds.has(line.lineId)),
    );
  switch (step.kind) {
    case 'before':
      // A batch whose weighing already began is past its machine preparation.
      return state.doneStepIds.has(step.id) || laterLineConfirmed;
    case 'degas':
      return state.degassingDone;
    case 'weigh':
      return (
        step.lines.every((line) => state.confirmedLineIds.has(line.lineId)) &&
        !step.lines.some((line) => line.lineId === state.holdLineId)
      );
    case 'heat':
      return state.doneStepIds.has(step.id) || laterLineConfirmed || state.machineDone;
    case 'machine':
      return state.machineDone;
  }
}

/** The first step not done yet; `steps.length` once every step is done. */
export function productionProcessCurrentIndex(
  steps: readonly ProductionProcessStep[],
  state: ProductionProcessState,
): number {
  const index = steps.findIndex(
    (_, candidate) => !productionProcessStepDone(steps, candidate, state),
  );
  return index < 0 ? steps.length : index;
}

/** The latest line (by confirmation order) among the given ones. */
export const latestConfirmedLine = (
  lines: readonly ProductionLineState[],
): ProductionLineState | null =>
  lines
    .filter((line) => line.confirmationOrder !== null)
    .reduce<ProductionLineState | null>(
      (latest, line) =>
        latest === null || (line.confirmationOrder ?? 0) > (latest.confirmationOrder ?? 0)
          ? line
          : latest,
      null,
    );

/** Grams as Production records them: whole, or up to three decimals, never trailing zeros. */
export const formatProductionGrams = (value: number): string =>
  `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '')} g`;

/** One „Korekta partii” option as the process shows it (verified by the Rescue authority). */
export interface ProductionCorrectionOptionView {
  id: ProductionDecisionId;
  title: string;
  explanation: string;
  /** 1–10, or null when the authority gave none. */
  score: number | null;
  finalMassG: number;
}

/** „Korekta partii” while a confirmed deviation waits for its decision. */
export interface ProductionCorrectionView {
  what: { name: string; actualG: number; planG: number } | null;
  options: readonly ProductionCorrectionOptionView[];
  impossibleReason: string | null;
  recommendedId: ProductionDecisionId | null;
  selectedId: ProductionDecisionId | null;
  applyLabel: string;
}

/**
 * The contract between a process CONTROLLER (who owns the batch's authority — the
 * browser-authority controller for HOME today, the durable Produkcja/PRO host in Etap 2)
 * and the ONE process presentation (`ProductionProcess`). The presentation never writes
 * the session itself; every action goes through here.
 */
export interface ProductionProcessController {
  session: ProductionSession;
  steps: readonly ProductionProcessStep[];
  state: ProductionProcessState;
  /** The step shown as current (the last one once everything is done). */
  currentIndex: number;
  allDone: boolean;
  pendingTopUps: readonly ProductionTopUpTask[];
  /** Null unless a decision is required right now. */
  correction: ProductionCorrectionView | null;
  /** A confirmed line may be reopened to correct its record (no decision or top-up waits). */
  canReopen: boolean;
  error: string | null;
  confirmLine: (line: ProductionLineState) => void;
  setLineDraft: (line: ProductionLineState, grams: number) => void;
  reopenLine: (line: ProductionLineState) => void;
  setTopUpDraft: (task: ProductionTopUpTask, grams: number) => void;
  confirmTopUp: (task: ProductionTopUpTask) => void;
  /** „Gotowe” on a step with no weighing of its own. */
  finishStep: (step: ProductionProcessStep) => void;
  complete: () => void;
  selectDecision: (id: ProductionDecisionId) => void;
  applyDecision: () => void;
  /** „Wróć” from „Korekta partii”: reopens the deviating line; returns its id. */
  backFromCorrection: () => string | null;
}
