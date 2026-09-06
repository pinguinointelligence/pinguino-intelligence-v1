import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locale';
import { productDiscoveryCopy } from './productDiscovery';

describe('product-discovery locale resources', () => {
  it.each(SUPPORTED_LOCALES)('provides every canonical picker label for %s', (locale) => {
    const resource = productDiscoveryCopy(locale);
    expect(Object.keys(resource.topFilters)).toEqual([
      'favorites',
      'all',
      'fruit',
      'dairy',
      'nuts',
      'chocolate',
      'technical',
    ]);
    expect(Object.keys(resource.subfilters)).toEqual([
      'all',
      'fresh',
      'frozen',
      'puree',
      'paste',
      'sugars',
      'stabilizers',
      'inulin',
    ]);
    expect(resource.searchAll).not.toBe('');
    expect(resource.primaryCountryLabel).not.toBe('');
  });
});
