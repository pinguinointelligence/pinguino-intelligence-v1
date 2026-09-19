import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapperSearchResolution } from './types';
import { createTestMapperSearchRuntime } from './testRelease';

type Vector = Record<string, string> & {
  expected_action: string;
  expected_block_or_merge: string;
  expected_ingredient_key: string;
  expected_ingredient_outputs: string;
  expected_negated: string;
  expected_recipe_type: string;
  expected_role_keys: string;
  expected_role_outputs: string;
  expected_role_subtype_keys: string;
  expected_semantic_output: string;
  expected_target_concept_id: string;
  expected_target_key: string;
  expected_technical_code_output: string;
  expected_unresolved: string;
  input_text: string;
  locale_variant: string;
  market_scope: string;
  mention_order: string;
  must_not_split: string;
  test_id: string;
};
type Vectors = {
  parser: Record<'ROLE' | 'MORPH' | 'TECH' | 'COLLISION', Vector[]>;
};

const vectors = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/features/mapper-search-runtime/generated/sa12Vectors.json'),
    'utf8',
  ),
) as Vectors;
const runtime = createTestMapperSearchRuntime();

const split = (value: string): string[] =>
  String(value ?? '')
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

const ingredientKeys = (result: MapperSearchResolution): string[] => [
  ...result.searchMentions.map((mention) => mention.specializationKey ?? mention.targetKey),
  ...result.technicalMentions.flatMap((mention) => mention.targetKey ? [mention.targetKey] : []),
];

const expectedBaseKey = (value: string): string => {
  const base = value.split(' + ')[0]!.trim();
  return base === 'cookies_and_cream_composite' ? 'cookies_and_cream' : base;
};

const assertTraceAndNoPi = (result: MapperSearchResolution): void => {
  expect(result.trace.slice(0, 20).map((entry) => entry.ruleId)).toEqual(
    Array.from({ length: 20 }, (_, index) => `SR-PRE-${String(index + 1).padStart(3, '0')}`),
  );
  expect(result.downstream.piIds).toEqual([]);
  expect(
    [...result.searchMentions, ...result.technicalMentions, ...result.roleMentions].every(
      (mention) => mention.piId === null,
    ),
  ).toBe(true);
  for (const mention of [
    ...result.searchMentions,
    ...result.technicalMentions,
    ...result.roleMentions,
  ]) {
    expect(result.input.slice(mention.span.start, mention.span.end)).toBe(mention.sourceText);
  }
};

describe('SA12 ROLE frozen vectors — 43', () => {
  it.each(vectors.parser.ROLE)('$test_id mention $mention_order', (vector) => {
    const result = runtime.resolve(vector.input_text, {
      localeVariant: vector.locale_variant,
      marketScope: 'GLOBAL',
    });
    assertTraceAndNoPi(result);
    const mentionIndex = Number(vector.mention_order) - 1;
    const expectedIngredient = vector.expected_ingredient_key;
    const ingredients = result.searchMentions.filter(
      (mention) => mention.targetType === 'INGREDIENT_CONCEPT',
    );
    if (expectedIngredient && !expectedIngredient.startsWith('PROTECTED_') && expectedIngredient !== 'NONE' && expectedIngredient !== 'UNRESOLVED_OBJECT') {
      expect(
        ingredients[mentionIndex]?.specializationKey ?? ingredients[mentionIndex]?.targetKey,
        `${vector.test_id} ingredient ${vector.mention_order}`,
      ).toBe(expectedIngredient);
    }
    const expectedRoles = split(vector.expected_role_keys);
    const expectedSubtypes = split(vector.expected_role_subtype_keys);
    if (expectedRoles.length === 0) {
      const attached = result.roleMentions.filter(
        (mention) => mention.attachedSearchMention === mentionIndex,
      );
      expect(attached, `${vector.test_id} unexpected role`).toHaveLength(0);
    } else {
      const attached = result.roleMentions.filter((mention) =>
        expectedIngredient === 'UNRESOLVED_OBJECT'
          ? mention.attachedSearchMention === null
          : mention.attachedSearchMention === mentionIndex,
      );
      for (const role of expectedRoles) {
        expect(attached.map((mention) => mention.roleKey), `${vector.test_id} role`).toContain(role);
      }
      for (const subtype of expectedSubtypes) {
        expect(
          attached.map((mention) => mention.roleSubtypeKey),
          `${vector.test_id} subtype`,
        ).toContain(subtype);
      }
      expect(attached.some((mention) => mention.negated)).toBe(
        vector.expected_negated === 'TRUE',
      );
    }
  });
});

