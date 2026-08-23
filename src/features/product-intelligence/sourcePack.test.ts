/**
 * Source-pack grouping — the properties that keep grouping honest.
 *
 * Grouping products saves money, and every way it can save money wrongly is a
 * way of attributing one company's data to another's product. These tests pin
 * the boundaries.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSourcePacks,
  packKeyFor,
  planSourcePacks,
  type SourcePackInput,
} from './sourcePack';

const product = (overrides: Partial<SourcePackInput> & { rowIndex: number }): SourcePackInput => ({
  sourceProductId: `PL-${overrides.rowIndex}`,
  name: 'Produkt',
  brand: null,
  manufacturer: null,
  knownSourceUrl: null,
  technicalPdfUrl: null,
  missingNumeric: ['fat_percent'],
  missingEvidence: ['ingredients'],
  ...overrides,
});

describe('source pack keys', () => {
  it('prefers a proved official domain over the company name', () => {
    const key = packKeyFor(
      product({
        rowIndex: 1,
        manufacturer: 'Comprital S.p.A.',
        brand: 'Comprital',
        knownSourceUrl: 'https://comprital.pl/produkty/amaretto',
      }),
    );
    expect(key.kind).toBe('official_domain');
    expect(key.officialDomain).toBe('comprital.pl');
  });

  it('falls back to manufacturer, then brand', () => {
    expect(packKeyFor(product({ rowIndex: 2, manufacturer: 'Mlekovita', brand: 'Wypasione' })).kind)
      .toBe('manufacturer');
    expect(packKeyFor(product({ rowIndex: 3, brand: 'Wypasione' })).kind).toBe('brand');
  });

  it('never merges products that share no origin evidence', () => {
    const packs = buildSourcePacks([
      product({ rowIndex: 4, name: 'Coś bez marki' }),
      product({ rowIndex: 5, name: 'Coś innego bez marki' }),
    ]);
    // Two anonymous products are two packs, never one convenient group.
    expect(packs).toHaveLength(2);
    expect(packs.every((pack) => pack.kind === 'unattributed')).toBe(true);
  });

  it('keeps a retailer listing as a real but non-official entry point', () => {
    const [pack] = buildSourcePacks([
      product({
        rowIndex: 6,
        manufacturer: 'Jakiś Producent',
        knownSourceUrl: 'https://zakupy.biedronka.pl/produkt/123',
      }),
    ]);
    expect(pack.kind).toBe('manufacturer');
    // The page is real evidence and stays in the ladder, but it must never be
    // described as the manufacturer speaking for itself.
    const [entry] = pack.entryPoints;
    expect(entry.url).toBe('https://zakupy.biedronka.pl/produkt/123');
    expect(entry.official).toBe(false);
    expect(entry.authority).toBe('AUTHORITATIVE_RETAILER');
  });

  it('ranks an official source above a retailer one in the same pack', () => {
    const [pack] = buildSourcePacks([
      product({
        rowIndex: 7,
        manufacturer: 'Comprital S.p.A.',
        knownSourceUrl: 'https://zakupy.biedronka.pl/produkt/9',
        technicalPdfUrl: 'https://comprital.pl/karta.pdf',
      }),
    ]);
    expect(pack.entryPoints[0].official).toBe(true);
    expect(pack.entryPoints[0].url).toContain('comprital.pl');
  });
});

describe('source pack planning', () => {
  it('collapses one company into one pack and counts the saving', () => {
    const members = Array.from({ length: 10 }, (_, index) =>
      product({
        rowIndex: index,
        manufacturer: 'Comprital S.p.A.',
        knownSourceUrl: 'https://comprital.pl/katalog',
      }),
    );
    const plan = planSourcePacks(members);
    expect(plan.packsNeedingResearch).toBe(1);
    expect(plan.productsNeedingResearch).toBe(10);
    // One shared catalogue, not ten independent investigations.
    expect(plan.estimatedCallsPackStrategy).toBeLessThan(plan.estimatedCallsPerProductStrategy);
  });

  it('charges nothing for a pack whose products need nothing', () => {
    const plan = planSourcePacks([
      product({ rowIndex: 1, brand: 'Gotowa', missingNumeric: [], missingEvidence: [] }),
    ]);
    expect(plan.packsNeedingResearch).toBe(0);
    expect(plan.estimatedCallsPackStrategy).toBe(0);
  });

  it('unions what the whole group is missing', () => {
    const plan = planSourcePacks([
      product({ rowIndex: 1, brand: 'Marka', missingNumeric: ['fat_percent'], missingEvidence: [] }),
      product({
        rowIndex: 2,
        brand: 'Marka',
        missingNumeric: ['protein_percent'],
        missingEvidence: [],
      }),
    ]);
    expect(plan.packs[0].missingNumeric.sort()).toEqual(['fat_percent', 'protein_percent']);
  });
});
