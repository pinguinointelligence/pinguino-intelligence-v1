/**
 * DESIGN V3.0 IV D–I — HOME's numbered production steps are a presentation of the ONE
 * preparation plan: the plan's order and words, consecutive weighing lines as one step,
 * and the current step read from the canonical Production session.
 */
import { describe, expect, it } from 'vitest';
import { educationCopy } from '@/copy/education.pl';
import type {
  PreparationPlan,
  PreparationStep,
} from '@/features/production-workspace/preparationPlan';
import {
  homeCurrentStepIndex,
  homeProcessStepDone,
  homeProcessSteps,
  type HomeProcessState,
} from './homeProductionSteps';

const line = (
  lineId: string,
  scope: 'base' | 'addon',
  afterCooling = false,
): Extract<PreparationStep, { kind: 'line' }> => ({
  kind: 'line',
  id: `line:${lineId}`,
  scope,
  lineId,
  name: lineId.toUpperCase(),
  grams: 100,
  done: false,
  process: 'unknown',
  instruction: scope === 'addon' ? 'Dodaj po obróbce' : 'Dodaj do naczynia',
  note: null,
  moved: false,
  afterCooling,
  sourceIds: [],
});

const plan: PreparationPlan = {
  baseLineOrder: ['milk', 'tara', 'fruit'],
  steps: [
    {
      kind: 'machine_before',
      id: 'machine:before',
      title: 'Zanim zaczniesz',
      details: ['Zamroź misę'],
      timing: 'Wymagane wstępne mrożenie: minimum 12 h',
      sourceIds: [],
    },
    line('milk', 'base'),
    line('tara', 'base'),
    {
      kind: 'heat',
      id: 'heat',
      title: 'Obróbka na ciepło',
      productNames: ['TARA'],
      heatLineIds: ['tara'],
      precedingLineIds: ['milk', 'tara'],
      details: ['Sposób…', 'Następnie schłódź.'],
      sourceIds: [],
    },
    line('fruit', 'base', true),
    {
      kind: 'machine',
      id: 'machine:run',
      title: 'Maszyna z mrożoną misą',
      details: ['Wlej mieszankę', 'Uruchom'],
      timing: null,
      sourceMachineId: 'bowl',
      illustration: null,
      sourceIds: [],
    },
    line('topping', 'addon'),
  ],
};

const state = (patch: Partial<HomeProcessState> = {}): HomeProcessState => ({
  confirmedLineIds: new Set(),
  holdLineId: null,
  degassingDone: true,
  machineDone: false,
  doneStepIds: new Set(),
  ...patch,
});

describe('homeProcessSteps', () => {
  it('keeps the plan order and words; consecutive lines are one weighing step', () => {
    const steps = homeProcessSteps(plan, { degassingTitle: null });
    expect(steps.map((step) => `${step.kind}:${step.title}`)).toEqual([
      'before:Zanim zaczniesz',
      `weigh:${educationCopy.preparation.baseTitle}`,
      'heat:Obróbka na ciepło',
      `weigh:${educationCopy.preparation.heat.afterCoolingTitle}`,
      'machine:Maszyna z mrożoną misą',
      `weigh:${educationCopy.preparation.addonsTitle}`,
    ]);
    const [, base, heat, cold, machine, addon] = steps;
    expect(base?.kind === 'weigh' && base.lines.map((entry) => entry.lineId)).toEqual([
      'milk',
      'tara',
    ]);
    expect(heat?.kind === 'heat' && heat.afterCoolingNames).toEqual(['FRUIT']);
    expect(cold?.kind === 'weigh' && cold.scope).toBe('base');
    expect(machine?.kind === 'machine' && machine.asideNames).toEqual(['TOPPING']);
    expect(addon?.kind === 'weigh' && addon.scope).toBe('addon');
  });

  it('puts the existing degassing confirmation before the first weighing', () => {
    const steps = homeProcessSteps(plan, { degassingTitle: 'Najpierw odgazuj' });
    expect(steps.map((step) => step.kind).slice(0, 3)).toEqual(['before', 'degas', 'weigh']);
  });
});

describe('the current step', () => {
  const steps = homeProcessSteps(plan, { degassingTitle: null });

  it('starts at the machine preparation and moves on with „Gotowe” or the first weighing', () => {
    expect(homeCurrentStepIndex(steps, state())).toBe(0);
    expect(homeCurrentStepIndex(steps, state({ doneStepIds: new Set(['machine:before']) }))).toBe(
      1,
    );
    // A batch whose weighing began is past its machine preparation.
    expect(homeCurrentStepIndex(steps, state({ confirmedLineIds: new Set(['milk']) }))).toBe(1);
  });

  it('reaches the heat step once its lines are confirmed, and holds a step while a correction waits', () => {
    const weighed = new Set(['milk', 'tara']);
    expect(homeCurrentStepIndex(steps, state({ confirmedLineIds: weighed }))).toBe(2);
    expect(
      homeCurrentStepIndex(steps, state({ confirmedLineIds: weighed, holdLineId: 'tara' })),
    ).toBe(1);
  });

  it('opens the topping only after the machine hand-off, and ends past the last step', () => {
    const base = new Set(['milk', 'tara', 'fruit']);
    expect(homeCurrentStepIndex(steps, state({ confirmedLineIds: base }))).toBe(4);
    expect(homeCurrentStepIndex(steps, state({ confirmedLineIds: base, machineDone: true }))).toBe(
      5,
    );
    expect(
      homeCurrentStepIndex(
        steps,
        state({ confirmedLineIds: new Set([...base, 'topping']), machineDone: true }),
      ),
    ).toBe(steps.length);
    expect(homeProcessStepDone(steps, 2, state({ machineDone: true }))).toBe(true);
  });
});
