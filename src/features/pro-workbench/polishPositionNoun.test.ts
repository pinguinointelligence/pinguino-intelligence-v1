import { describe, expect, it } from 'vitest';
import { polishPositionNoun } from './polishPositionNoun';

describe('Polish topping count copy', () => {
  it.each([
    [1, 'pozycja'],
    [2, 'pozycje'],
    [4, 'pozycje'],
    [5, 'pozycji'],
    [12, 'pozycji'],
    [14, 'pozycji'],
    [22, 'pozycje'],
    [24, 'pozycje'],
    [25, 'pozycji'],
  ] as const)('uses the correct noun for %i', (count, expected) => {
    expect(polishPositionNoun(count)).toBe(expected);
  });
});
