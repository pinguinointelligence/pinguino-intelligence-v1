import { describe, expect, it } from 'vitest';
import { FORMULATION_STRATEGIES, normalizeFormulationStrategy } from './strategy';

describe('OPTIMAL/ECO strategy migration', () => {
  it('exposes exactly OPTIMAL and ECO', () => {
    expect(FORMULATION_STRATEGIES).toEqual(['optimal', 'eco']);
  });

  it.each([
    ['eco', 'eco'],
    ['classic', 'optimal'],
    ['premium', 'optimal'],
    ['signature', 'optimal'],
    [undefined, 'optimal'],
    ['broken', 'optimal'],
  ] as const)('normalizes %s to %s', (legacy, expected) => {
    expect(normalizeFormulationStrategy(legacy)).toBe(expected);
  });
});
