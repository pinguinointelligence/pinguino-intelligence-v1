/**
 * DESIGN V3.0 IV D–I — the batch process's numbered steps (HOME now, Produkcja later) are a
 * presentation of the ONE preparation plan: the plan's order and words, consecutive weighing
 * lines as one step, and the current step read from the canonical Production session.
 */
import { describe, expect, it } from 'vitest';
import { educationCopy } from '@/copy/education.pl';
import type { PreparationPlan, PreparationStep } from '../preparationPlan';
import {
  productionProcessCurrentIndex,
  productionProcessStepDone,
  productionProcessSteps,
  type ProductionProcessState,
} from './productionProcessSteps';

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
  illustration: null,
  illustrationStatus: 'asset_needed' as const,
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
      illustration: null,
      illustrationStatus: 'asset_needed' as const,
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
      illustrationStatus: 'asset_needed' as const,
      illustration: null,
      sourceIds: [],
    },
    line('topping', 'addon'),
  ],
};

const state = (patch: Partial<ProductionProcessState> = {}): ProductionProcessState => ({
  confirmedLineIds: new Set(),
  holdLineId: null,
  degassingDone: true,
  machineDone: false,
  doneStepIds: new Set(),
  ...patch,
});

describe('productionProcessSteps', () => {
  it('keeps the plan order and words; consecutive lines are one weighing step', () => {
    const steps = productionProcessSteps(plan, { degassingTitle: null });
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
    const steps = productionProcessSteps(plan, { degassingTitle: 'Najpierw odgazuj' });
    expect(steps.map((step) => step.kind).slice(0, 3)).toEqual(['before', 'degas', 'weigh']);
  });
});

describe('the current step', () => {
  const steps = productionProcessSteps(plan, { degassingTitle: null });

  it('starts at the machine preparation and moves on with „Gotowe” or the first weighing', () => {
    expect(productionProcessCurrentIndex(steps, state())).toBe(0);
    expect(
      productionProcessCurrentIndex(steps, state({ doneStepIds: new Set(['machine:before']) })),
    ).toBe(1);
    // A batch whose weighing began is past its machine preparation.
    expect(
      productionProcessCurrentIndex(steps, state({ confirmedLineIds: new Set(['milk']) })),
    ).toBe(1);
  });

  it('reaches the heat step once its lines are confirmed, and holds a step while a correction waits', () => {
    const weighed = new Set(['milk', 'tara']);
    expect(productionProcessCurrentIndex(steps, state({ confirmedLineIds: weighed }))).toBe(2);
    expect(
      productionProcessCurrentIndex(
        steps,
        state({ confirmedLineIds: weighed, holdLineId: 'tara' }),
      ),
    ).toBe(1);
  });

  it('opens the topping only after the machine hand-off, and ends past the last step', () => {
    const base = new Set(['milk', 'tara', 'fruit']);
    expect(productionProcessCurrentIndex(steps, state({ confirmedLineIds: base }))).toBe(4);
    expect(
      productionProcessCurrentIndex(steps, state({ confirmedLineIds: base, machineDone: true })),
    ).toBe(5);
    expect(
      productionProcessCurrentIndex(
        steps,
        state({ confirmedLineIds: new Set([...base, 'topping']), machineDone: true }),
      ),
    ).toBe(steps.length);
    expect(productionProcessStepDone(steps, 2, state({ machineDone: true }))).toBe(true);
  });
});
