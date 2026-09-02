import type { ProductMode } from '@/engine';

export type FormulationStrategy = 'optimal' | 'eco';
export const FORMULATION_STRATEGIES: readonly FormulationStrategy[] = ['optimal', 'eco'];

/** Frozen migration: only historical ECO remains ECO; every old quality tier becomes OPTIMAL. */
export function normalizeFormulationStrategy(
  value: ProductMode | string | null | undefined,
): FormulationStrategy {
  return value === 'eco' ? 'eco' : 'optimal';
}

export const isEcoStrategy = (value: ProductMode | string | null | undefined): boolean =>
  normalizeFormulationStrategy(value) === 'eco';
