import { describe, expect, it } from 'vitest';
import { MACHINE_CATALOG } from '@/features/machine-catalog';
import { buildHomeMachineView, homeSelectableMachines } from './homeMachinePresentation';

describe('§43 — the HOME chooser never offers Professional', () => {
  const offered = homeSelectableMachines(MACHINE_CATALOG);

  it('offers real Home machines', () => {
    expect(offered.length).toBeGreaterThan(0);
  });

  it('offers no professional machine, by technology or by name', () => {
    for (const machine of offered) {
      expect(machine.technology).not.toBe('continuous_soft_serve');
      expect((machine.displayName ?? '').toLowerCase()).not.toContain('professional');
    }
  });
});

describe('§16 — a Professional recipe viewed in HOME is left alone', () => {
  const view = buildHomeMachineView({
    machineKind: 'professional',
    machineLabel: 'Maszyna profesjonalna',
    targetBatchGrams: 1000,
    recommendedBatchGrams: null,
    containers: 1,
  });

  it('keeps Professional and shows no warning', () => {
    expect(view.isProfessional).toBe(true);
    expect(view.warning).toBeNull();
  });

  it('shows a plain amount with no container wording', () => {
    expect(view.amount).toEqual({ kind: 'plain_amount', totalGrams: 1000 });
  });

  it('does not force a Home machine choice', () => {
    expect(view.needsMachineChoice).toBe(false);
  });
});

describe('§42 — a saved Home machine is used automatically', () => {
  it('asks for no machine when one is already configured', () => {
    const view = buildHomeMachineView({
      machineKind: 'home',
      machineLabel: 'Ninja CREAMi Deluxe',
      targetBatchGrams: 1200,
      recommendedBatchGrams: 600,
      containers: 2,
    });
    expect(view.needsMachineChoice).toBe(false);
    expect(view.amount).toEqual({ kind: 'containers', containers: 2, totalGrams: 1200 });
  });

  it('asks only when no machine is configured at all', () => {
    const view = buildHomeMachineView({
      machineKind: null,
      machineLabel: null,
      targetBatchGrams: 1000,
      recommendedBatchGrams: null,
      containers: 1,
    });
    expect(view.needsMachineChoice).toBe(true);
  });

  it('falls back to a plain amount when the machine has no per-container authority', () => {
    const view = buildHomeMachineView({
      machineKind: 'home',
      machineLabel: 'Inna maszyna',
      targetBatchGrams: 900,
      recommendedBatchGrams: null,
      containers: 1,
    });
    expect(view.amount).toEqual({ kind: 'plain_amount', totalGrams: 900 });
  });
});
