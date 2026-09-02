import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeResult } from '@/engine';
import { GOLDEN_RECIPES } from '@/engine/__fixtures__/goldenRecipes';
import { buildUserMonitorModules } from '@/features/user-monitor/userMonitorModules';
import {
  buildProfessionalMonitorModules,
  professionalMonitorRawValues,
} from './professionalMonitorModel';

const valueFromLegacy = (
  result: RecipeResult,
  moduleId: string,
  rowKey: string,
): number | null =>
  buildUserMonitorModules(result, -11).find((module) => module.id === moduleId)?.rows.find(
    (row) => row.key === rowKey,
  )?.value ?? null;

function legacyRawValues(result: RecipeResult) {
  return {
    pod: valueFromLegacy(result, 'expert', 'expert_pod'),
    pac: valueFromLegacy(result, 'expert', 'expert_pac'),
    npac: valueFromLegacy(result, 'expert', 'expert_npac'),
    ice_fraction: valueFromLegacy(result, 'expert', 'expert_ice'),
    water: valueFromLegacy(result, 'woda', 'water'),
    total_solids: valueFromLegacy(result, 'ciala_stale', 'total_solids'),
    fat: valueFromLegacy(result, 'tluszcze', 'fat'),
    aerating_protein: valueFromLegacy(result, 'bialka', 'aerating_protein'),
    protein_in_solids: valueFromLegacy(result, 'bialka', 'protein_in_solids'),
    lactose: valueFromLegacy(result, 'stabilizacja', 'lactose'),
    lactose_sandiness_risk: valueFromLegacy(
      result,
      'stabilizacja',
      'lactose_sandiness_risk',
    ),
  };
}

describe('Monitor mathematical freeze — old and redesigned presentation', () => {
  for (const fixture of GOLDEN_RECIPES.slice(0, 5)) {
    it(`${fixture.id}: POD/PAC/NPAC/ice/composition values are numerically identical`, () => {
      const result = calculateRecipe(fixture.input);
      const before = legacyRawValues(result);
      const after = professionalMonitorRawValues(
        buildProfessionalMonitorModules(result, fixture.input.target_temperature_c, fixture.input),
      );
      expect(after).toEqual(before);
    });
  }
});
