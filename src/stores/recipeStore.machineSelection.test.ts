/**
 * S4 — recipeStore.setMachineSelection (per-recipe machine/serving context).
 *
 * The machine selection lives in the recipe working state: it sets the routing temperature (an
 * EXISTING supported cell — never a new Engine value), the context fields the workbar reads, and
 * an optional derived batch. `resetToDemo` (the account-boundary reset) clears it — the mechanism
 * that keeps a Pro session from inheriting a previous account's machine.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from './recipeStore';

const reset = () => useRecipeStore.getState().resetToDemo();

describe('recipeStore.setMachineSelection (S4)', () => {
  beforeEach(reset);

  it('professional + Świeże routes to −11 and records the context (marks dirty)', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -11,
    });
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBe('professional');
    expect(s.servingModeId).toBe('fresh');
    expect(s.machineId).toBeNull();
    expect(s.machineLabel).toBe('Maszyna profesjonalna');
    expect(s.target_temperature_c).toBe(-11);
    expect(s.dirty).toBe(true);
  });

  it('professional −12 / −13 set the exact existing temperature cell', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional', servingModeId: 'temp_minus_12', machineId: null, label: 'x', temperatureC: -12,
    });
    expect(useRecipeStore.getState().target_temperature_c).toBe(-12);
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional', servingModeId: 'temp_minus_13', machineId: null, label: 'x', temperatureC: -13,
    });
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
  });

  it('a professional selection without a batch leaves the current batch untouched', () => {
    const before = useRecipeStore.getState().target_batch_grams;
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional', servingModeId: 'fresh', machineId: null, label: 'x', temperatureC: -11,
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(before);
  });

  it('a home selection records the machine id/label + auto-batch + routing temperature', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'home',
      servingModeId: 'ninja_gelato',
      machineId: 'ninja-creami-nc302eu-eu-es',
      label: 'Ninja CREAMi',
      temperatureC: -13,
      batchGrams: 450,
    });
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBe('home');
    expect(s.machineId).toBe('ninja-creami-nc302eu-eu-es');
    expect(s.machineLabel).toBe('Ninja CREAMi');
    expect(s.target_temperature_c).toBe(-13);
    expect(s.target_batch_grams).toBe(450);
    expect(s.dirty).toBe(true);
  });

  it('a home selection with a null auto-batch keeps the current batch (never invents one)', () => {
    useRecipeStore.getState().setBatchGrams(800);
    useRecipeStore.getState().setMachineSelection({
      kind: 'home', servingModeId: 'fresh', machineId: 'moulinex-freezi-mj803af0-es', label: 'Moulinex Freezi', temperatureC: -11, batchGrams: null,
    });
    expect(useRecipeStore.getState().target_batch_grams).toBe(800);
  });

  it('resetToDemo clears the machine context (cross-account isolation)', () => {
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional', servingModeId: 'fresh', machineId: null, label: 'x', temperatureC: -11,
    });
    useRecipeStore.getState().resetToDemo();
    const s = useRecipeStore.getState();
    expect(s.machineKind).toBeNull();
    expect(s.servingModeId).toBeNull();
    expect(s.machineId).toBeNull();
    expect(s.machineLabel).toBeNull();
  });
});
