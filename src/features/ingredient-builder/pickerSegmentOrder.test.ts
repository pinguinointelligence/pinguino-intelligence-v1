/** A query can lift only matching recent rows; all remaining rows retain central rank. */
import { describe, expect, it } from 'vitest';
import { buildProductPickerSegments } from './productPickerCatalogPresentation';

const product = (id: string, over: { favorite?: boolean; recent?: boolean } = {}) => ({
  canonicalId: id,
  favorite: false,
  recent: false,
  ...over,
});

describe('picker section order', () => {
  it('does not lift matching favourites while a query is active', () => {
    const segments = buildProductPickerSegments(
      [product('inulin'), product('pistachio', { favorite: true })],
      { activeQuery: true },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.label).toBe('SKŁADNIKI');
    expect(segments[0]!.items.map((i) => i.canonicalId)).toEqual(['inulin', 'pistachio']);
  });

  it('renders no favourites section when no favourite matches', () => {
    // Every row here already matches the query; none is a favourite.
    const segments = buildProductPickerSegments([product('inulin'), product('inulin-bio')], {
      activeQuery: true,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.label).toBe('SKŁADNIKI');
  });

  it('lifts a matching recent row and preserves central rank for the remainder', () => {
    const segments = buildProductPickerSegments(
      [product('inulin'), product('banana', { recent: true }), product('banana-puree')],
      { activeQuery: true },
    );
    expect(segments.map((segment) => segment.label)).toEqual([
      'OSTATNIO UŻYWANE',
      'POZOSTAŁE SKŁADNIKI',
    ]);
    expect(segments[0]!.items.map((i) => i.canonicalId)).toEqual(['banana']);
    expect(segments[1]!.items.map((i) => i.canonicalId)).toEqual(['inulin', 'banana-puree']);
  });

  it('leads with recently used when the box is empty', () => {
    const segments = buildProductPickerSegments(
      [product('cream'), product('milk', { recent: true })],
      { activeQuery: false },
    );
    expect(segments[0]!.label).toBe('OSTATNIO UŻYWANE');
    expect(segments[0]!.items.map((i) => i.canonicalId)).toEqual(['milk']);
    expect(segments[1]!.label).toBe('WSZYSTKIE SKŁADNIKI');
  });

  it('does not use favourite status to lead the empty view', () => {
    const segments = buildProductPickerSegments([product('sugar', { favorite: true })], {
      activeQuery: false,
    });
    expect(segments[0]!.label).toBe('SKŁADNIKI');
  });
});
