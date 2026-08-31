import { describe, expect, it } from 'vitest';
import { shopContentTitle } from './shopContentTitle';

/**
 * Served staging printed „Dekstroza · 500 g · 250 g" inside the Starter Pack —
 * the SKU's retail size and the packed portion, side by side, contradicting
 * each other. The SKU title is right on the SKU's own card, so the fix belongs
 * in the presentation of a bundle line, not in the data.
 */
describe('shopContentTitle', () => {
  it('drops a trailing retail pack size', () => {
    expect(shopContentTitle('Dekstroza · 500 g')).toBe('Dekstroza');
    expect(shopContentTitle('Odtłuszczone mleko w proszku · 500 g')).toBe(
      'Odtłuszczone mleko w proszku',
    );
    expect(shopContentTitle('Inulina · 1 000 g')).toBe('Inulina');
    // Intl(pl-PL) groups with U+00A0, so the packed-size suffix can arrive
    // with a non-breaking space rather than a plain one.
    expect(shopContentTitle('Inulina \u00b7 1\u00a0000 g')).toBe('Inulina');
  });

  it('leaves a title that is not a pack size alone', () => {
    expect(shopContentTitle('Gellatti Starter Pack')).toBe('Gellatti Starter Pack');
    // 42% is part of the product's identity, not its packaging.
    expect(shopContentTitle('Śmietanka w proszku 42% · 500 g')).toBe('Śmietanka w proszku 42%');
    expect(shopContentTitle('Śmietanka w proszku 42%')).toBe('Śmietanka w proszku 42%');
  });
});