describe('SA12 MORPH/compound frozen vectors — 50', () => {
  it.each(vectors.parser.MORPH)('$test_id', (vector) => {
    const result = runtime.resolve(vector.input_text, {
      localeVariant: vector.locale_variant,
      marketScope: vector.market_scope,
    });
    assertTraceAndNoPi(result);
    expect(result.recipeType ?? '', `${vector.test_id} recipe type`).toBe(
      vector.expected_recipe_type,
    );

    const expectedIngredients = split(vector.expected_ingredient_outputs);
    const placeholders = expectedIngredients.some((value) =>
      /^(protected_|oreo_or_)/.test(value),
    );
    if (placeholders) {
      expect(
        result.searchMentions.length + result.searchGaps.length,
        `${vector.test_id} protected path`,
      ).toBeGreaterThan(0);
    } else {
      expect(ingredientKeys(result), `${vector.test_id} ingredients`).toEqual(
        expectedIngredients.map(expectedBaseKey),
      );
    }

    const expectedRoles = vector.expected_role_outputs;
    for (const role of ['TOPPING', 'SPRINKLES', 'FILLING', 'SAUCE', 'SWIRL_RIPPLE']) {
      if (expectedRoles.includes(role)) {
        expect(
          result.roleMentions.flatMap((mention) => [mention.roleKey, mention.roleSubtypeKey]),
          `${vector.test_id} ${role}`,
        ).toContain(role);
      }
    }
    if (expectedRoles.includes('NEGATIVE')) {
      expect(result.roleMentions.some((mention) => mention.negated)).toBe(true);
    }
    if (vector.expected_technical_code_output) {
      const expectedSemanticKeys = expectedIngredients.map(expectedBaseKey);
      expect(
        result.technicalMentions.length +
          result.searchMentions.filter((mention) =>
            expectedSemanticKeys.includes(mention.specializationKey ?? mention.targetKey),
          ).length,
        `${vector.test_id} technical route`,
      ).toBeGreaterThan(0);
    }
    if (vector.expected_unresolved) {
      expect(result.searchGaps.length, `${vector.test_id} unresolved`).toBeGreaterThan(0);
    } else {
      expect(result.searchGaps, `${vector.test_id} unexpected gaps`).toEqual([]);
    }
    if (vector.must_not_split === 'TRUE') {
      expect(result.searchMentions.some((mention) => mention.rule === 'SR-PRE-012')).toBe(false);
    }
  });
});

describe('SA12 TECHNICAL frozen vectors — 91', () => {
  it.each(vectors.parser.TECH)('$test_id', (vector) => {
    const result = runtime.resolve(vector.input_text, {
      localeVariant: '*',
      marketScope: 'GLOBAL',
    });
    assertTraceAndNoPi(result);
    const mention = result.technicalMentions[0];
    if (vector.expected_action === 'NO_MATCH') {
      expect(mention, vector.test_id).toBeUndefined();
      expect(result.searchGaps.length).toBeGreaterThan(0);
      return;
    }
    if (/AMBIGUITY|BLOCK/.test(vector.expected_action)) {
      expect(mention, vector.test_id).toBeDefined();
      expect(mention?.action, vector.test_id).toBe('AMBIGUITY_GATE');
      expect(mention?.targetConceptId, vector.test_id).toBeNull();
      expect(mention?.targetKey, vector.test_id).toBeNull();
      expect(result.searchGaps.length).toBeGreaterThan(0);
    } else if (mention) {
      expect(mention.targetConceptId, vector.test_id).toBe(vector.expected_target_concept_id);
      expect(mention.targetKey, vector.test_id).toBe(vector.expected_target_key);
      expect(mention.action, vector.test_id).toBe('RESOLVED_CONCEPT');
    } else {
      const semanticMention = result.searchMentions.find(
        (candidate) =>
          (candidate.specializationKey ?? candidate.targetKey) === vector.expected_target_key,
      );
      expect(semanticMention, `${vector.test_id} protected semantic route`).toBeDefined();
      expect(semanticMention?.targetId, vector.test_id).toBe(vector.expected_target_concept_id);
      expect(semanticMention?.autoAddAllowed, vector.test_id).toBe(false);
      expect(semanticMention?.piId, vector.test_id).toBeNull();
      return;
    }
    expect(mention?.autoAddAllowed).toBe(false);
    expect(mention?.piId).toBeNull();
  });
});

describe('SA12 cross-channel collision frozen vectors — 30', () => {
  it.each(vectors.parser.COLLISION)('$test_id', (vector) => {
    const result = runtime.resolve(vector.input_text, {
      localeVariant: vector.locale_variant,
      marketScope: vector.market_scope,
    });
    assertTraceAndNoPi(result);
    if (/^(BLOCK|BLOCK_UNTIL_SALT|NO_MATCH|CONTEXT_REQUIRED)$/.test(vector.expected_block_or_merge)) {
      expect(result.searchGaps.length, vector.test_id).toBeGreaterThan(0);
      expect(ingredientKeys(result), vector.test_id).toEqual([]);
      return;
    }
    if (vector.expected_block_or_merge === 'NO_ROLE_EMISSION') {
      expect(result.roleMentions, vector.test_id).toEqual([]);
      expect(result.searchMentions.length + result.searchGaps.length).toBeGreaterThan(0);
      return;
    }
    if (vector.expected_block_or_merge === 'NO_POSITIVE_ROLE') {
      expect(result.roleMentions.some((mention) => mention.negated), vector.test_id).toBe(true);
      return;
    }
    const expected = vector.expected_semantic_output;
    if (expected === 'protected exact/product span' || expected.includes('composite path')) {
      expect(result.searchMentions.length + result.searchGaps.length, vector.test_id).toBeGreaterThan(0);
      return;
    }
    const expectedKeys = split(expected).map((value) => expectedBaseKey(value.split('+')[0]!));
    const actual = [
      ...ingredientKeys(result),
      ...result.roleMentions.flatMap((mention) => [mention.roleKey, mention.roleSubtypeKey].filter(Boolean) as string[]),
    ];
    for (const key of expectedKeys) expect(actual, vector.test_id).toContain(key);
  });
});
