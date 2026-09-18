/**
 * DESIGN V3.0 IV D–I — HOME production as numbered steps („Produkcja · krok X z N”).
 *
 * PURE. The steps are a presentation of the ONE preparation plan
 * (`preparationPlanForSession`) that PRO Production renders too: its order, titles,
 * instructions, heat step, machine sequence and illustrations. This module only groups
 * the plan's consecutive weighing lines into one step and decides which step is the
 * current one from the canonical Production session. It adds no process wording, no
 * temperature, no time and no illustration of its own — the step texts and pictures of
 * the design preview were a layout demonstration only (Produkcja v3, Etap 2).
 */
import { educationCopy } from '@/copy/education.pl';
import type { PreparationIllustration } from '@/features/education/preparationIllustrations';
import type {
  PreparationPlan,
  PreparationStep,
} from '@/features/production-workspace/preparationPlan';

export type PreparationLineStep = Extract<PreparationStep, { kind: 'line' }>;

export type HomeProcessStep =
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
 * The plan's steps as HOME shows them. Consecutive Base lines become one weighing step
 * (before the heat step: „Baza”; after it: „Po schłodzeniu”); the toppings become one
 * weighing step after the machine. A carbonated product adds the existing degassing
 * confirmation before the first weighing.
 */
export function homeProcessSteps(
  plan: PreparationPlan,
  options: { degassingTitle: string | null },
): HomeProcessStep[] {
  const steps: HomeProcessStep[] = [];
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

/** What the canonical Production session (and the customer's „Gotowe”) already did. */
export interface HomeProcessState {
  /** Base and topping line ids whose physical addition is confirmed. */
  confirmedLineIds: ReadonlySet<string>;
  /**
   * While a „Korekta partii” decision or an authorised top-up still waits, the step of
   * the last confirmed Base line stays the current one (its line id), so the customer is
   * never moved past the moment the deviation was found.
   */
  holdLineId: string | null;
  degassingDone: boolean;
  /** The machine hand-off is done: the session opened the topping stage. */
  machineDone: boolean;
  /** Steps without a production record that the customer finished with „Gotowe”. */
  doneStepIds: ReadonlySet<string>;
}

export function homeProcessStepDone(
  steps: readonly HomeProcessStep[],
  index: number,
  state: HomeProcessState,
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
export function homeCurrentStepIndex(
  steps: readonly HomeProcessStep[],
  state: HomeProcessState,
): number {
  const index = steps.findIndex((_, candidate) => !homeProcessStepDone(steps, candidate, state));
  return index < 0 ? steps.length : index;
}

/** Grams as Production records them: whole, or up to three decimals, never trailing zeros. */
export const formatProductionGrams = (value: number): string =>
  `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '')} g`;
