import { describe, expect, it } from 'vitest';
import {
  directionAxisRelation,
  metricPositionInNativeBand,
  targetBandPosition,
} from './recipeAxisModel';

describe('Direction axis presentation uses the selected preference band', () => {
  const native = { min: 12, max: 17 };
  const low = { min: 12, max: 12 + 5 / 3 };
  const high = { min: 17 - 5 / 3, max: 17 };

  it('shows an achieved lower or upper third as gold at its real position', () => {
    expect(targetBandPosition(low, native)).toBeCloseTo(16.6666667, 5);
    expect(metricPositionInNativeBand(13, native)).toBe(20);
    expect(directionAxisRelation(13, native, low)).toBe('gold');
    expect(directionAxisRelation(16, native, high)).toBe('gold');
  });

  it('never paints an unsafe outside-native result gold even near an edge target', () => {
    expect(metricPositionInNativeBand(11, native)).toBe(0);
    expect(directionAxisRelation(11, native, low)).toBe('outside');
    expect(directionAxisRelation(18, native, high)).toBe('outside');
  });
});
