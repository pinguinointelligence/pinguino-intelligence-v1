import type { RecipeInput } from './types';

export type MachineCapacityAuthority = Pick<
  RecipeInput,
  'machine_capacity_grams' | 'machine_capacity_source'
>;

/** A stored number without an explicit source is never a physical hard limit. */
export function effectiveMachineCapacityGrams(input: MachineCapacityAuthority): number | null {
  return input.machine_capacity_source === 'machine' || input.machine_capacity_source === 'manual'
    ? input.machine_capacity_grams
    : null;
}
