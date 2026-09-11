import { describe, expect, it } from 'vitest';
import { createTestMapperSearchRuntime } from './testRelease';

const runtime = createTestMapperSearchRuntime();

const cases = [
  ['SMOKE-01', 'bananowo-czekoladowe, sorbet', 'pl', 'PL', ['banana', 'chocolate'], 'SORBET'],
  ['SMOKE-02', 'Pistacja, biała czekolada i posypka z białej czekolady', 'pl', 'PL', ['pistachio', 'white_chocolate', 'white_chocolate'], null],
  ['SMOKE-03', 'cream cheese', 'en', 'US', ['cream_cheese'], null],
  ['SMOKE-04', 'cookies and cream', 'en', 'US', ['cookies_and_cream'], null],
  ['SMOKE-05', 'E460(i)', '*', 'GLOBAL', ['mcc_e460i'], null],
  ['SMOKE-06', 'E952', '*', 'GLOBAL', [], null],
  ['SMOKE-07', 'E954', '*', 'GLOBAL', [], null],
  ['SMOKE-08', 'E407', '*', 'GLOBAL', ['carrageenan'], null],
  ['SMOKE-09', 'E418', '*', 'GLOBAL', ['gellan'], null],
  ['SMOKE-10', 'E440', '*', 'GLOBAL', ['pectin'], null],
  ['SMOKE-11', 'E322', '*', 'GLOBAL', ['lecithin'], null],
  ['SMOKE-12', 'E420', '*', 'GLOBAL', ['sorbitol'], null],
  ['SMOKE-13', 'E965', '*', 'GLOBAL', ['maltitol'], null],
  ['SMOKE-14', 'E471', '*', 'GLOBAL', ['e471'], null],
  ['SMOKE-15', 'INS 956', '*', 'GLOBAL', ['alitame'], null],
  ['SMOKE-16', 'WPC 80', '*', 'GLOBAL', ['wpc'], null],
  ['SMOKE-17', 'FOS P95', '*', 'GLOBAL', ['fos'], null],
  ['SMOKE-18', 'CMC', '*', 'GLOBAL', ['cmc'], null],
  ['SMOKE-19', 'E330', '*', 'GLOBAL', ['citric_acid'], null],
  ['SMOKE-20', 'E427', '*', 'GLOBAL', ['cassia_gum'], null],
  ['SMOKE-21', 'E962', '*', 'GLOBAL', ['aspartame_acesulfame_salt'], null],
  ['SMOKE-22', 'dừa', 'vi', 'VN', ['coconut'], null],
  ['SMOKE-23', 'dua', 'vi', 'VN', [], null],
  ['SMOKE-24', 'unknown-fragment-zz', 'en', 'US', [], null],
] as const;

describe('SA-11 runtime smoke 24', () => {
  it.each(cases)('%s', (_id, input, locale, market, expectedKeys, expectedRecipeType) => {
    const result = runtime.resolve(input, { localeVariant: locale, marketScope: market });
    const keys = [
      ...result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey),
      ...result.technicalMentions.flatMap((mention) => mention.targetKey ? [mention.targetKey] : []),
    ];
    expect(keys, input).toEqual([...expectedKeys]);
    expect(result.recipeType, input).toBe(expectedRecipeType);
    expect(result.downstream.piIds, input).toEqual([]);
    expect(result.trace.slice(0, 20), input).toHaveLength(20);
    if (_id === 'SMOKE-23' || _id === 'SMOKE-24') expect(result.searchGaps.length).toBeGreaterThan(0);
  });
});
