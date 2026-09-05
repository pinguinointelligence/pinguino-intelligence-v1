import type { MachineTechnology } from './types';

/** Every Home machine uses the already-approved Engine −11 °C cell. */
export const HOME_ENGINE_TEMPERATURE_C = -11 as const;

export type HomeFormulationModuleId =
  | 'FROZEN_BOWL'
  | 'COMPRESSOR'
  | 'FROZEN_PINT'
  | 'SOFT_DISPENSE';

export interface HomeFormulationModule {
  readonly id: HomeFormulationModuleId;
  readonly displayLabel: string;
  /** Conceptual default only. It is not persisted as a customer Direction. */
  readonly preference: {
    readonly pac: 'strong_lower' | 'moderate_lower' | 'neutral' | 'strong_upper_safe';
    readonly softness: number;
    readonly creaminess: number;
    readonly sweetness: 0;
  };
}

export const HOME_FORMULATION_MODULES: Readonly<
  Record<HomeFormulationModuleId, HomeFormulationModule>
> = {
  FROZEN_BOWL: {
    id: 'FROZEN_BOWL',
    displayLabel: 'Frozen Bowl',
    preference: { pac: 'strong_lower', softness: -2, creaminess: 0, sweetness: 0 },
  },
  COMPRESSOR: {
    id: 'COMPRESSOR',
    displayLabel: 'Compressor',
    preference: { pac: 'moderate_lower', softness: -1, creaminess: 0, sweetness: 0 },
  },
  FROZEN_PINT: {
    id: 'FROZEN_PINT',
    displayLabel: 'Frozen Pint',
    preference: { pac: 'neutral', softness: 0, creaminess: 0, sweetness: 0 },
  },
  SOFT_DISPENSE: {
    id: 'SOFT_DISPENSE',
    displayLabel: 'Soft Dispense',
    preference: { pac: 'strong_upper_safe', softness: 2, creaminess: 1, sweetness: 0 },
  },
};

/** Canonical technology mapping. Continuous soft serve remains outside Home. */
export const HOME_TECHNOLOGY_TO_FORMULATION_MODULE: Readonly<
  Record<MachineTechnology, HomeFormulationModuleId | null>
> = {
  frozen_bowl: 'FROZEN_BOWL',
  compressor: 'COMPRESSOR',
  respin: 'FROZEN_PINT',
  respin_soft: 'SOFT_DISPENSE',
  continuous_soft_serve: null,
};

export function isHomeFormulationModuleId(value: unknown): value is HomeFormulationModuleId {
  return typeof value === 'string' && value in HOME_FORMULATION_MODULES;
}

export function homeFormulationModuleForTechnology(
  technology: MachineTechnology,
): HomeFormulationModuleId | null {
  return HOME_TECHNOLOGY_TO_FORMULATION_MODULE[technology];
}

export function isActiveHomeFormulationPreference(
  moduleId: HomeFormulationModuleId | null | undefined,
): moduleId is Exclude<HomeFormulationModuleId, 'FROZEN_PINT'> {
  return moduleId !== undefined && moduleId !== null && moduleId !== 'FROZEN_PINT';
}
