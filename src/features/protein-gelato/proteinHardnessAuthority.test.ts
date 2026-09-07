/**
 * CANONICAL PROTEIN HARDNESS — owner decision 2026-09-03 (option A).
 *
 * Protein hardness is restored through the profile's OWN approved ice-fraction
 * band, never through NPAC and never through the Gelato calibration. The NPAC
 * statement is unchanged: NPAC-based Protein hardness stays unsupported.
 *
 * The control exposes THREE positions because the authority publishes three
 * targets. Sorbet earns five because it publishes five NPAC centres
 * (`SORBET_HARDNESS_TARGET_CENTERS`); no `iceFraction` entry on any profile
 * carries a clean centre, so five Protein positions would be fake precision.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  PROTEIN_HARDNESS_ORDER,
  PROTEIN_HARDNESS_TARGET_VALUE,
  projectProteinHardnessForDisplay,
  proteinHardnessApplies,
  proteinHardnessIceBand,
  proteinHardnessSelectionChangesStored,
} from './proteinHardnessAuthority';

const TEMPS = [-11, -12, -13] as const;
const EMPTY = { byLineId: {} };

const proteinDraft = (temperature: number, level: -1 | 0 | 1) => {
  useRecipeStore.getState().startNewRecipe('protein' as never);
  useRecipeStore.getState().setDirectionTarget('softness', level);
  const base = buildRecipeInput(useRecipeStore.getState());
  return {
    ...base,
    target_temperature_c: temperature,
    goals: { ...(base.goals ?? {}), direction_targets_active: true },
  } as typeof base;
};

describe('canonical Protein hardness authority', () => {
  it('offers exactly three positions', () => {
    expect(PROTEIN_HARDNESS_ORDER).toEqual(['softer', 'balanced', 'firmer']);
    expect(PROTEIN_HARDNESS_TARGET_VALUE).toEqual({ softer: -1, balanced: 0, firmer: 1 });
  });

  it('applies only to protein_gelato, and only where the shared ice gate approves', () => {
    for (const temperature of TEMPS) {
      expect(proteinHardnessApplies('protein_gelato', temperature)).toBe(true);
      for (const other of ['milk_gelato', 'sorbet', 'vegan_gelato'] as const) {
        expect(proteinHardnessApplies(other, temperature)).toBe(false);
      }
    }
  });

  it.each(TEMPS)('@ %d the three bands are distinct and monotonic in ice fraction', (t) => {
    const softer = proteinHardnessIceBand(t, 'softer')!;
    const balanced = proteinHardnessIceBand(t, 'balanced')!;
    const firmer = proteinHardnessIceBand(t, 'firmer')!;
    // Less frozen water reads softer, more reads firmer — the INVERSE of NPAC.
    expect(softer.min).toBe(balanced.min);
    expect(firmer.max).toBe(balanced.max);
    expect(softer.max).toBeLessThan(firmer.max);
    expect(softer.min).toBeLessThan(firmer.min);
    expect(softer).not.toEqual(firmer);
  });

  it('projects a stored ±2 onto the nearest real position without rewriting it', () => {
    expect(projectProteinHardnessForDisplay(-2)).toBe('softer');
    expect(projectProteinHardnessForDisplay(-1)).toBe('softer');
    expect(projectProteinHardnessForDisplay(0)).toBe('balanced');
    expect(projectProteinHardnessForDisplay(1)).toBe('firmer');
    expect(projectProteinHardnessForDisplay(2)).toBe('firmer');
    // Selecting the already-shown position is a no-op, so a ±2 is never flattened.
    expect(proteinHardnessSelectionChangesStored(2, 'firmer')).toBe(false);
    expect(proteinHardnessSelectionChangesStored(-2, 'softer')).toBe(false);
    expect(proteinHardnessSelectionChangesStored(-2, 'firmer')).toBe(true);
  });

  it.each(TEMPS)('@ %d the Direction plan publishes ice_fraction and never NPAC', (t) => {
    for (const level of [-1, 0, 1] as const) {
      const plan = buildRecipeDirectionPlan(proteinDraft(t, level));
      const axis = plan.axes.find((a) => a.axis === 'softness');
      expect(axis?.status).toBe('working');
      expect(axis?.metric).toBe('ice_fraction');
      expect(plan.bands.ice_fraction).toEqual(axis?.targetBand);
      expect(plan.bands.npac).toBeUndefined();
    }
  });

  // ---- ACCEPTANCE: every position, every temperature, on a REAL starter -----
  it.each(TEMPS)('@ %d SOFTER / BALANCED / FIRMER each yield an applicable Preview', (t) => {
    for (const level of [-1, 0, 1] as const) {
      const input = proteinDraft(t, level);
      expect(calculateRecipe(input).ice_fraction_percent).toBeGreaterThan(0);
      const built = buildOptimizePreview(input, EMPTY as never, `protein-hardness-${t}-${level}`);
      expect(built.ok, `@${t} level ${level}: ${JSON.stringify(built)}`).toBe(true);
      if (built.ok) expect(built.preview.diagnosticOnly).toBe(false);
    }
  });

  it('sweetness stays independent of a hardness selection', () => {
    useRecipeStore.getState().startNewRecipe('protein' as never);
    useRecipeStore.getState().setDirectionTarget('sweetness', 2);
    useRecipeStore.getState().setDirectionTarget('softness', -1);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(2);
    expect(useRecipeStore.getState().direction_targets.softness).toBe(-1);
  });
});
