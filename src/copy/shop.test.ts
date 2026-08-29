import { describe, expect, it } from 'vitest';
import {
  resolveShopCopy,
  shopAvailabilityLabelPl,
  shopCopyEn,
  shopCopyPl,
  shopMoney,
} from './shop';

const keyPaths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        keyPaths(entry, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];

describe('shop copy', () => {
  it('keeps both locales on identical key sets', () => {
    expect(keyPaths(shopCopyEn).sort()).toEqual(keyPaths(shopCopyPl).sort());
  });

  it('resolves Polish by default', () => {
    expect(resolveShopCopy()).toBe(shopCopyPl);
    expect(resolveShopCopy('en')).toBe(shopCopyEn);
  });

  it('states the preorder lead time before checkout, not after', () => {
    expect(shopAvailabilityLabelPl('preorder', 6)).toBe(
      'Na zamówienie · wysyłka za około 6 tyg.',
    );
    expect(shopAvailabilityLabelPl('in_stock', null)).toBe('Dostępny');
    expect(shopAvailabilityLabelPl('out_of_stock', null)).toBe('Chwilowo niedostępny');
  });

  it('formats money once, for every surface', () => {
    expect(shopMoney(5900).replace(/ /g, ' ')).toContain('59,00');
  });
});
