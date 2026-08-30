import { describe, expect, it } from 'vitest';
import { proposeRecipeName } from './homeRecipeName';

describe('§53 — a natural name is proposed automatically', () => {
  it('combines the flavour and the profile', () => {
    expect(proposeRecipeName({ flavourLabels: ['truskawka'], profile: 'sorbet' })).toBe(
      'Truskawka Sorbet',
    );
  });

  it('joins two flavours', () => {
    expect(proposeRecipeName({ flavourLabels: ['banan', 'oreo'], profile: 'gelato' })).toBe(
      'Banan & Oreo Gelato',
    );
  });

  it('stops at two flavours — a name is not a label', () => {
    expect(proposeRecipeName({ flavourLabels: ['a', 'b', 'c', 'd'], profile: 'gelato' })).toBe(
      'A & B Gelato',
    );
  });

  it('falls back to the profile alone when no flavour is known', () => {
    expect(proposeRecipeName({ flavourLabels: [], profile: 'vegan' })).toBe('Wegańskie');
  });

  it('never returns an empty name', () => {
    expect(proposeRecipeName({ flavourLabels: [], profile: null }).length).toBeGreaterThan(0);
    expect(proposeRecipeName({ flavourLabels: ['  '], profile: null }).length).toBeGreaterThan(0);
  });
});
