import { describe, expect, it } from 'vitest';
import { createMapperSearchRuntime } from './runtime';
import { readTestMapperSearchRelease } from './testRelease';
import type { MapperReleaseData, SearchAliasRecord } from './types';

describe('Mapper/Search full-span Search short circuit', () => {
  it('does not rescan Search after a technical mention consumes the complete input', () => {
    const source = readTestMapperSearchRelease();
    const technical = source.technicalAliases.find((row) => row.canonical === 'MCI 90');
    const baseProbe = source.searchAliases.find(
      (row) =>
        row.targetType === 'INGREDIENT_CONCEPT' &&
        row.market === 'GLOBAL' &&
        row.fallback === '',
    );
    if (!technical || !baseProbe) throw new Error('Required frozen test aliases are missing');

    let targetTypeReads = 0;
    const probe = { ...baseProbe } as SearchAliasRecord;
    Object.defineProperty(probe, 'targetType', {
      enumerable: true,
      get: () => {
        targetTypeReads += 1;
        return 'INGREDIENT_CONCEPT';
      },
    });

    const release: MapperReleaseData = {
      ...source,
      counts: {
        ...source.counts,
        searchAliases: 1,
        roleAliases: 0,
        technicalAliases: 1,
      },
      searchAliases: [probe],
      roleAliases: [],
      technicalAliases: [technical],
      runtimeLexicon: {
        search: [],
        role: [],
        protectedPhrases: [],
        blockedPhrases: [],
        autoAddBlocks: [],
      },
    };
    const result = createMapperSearchRuntime(release).resolve('MCI 90', {
      localeVariant: '*',
      marketScope: 'GLOBAL',
    });

    expect(result.technicalMentions).toMatchObject([
      {
        action: 'RESOLVED_CONCEPT',
        sourceText: 'MCI 90',
        targetKey: 'micellar_casein',
      },
    ]);
    expect(result.searchMentions).toEqual([]);
    expect(result.searchGaps).toEqual([]);
    expect(result.downstream.piIds).toEqual([]);
    expect(targetTypeReads).toBe(4);
  });
});
