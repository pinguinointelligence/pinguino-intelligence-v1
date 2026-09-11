import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MAPPER_SEARCH_RELEASE_COUNTS, MAPPER_SEARCH_RELEASE_ID } from './generated/releaseManifest';
import { createTestMapperSearchRuntime, readTestMapperSearchRelease } from './testRelease';

const release = readTestMapperSearchRelease();
const runtime = createTestMapperSearchRuntime();
const keys = (input: string, localeVariant: string, marketScope: string): string[] => {
  const result = runtime.resolve(input, { localeVariant, marketScope });
  return [
    ...result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey),
    ...result.technicalMentions.flatMap((mention) => mention.targetKey ? [mention.targetKey] : []),
  ];
};

describe('SA11 FINAL_FROZEN runtime contracts — 12', () => {
  it('SA11-01 loads the immutable certified release', () => {
    expect(release.releaseId).toBe(MAPPER_SEARCH_RELEASE_ID);
    expect(release.counts).toEqual(MAPPER_SEARCH_RELEASE_COUNTS);
    expect(release.mapperRows).toHaveLength(2541);
  });

  it('SA11-02 keeps SEARCH, ROLE and TECHNICAL indexes isolated', () => {
    expect(release.searchAliases).toHaveLength(27963);
    expect(release.roleAliases).toHaveLength(1714);
    expect(release.technicalAliases).toHaveLength(69);
    expect(release.searchAliases.every((row) => !/^PI-ING-/i.test(row.targetId))).toBe(true);
    expect(release.roleAliases.every((row) => !/^PI-ING-/i.test(row.roleId))).toBe(true);
    expect(release.technicalAliases.every((row) => !row.automaticPiResolutionAllowed)).toBe(true);
  });

  it('SA11-03 loads all 45 no-stemming locale contracts', () => {
    expect(release.localeContracts).toHaveLength(45);
    expect(release.localeContracts.every((row) => row.productive_stemming_allowed === 'FALSE')).toBe(true);
  });

  it('SA11-04 executes the frozen 20-step precedence pipeline', () => {
    const result = runtime.resolve('cookies and cream', { localeVariant: 'en', marketScope: 'US' });
    expect(result.searchMentions[0]?.targetType).toBe('NAMED_COMPOSITE');
    expect(result.trace.slice(0, 20).map((entry) => entry.ruleId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `SR-PRE-${String(index + 1).padStart(3, '0')}`),
    );
  });

  it('SA11-05 conditionally splits compounds without losing recipe type', () => {
    const result = runtime.resolve('bananowo-czekoladowe, sorbet', {
      localeVariant: 'pl',
      marketScope: 'PL',
    });
    expect(result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey))
      .toEqual(['banana', 'chocolate']);
    expect(result.recipeType).toBe('SORBET');
  });

  it('SA11-06 resolves technical codes only in the technical channel', () => {
    const exact = runtime.resolve('E460(i)', { localeVariant: '*', marketScope: 'GLOBAL' });
    const ambiguous = runtime.resolve('E952', { localeVariant: '*', marketScope: 'GLOBAL' });
    expect(exact.searchMentions).toEqual([]);
    expect(exact.technicalMentions[0]).toMatchObject({ targetKey: 'mcc_e460i', piId: null });
    expect(ambiguous.technicalMentions[0]).toMatchObject({ action: 'AMBIGUITY_GATE', piId: null });
  }, 15_000);

  it('SA11-07 applies ingredient longest-safe-match protection', () => {
    const result = runtime.resolve('cream cheese', { localeVariant: 'en', marketScope: 'US' });
    expect(result.searchMentions).toHaveLength(1);
    expect(result.searchMentions[0]).toMatchObject({ targetKey: 'cream_cheese', sourceText: 'cream cheese' });
  });

  it('SA11-08 attaches roles only after ingredient spans are protected', () => {
    const input = 'Pistacja, biała czekolada i posypka z białej czekolady';
    const result = runtime.resolve(input, { localeVariant: 'pl', marketScope: 'PL' });
    expect(result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey))
      .toEqual(['pistachio', 'white_chocolate', 'white_chocolate']);
    expect(result.roleMentions.map((mention) => mention.roleKey)).toContain('TOPPING');
    expect(result.roleMentions.map((mention) => mention.roleSubtypeKey)).toContain('SPRINKLES');
  });

  it('SA11-09 applies global fallback only to globally unique aliases', () => {
    expect(keys('dừa', 'vi', 'VN')).toEqual(['coconut']);
    const unresolved = runtime.resolve('dua', { localeVariant: 'vi', marketScope: 'VN' });
    expect(unresolved.searchMentions).toEqual([]);
    expect(unresolved.searchGaps.length).toBeGreaterThan(0);
  });

  it('SA11-10 hands concepts to the resolver without direct PI selection', () => {
    const result = runtime.resolve('pistachio E407', { localeVariant: 'en', marketScope: 'US' });
    expect(result.downstream.conceptKeys).toContain('pistachio');
    expect(result.downstream.piIds).toEqual([]);
    expect([...result.searchMentions, ...result.technicalMentions, ...result.roleMentions]
      .every((mention) => mention.piId === null)).toBe(true);
  });

  it('SA11-11 preserves unresolved fragments in SEARCH_GAPS telemetry', () => {
    const record = vi.fn();
    const result = runtime.resolve('unknown-fragment-zz', {
      localeVariant: 'en',
      marketScope: 'US',
      telemetry: { record },
    });
    expect(result.searchGaps.length).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]?.[0].gaps).toEqual(result.searchGaps);
  });

  it('SA11-12 loads the complete frozen 214-vector runner', () => {
    const vectors = JSON.parse(readFileSync(
      resolve(process.cwd(), 'src/features/mapper-search-runtime/generated/sa12Vectors.json'),
      'utf8',
    )) as { parser: Record<'ROLE' | 'MORPH' | 'TECH' | 'COLLISION', unknown[]> };
    expect(Object.fromEntries(Object.entries(vectors.parser).map(([suite, rows]) => [suite, rows.length])))
      .toEqual({ ROLE: 43, MORPH: 50, TECH: 91, COLLISION: 30 });
    expect(Object.values(vectors.parser).flat()).toHaveLength(214);
  });
});
