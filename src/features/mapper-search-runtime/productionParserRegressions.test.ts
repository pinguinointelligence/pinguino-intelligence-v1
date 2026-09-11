import { beforeAll, describe, expect, it } from 'vitest';
import { createTestMapperSearchRuntime } from './testRelease';

interface ProductionCase {
  id: string;
  input: string;
  locale: string;
  market: string;
  keys?: string[];
  recipeType?: string | null;
  roles?: string[];
  subtypes?: string[];
  searchType?: string;
  technicalAction?: 'RESOLVED_CONCEPT' | 'AMBIGUITY_GATE';
  gaps?: boolean;
}

const cases: ProductionCase[] = [
  { id: 'PROD-001', input: 'bananowo-czekoladowe, sorbet', locale: 'pl', market: 'PL', keys: ['banana', 'chocolate'], recipeType: 'SORBET' },
  { id: 'PROD-002', input: 'Pistacja, biała czekolada i posypka z białej czekolady', locale: 'pl', market: 'PL', keys: ['pistachio', 'white_chocolate', 'white_chocolate'], roles: ['TOPPING'], subtypes: ['SPRINKLES'] },
  { id: 'PROD-003', input: 'MATER 50 VERO F · Base Mix · PC0000', locale: 'en', market: 'GLOBAL', keys: ['mater_50_vero_f_pc0000'], searchType: 'EXACT_PRODUCT' },
  { id: 'PROD-004', input: '7613033694134', locale: 'en', market: 'GB', keys: ['nescafe_original_gb_ie_7613033694134'], searchType: 'EXACT_PRODUCT' },
  { id: 'PROD-005', input: 'PC0000', locale: 'en', market: 'GLOBAL', keys: ['mater_50_vero_f_pc0000'], searchType: 'EXACT_PRODUCT' },
  { id: 'PROD-006', input: 'cream cheese', locale: 'en', market: 'US', keys: ['cream_cheese'] },
  { id: 'PROD-007', input: 'Guetzli', locale: 'de', market: 'CH', keys: ['cookie'] },
  { id: 'PROD-008', input: 'MCC', locale: '*', market: 'GLOBAL', keys: [], technicalAction: 'AMBIGUITY_GATE', gaps: true },
  { id: 'PROD-009', input: 'MCC 80', locale: '*', market: 'GLOBAL', keys: ['micellar_casein'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-010', input: 'E460(i)', locale: '*', market: 'GLOBAL', keys: ['mcc_e460i'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-011', input: 'E952', locale: '*', market: 'GLOBAL', keys: [], technicalAction: 'AMBIGUITY_GATE', gaps: true },
  { id: 'PROD-012', input: 'E954', locale: '*', market: 'GLOBAL', keys: [], technicalAction: 'AMBIGUITY_GATE', gaps: true },
  { id: 'PROD-013', input: 'E407', locale: '*', market: 'GLOBAL', keys: ['carrageenan'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-014', input: 'E418', locale: '*', market: 'GLOBAL', keys: ['gellan'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-015', input: 'E440', locale: '*', market: 'GLOBAL', keys: ['pectin'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-016', input: 'E322', locale: '*', market: 'GLOBAL', keys: ['lecithin'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-017', input: 'E420', locale: '*', market: 'GLOBAL', keys: ['sorbitol'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-018', input: 'E965', locale: '*', market: 'GLOBAL', keys: ['maltitol'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-019', input: 'E471', locale: '*', market: 'GLOBAL', keys: ['e471'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-020', input: 'INS 956', locale: '*', market: 'GLOBAL', keys: ['alitame'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-021', input: 'WPC 80', locale: '*', market: 'GLOBAL', keys: ['wpc'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-022', input: 'FOS P95', locale: '*', market: 'GLOBAL', keys: ['fos'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-023', input: 'CMC', locale: '*', market: 'GLOBAL', keys: ['cmc'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-024', input: 'E330', locale: '*', market: 'GLOBAL', keys: ['citric_acid'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-025', input: 'E427', locale: '*', market: 'GLOBAL', keys: ['cassia_gum'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-026', input: 'E962', locale: '*', market: 'GLOBAL', keys: ['aspartame_acesulfame_salt'], technicalAction: 'RESOLVED_CONCEPT' },
  { id: 'PROD-027', input: 'dừa', locale: 'vi', market: 'VN', keys: ['coconut'] },
  { id: 'PROD-028', input: 'dua', locale: 'vi', market: 'VN', keys: [], gaps: true },
  { id: 'PROD-029', input: 'nhãn', locale: 'vi', market: 'VN', keys: ['longan'] },
  { id: 'PROD-030', input: 'nhân', locale: 'vi', market: 'VN', keys: [], roles: ['FILLING'] },
  { id: 'PROD-031', input: 'nhan', locale: 'vi', market: 'VN', keys: [], gaps: true },
  { id: 'PROD-032', input: 'biała czekolada', locale: 'pl', market: 'PL', keys: ['white_chocolate'] },
  { id: 'PROD-033', input: 'bez posypki', locale: 'pl', market: 'PL', keys: [], roles: ['TOPPING'], subtypes: ['SPRINKLES'] },
  { id: 'PROD-034', input: 'strawberry sauce swirl with white chocolate chunks', locale: 'en', market: 'US', keys: ['strawberry', 'white_chocolate'], roles: ['SAUCE', 'SWIRL_RIPPLE', 'INCLUSION'], subtypes: ['CHUNKS_PIECES'] },
  { id: 'PROD-035', input: 'pistachio', locale: 'en', market: 'US', keys: ['pistachio'] },
  { id: 'PROD-036', input: 'OREO ice cream', locale: 'en', market: 'US', keys: ['cookies_and_cream'], searchType: 'NAMED_COMPOSITE' },
  { id: 'PROD-037', input: 'strawberry sorbet', locale: 'en', market: 'US', keys: ['strawberry'], recipeType: 'SORBET' },
  { id: 'PROD-038', input: 'ホワイトチョコのトッピング', locale: 'ja', market: 'JP', keys: ['white_chocolate'], roles: ['TOPPING'] },
  { id: 'PROD-039', input: '白巧克力脆壳', locale: 'zh-Hans', market: 'CN', keys: ['white_chocolate'], roles: ['COATING'], subtypes: ['SHELL'] },
  { id: 'PROD-040', input: 'Schokoladenstückchen als Einlage', locale: 'de', market: 'DE', keys: ['chocolate'], roles: ['INCLUSION'], subtypes: ['CHUNKS_PIECES'] },
  { id: 'PROD-041', input: 'white-chocolate-sprinkles', locale: 'en', market: 'US', keys: ['white_chocolate'], roles: ['TOPPING'], subtypes: ['SPRINKLES'] },
  { id: 'PROD-042', input: 'unknown-fragment-zz', locale: 'en', market: 'US', keys: [], gaps: true },
];

const runtime = createTestMapperSearchRuntime();

describe('production Mapper/Search parser regressions — 42', () => {
  beforeAll(() => {
    expect(cases).toHaveLength(42);
    expect(new Set(cases.map((fixture) => fixture.id)).size).toBe(42);
  });

  it.each(cases)('$id', (fixture) => {
    const result = runtime.resolve(fixture.input, {
      localeVariant: fixture.locale,
      marketScope: fixture.market,
    });
    const keys = [
      ...result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey),
      ...result.technicalMentions.flatMap((mention) => mention.targetKey ? [mention.targetKey] : []),
    ];
    if (fixture.keys) expect(keys, `${fixture.id} semantic keys`).toEqual(fixture.keys);
    if ('recipeType' in fixture) {
      expect(result.recipeType, `${fixture.id} recipe type`).toBe(fixture.recipeType ?? null);
    }
    if (fixture.roles) {
      const actual = result.roleMentions.map((mention) => mention.roleKey);
      for (const role of fixture.roles) expect(actual, `${fixture.id} role ${role}`).toContain(role);
    }
    if (fixture.subtypes) {
      const actual = result.roleMentions.map((mention) => mention.roleSubtypeKey);
      for (const subtype of fixture.subtypes) {
        expect(actual, `${fixture.id} subtype ${subtype}`).toContain(subtype);
      }
    }
    if (fixture.searchType) {
      expect(result.searchMentions[0]?.targetType, `${fixture.id} precedence`).toBe(fixture.searchType);
      expect(result.searchMentions[0]?.rule, `${fixture.id} precedence rule`).toBe(
        fixture.searchType === 'EXACT_PRODUCT' ? 'SR-PRE-004' : 'SR-PRE-005',
      );
    }
    if (fixture.technicalAction) {
      expect(result.technicalMentions[0]?.action, `${fixture.id} technical action`)
        .toBe(fixture.technicalAction);
    }
    if (fixture.gaps === true) expect(result.searchGaps.length, fixture.id).toBeGreaterThan(0);
    if (fixture.gaps === false) expect(result.searchGaps, fixture.id).toEqual([]);

    expect(result.trace.slice(0, 20).map((entry) => entry.ruleId), `${fixture.id} trace`).toEqual(
      Array.from({ length: 20 }, (_, index) => `SR-PRE-${String(index + 1).padStart(3, '0')}`),
    );
    expect(result.downstream.piIds, `${fixture.id} direct PI`).toEqual([]);
    for (const mention of [
      ...result.searchMentions,
      ...result.technicalMentions,
      ...result.roleMentions,
    ]) {
      expect(mention.piId, `${fixture.id} mention PI`).toBeNull();
      expect(
        result.input.slice(mention.span.start, mention.span.end),
        `${fixture.id} source span`,
      ).toBe(mention.sourceText);
    }
  });
});
