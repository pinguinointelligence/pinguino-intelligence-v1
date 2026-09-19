import { describe, expect, it } from 'vitest';
import { filterLabelHistory, labelHistoryMatches } from './labelHistorySearch';

const record = (snapshotId: string, name: string, lotCode: string, legal = name) => ({
  snapshotId,
  label: {
    productName: { pl: name },
    legalProductName: { pl: legal },
    lotCode,
  },
});

const history = [
  record('a', 'Sorbet truskawkowy', 'LOT-20260910-AB12'),
  record('b', 'Gelato pistacjowe', 'LOT-20260909-CD34'),
  record('c', 'Lody bananowe', 'LOT-20260908-EF56'),
];

describe('§40 — one field, name or LOT, whole or partial', () => {
  it('finds a full LOT', () => {
    expect(filterLabelHistory(history, 'LOT-20260909-CD34').map((r) => r.snapshotId)).toEqual([
      'b',
    ]);
  });

  it('finds a LOT fragment', () => {
    expect(filterLabelHistory(history, 'CD34').map((r) => r.snapshotId)).toEqual(['b']);
    expect(filterLabelHistory(history, '20260910').map((r) => r.snapshotId)).toEqual(['a']);
  });

  it('finds a full name', () => {
    expect(filterLabelHistory(history, 'Lody bananowe').map((r) => r.snapshotId)).toEqual(['c']);
  });

  it('finds a name fragment', () => {
    expect(filterLabelHistory(history, 'pistacj').map((r) => r.snapshotId)).toEqual(['b']);
  });

  it('ignores case in both', () => {
    expect(filterLabelHistory(history, 'sorbet TRUSKAWKOWY').map((r) => r.snapshotId)).toEqual([
      'a',
    ]);
    expect(filterLabelHistory(history, 'lot-20260908-ef56').map((r) => r.snapshotId)).toEqual([
      'c',
    ]);
  });

  it('ignores surrounding whitespace and Polish diacritics', () => {
    expect(filterLabelHistory(history, '  truskawkowy  ').map((r) => r.snapshotId)).toEqual(['a']);
    expect(filterLabelHistory([record('d', 'Lody śliwkowe', 'LOT-1')], 'sliwk')).toHaveLength(1);
  });

  it('searches the legal name too, and every language a label carries', () => {
    const multilingual = {
      snapshotId: 'e',
      label: {
        productName: { pl: 'Lody waniliowe', en: 'Vanilla ice cream' },
        legalProductName: { pl: 'Lody mleczne waniliowe' },
        lotCode: 'LOT-9',
      },
    };
    expect(labelHistoryMatches(multilingual, 'Vanilla')).toBe(true);
    expect(labelHistoryMatches(multilingual, 'mleczne')).toBe(true);
  });

  it('an empty query shows the whole history, unreordered', () => {
    expect(filterLabelHistory(history, '').map((r) => r.snapshotId)).toEqual(['a', 'b', 'c']);
    expect(filterLabelHistory(history, '   ').map((r) => r.snapshotId)).toEqual(['a', 'b', 'c']);
  });

  it('finds nothing rather than guessing', () => {
    expect(filterLabelHistory(history, 'czekolada')).toEqual([]);
  });

  it('survives a record with no names and no lot', () => {
    const bare = { snapshotId: 'f', label: { productName: {}, legalProductName: {}, lotCode: '' } };
    expect(labelHistoryMatches(bare, 'anything')).toBe(false);
    expect(labelHistoryMatches(bare, '')).toBe(true);
  });
});
