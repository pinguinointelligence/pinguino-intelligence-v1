/**
 * PRO TEMPERATURE CONTRACT (owner P0): the visible selection, RecipeInput, target-band cell,
 * Engine calculation, Monitor input, solver input and the surface header all agree — one shared
 * route from the recipe store, with NO hardcoded engine label anywhere.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, selectTargetBand, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from './buildRecipeInput';
import { engineRouteLabel } from './engineRouteLabel';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const items = () => [
  {
    id: 'l-milk',
    ingredient: findDemoIngredient('milk_3_5')!,
    planned_grams: 700,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  },
  {
    id: 'l-suc',
    ingredient: findDemoIngredient('sucrose')!,
    planned_grams: 150,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  },
];

const storeState = (temp: number) => ({
  mode: 'classic' as const,
  category: 'milk_gelato' as const,
  target_temperature_c: temp,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced' as const,
  cost_priority: 'balanced' as const,
  items: items(),
});

describe.each([-11, -12, -13])('temperature %d — one shared route', (temp) => {
  it('store → RecipeInput passthrough (the seam adds nothing, changes nothing)', () => {
    expect(buildRecipeInput(storeState(temp)).target_temperature_c).toBe(temp);
  });

  it('target-band selection resolves THIS temperature cell (no silent −11 fallback)', () => {
    const cell = selectTargetBand('milk_gelato', temp);
    expect(cell).not.toBeNull();
    expect(cell?.temperature_fallback).toBe(false);
  });

  it('the Engine calculates on this exact temperature cell (indicator bands match, no fallback)', () => {
    const input: RecipeInput = buildRecipeInput(storeState(temp));
    const result = calculateRecipe(input);
    const npac = result.indicators.find((i) => i.key === 'npac');
    const cell = selectTargetBand('milk_gelato', temp);
    // The calculated indicator judged the recipe against THIS temperature's band cell…
    expect(npac?.band).toEqual({
      min: cell?.band.metrics.npac?.min,
      max: cell?.band.metrics.npac?.max,
    });
    expect(npac?.temperature_fallback).toBe(false);
    // …and that cell is NOT the −11 cell unless −11 was selected (bands really differ by temp).
    const minus11 = selectTargetBand('milk_gelato', -11);
    if (temp !== -11) {
      expect(npac?.band).not.toEqual({
        min: minus11?.band.metrics.npac?.min,
        max: minus11?.band.metrics.npac?.max,
      });
    }
  });

  it('the surface header derives the SAME temperature (no hardcoded label)', () => {
    expect(engineRouteLabel(null, temp).main).toBe(`Silnik −${Math.abs(temp)}°C`);
  });
});

describe('engineRouteLabel — Świeże and derivation rules', () => {
  it('Świeże stays visibly „Świeże"; the internal −11°C profile is only a technical detail', () => {
    const label = engineRouteLabel('fresh', -11);
    expect(label.main).toBe('Świeże');
    expect(label.detail).toBe('wewnętrzny profil −11°C');
  });

  it('professional modes show their exact temperature with no detail note', () => {
    expect(engineRouteLabel('temp_minus_13', -13)).toEqual({ main: 'Silnik −13°C', detail: null });
    expect(engineRouteLabel('temp_minus_12', -12)).toEqual({ main: 'Silnik −12°C', detail: null });
    expect(engineRouteLabel('temp_minus_11', -11)).toEqual({ main: 'Silnik −11°C', detail: null });
  });
});

describe('surface wiring — header, Monitor and solver share the ONE store route', () => {
  const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

  it('no hardcoded engine label remains; the header uses engineRouteLabel', () => {
    expect(surface.includes('engineTag')).toBe(false);
    expect(surface.includes("'Silnik −11")).toBe(false);
    expect(surface).toContain('engineRouteLabel(servingModeId, temperatureC)');
  });

  it('the Monitor receives the SAME store temperature the Engine input uses', () => {
    expect(surface).toContain('servingTemperatureC={temperatureC}');
    // …and useStudioResult builds the Engine + solver input from the same store field.
    const hook = read('features', 'studio', 'useStudioResult.ts');
    expect(hook).toContain('target_temperature_c');
    expect(hook).toContain('proposeCorrections');
  });
});

describe('recipe store — routing state integrity', () => {
  it('a MANUAL temperature change clears the machine route (mismatch is unrepresentable)', () => {
    useRecipeStore.getState().resetToDemo();
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'temp_minus_13',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -13,
    });
    useRecipeStore.getState().setTargetTemperature(-11);
    const s = useRecipeStore.getState();
    expect(s.target_temperature_c).toBe(-11);
    expect(s.servingModeId).toBeNull();
    expect(s.machineKind).toBeNull();
    expect(s.machineLabel).toBeNull();
  });

  it('a reopened saved recipe preserves its REAL temperature', () => {
    useRecipeStore.getState().resetToDemo();
    useRecipeStore.getState().loadRecipeInput(
      buildRecipeInput(storeState(-13)),
      { savedId: 'r1', savedName: 'X', versionNumber: 5, versionDate: '2026-07-22T10:00:00.000Z' },
    );
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
  });
});
