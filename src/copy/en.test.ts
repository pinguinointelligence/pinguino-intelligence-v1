import { describe, expect, it } from 'vitest';
import { copy } from './en';

describe('copy module', () => {
  it('exposes the demo CTA exactly as specified', () => {
    expect(copy.landing.ctaPrimary).toBe('Start PI Demo');
  });

  it('lists all four product modes', () => {
    expect(copy.landing.modes.map((m) => m.name)).toEqual([
      'ECO',
      'CLASSIC',
      'PREMIUM',
      'SIGNATURE',
    ]);
  });
});
