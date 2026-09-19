import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeMapperSearchText } from './normalize';
import { createTestMapperSearchRuntime, readTestMapperSearchRelease } from './testRelease';
import type { SearchAliasRecord } from './types';

type Vector = Record<string, string> & {
  expected_alias_or_route: string;
  expected_auto_add: string;
  expected_auto_add_allowed: string;
  expected_policy: string;
  expected_preferred_candidate_pi_id: string;
  expected_preferred_pi_id: string;
  expected_resolution_or_guard: string;
  expected_result: string;
  expected_specialization: string;
  expected_specialization_key: string;
  expected_target_id: string;
  expected_target_key: string;
  expected_targets: string;
  found_preferred_candidate_pi_id: string;
  found_preferred_pi_id: string;
  found_specialization: string;
  found_specialization_key: string;
  found_target_id: string;
  found_target_ids: string;
  found_target_key: string;
  found_targets: string;
  input_text: string;
  locale_or_scope: string;
  locale_variant: string;
  lookup_units: string;
  market_scope: string;
  match_policies: string;
  notes: string;
  status: string;
  test_class: string;
  test_id: string;
  test_type: string;
};
type Vectors = {
  data: Record<'PL3' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9', Vector[]>;
};

type DataContract = {
  suite: 'C4' | 'C5' | 'C8';
  testId: string;
  sourceWorkbook: string;
  sourceSha256: string;
  sourceSheet: string;
  contractId: string;
  evidence: Record<string, unknown>;
};

const vectors = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/features/mapper-search-runtime/generated/sa12Vectors.json'),
    'utf8',
  ),
) as Vectors;
const release = readTestMapperSearchRelease();
const runtime = createTestMapperSearchRuntime();
const dataContracts = (release.dataContracts ?? []) as DataContract[];
const dataContractsByTestId = new Map(
  dataContracts.map((contract) => [`${contract.suite}:${contract.testId}`, contract]),
);
const aliasesById = new Map(release.searchAliases.map((row) => [row.id, row]));
const aliasLocales = [...new Set(release.searchAliases.map((row) => row.locale))];
const aliasesByNormalizedSurface = new Map<string, SearchAliasRecord[]>();
for (const row of release.searchAliases) {
  for (const surface of new Set([row.raw, row.normalized])) {
    const key = `${row.locale}:${normalizeMapperSearchText(surface, row.locale)}`;
    const current = aliasesByNormalizedSurface.get(key) ?? [];
    if (!current.some((candidate) => candidate.id === row.id)) {
      aliasesByNormalizedSurface.set(key, [...current, row]);
    }
  }
}

const split = (value: string): string[] =>
  String(value ?? '')
    .split(/\s*(?:\||;)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

const field = (vector: Vector, ...names: string[]): string =>
  names.map((name) => vector[name] ?? '').find(Boolean) ?? '';

const foundAliasIds = (vector: Vector): string[] =>
  split(
    field(
      vector,
      'found_alias_ids',
      'found_alias_id',
      'found_alias_or_route_id',
      'matched_alias_ids',
    ),
  ).filter((value) => value.startsWith('SA-ALIAS-'));

const foundTargetIds = (vector: Vector): string[] =>
  split(field(vector, 'found_targets', 'found_target_id', 'found_target_ids'));

const expectedTargetIds = (vector: Vector): string[] =>
  split(field(vector, 'expected_targets', 'expected_target_id'));

const semanticTarget = (row: SearchAliasRecord): string =>
  row.overrideTargetKey || row.targetKey;

const aliasMatchesSurface = (
  row: SearchAliasRecord,
  surface: string,
  locale = row.locale,
): boolean => {
  const expected = normalizeMapperSearchText(surface, locale);
  return [row.raw, row.normalized].some(
    (candidate) => normalizeMapperSearchText(candidate, locale) === expected,
  );
};

const aliasMatchesVectorScope = (row: SearchAliasRecord, vector: Vector): boolean => {
  const locale = vector.locale_variant ?? '';
  if (locale && !['ALL', 'ANY', '*'].includes(locale) && row.locale !== locale) return false;
  const market = vector.market_scope ?? '';
  if (!market || ['ANY', '*'].includes(market)) return true;
  if (market === 'GLOBAL') return row.market === 'GLOBAL' || row.market.startsWith('GLOBAL_');
  return row.market === 'GLOBAL' || split(row.market.replaceAll('/', ';')).includes(market.toUpperCase());
};

const evidenceField = (contract: DataContract, name: string): string =>
  String(contract.evidence[name] ?? '');

const c5GuardDecisionByTestId: Record<string, string> = {
  'C5-T29': 'BLOCK_AUTOMATIC_PI',
  'C5-T30': 'BLOCK_AUTOMATIC_PI',
  'C5-T31': 'CONTEXT_REQUIRED_BARE_ALIAS_NOT_ADDED',
  'C5-T32': 'DO_NOT_MAP_TO_GENERIC_CHEESE',
  'C5-T33': 'EXACT_PRODUCT_OR_CONFIRMED_VARIANT_REQUIRED',
  'C5-T34': 'EXACT_PRODUCT_OR_CONFIRMED_VARIANT_REQUIRED',
  'C5-T35': 'EXACT_LABEL_OR_VARIANT_REQUIRED',
  'C5-T36': 'DO_NOT_MERGE',
  'C5-T37': 'QUALIFIER_PLUS_TARGET_REQUIRED',
  'C5-T38': 'SUBTYPE_REQUIRED_BEFORE_ALLERGEN_FINALIZATION',
};

function assertAuxiliaryContract(suite: string, vector: Vector): void {
  const contract = dataContractsByTestId.get(`${suite}:${vector.test_id}`);
  if (!contract) return;
  const label = `${suite}:${vector.test_id}`;
  expect(contract.sourceWorkbook, `${label} source workbook`).toMatch(/\.xlsx$/);
  expect(contract.sourceSha256, `${label} source SHA`).toMatch(/^[a-f0-9]{64}$/);
  expect(contract.sourceSheet, `${label} source sheet`).not.toMatch(/DATA_TESTS/);
  expect(Object.keys(contract.evidence).length, `${label} physical source row`).toBeGreaterThan(0);

  if (suite === 'C4') {
    if (evidenceField(contract, 'target_id')) {
      expect(evidenceField(contract, 'target_id'), `${label} authority target`).toBe(
        vector.expected_target_id,
      );
    }
    expect(evidenceField(contract, 'target_key'), `${label} authority key`).toBe(
      vector.expected_target_key,
    );
    if (contract.contractId.startsWith('C4-FORM-')) {
      expect(evidenceField(contract, 'route_id')).toBe(contract.contractId);
      expect(evidenceField(contract, 'context_key'), `${label} context`).toBe(
        vector.expected_specialization_key,
      );
      expect(evidenceField(contract, 'preferred_candidate_pi_id'), `${label} PI route`).toBe(
        vector.expected_preferred_pi_id,
      );
      expect(evidenceField(contract, 'direct_alias_to_pi')).toBe('FALSE');
      expect(evidenceField(contract, 'status')).toBe('ACTIVE_CONTEXT_ROUTE');
    } else if (contract.contractId.startsWith('C4-CONSTRAINT-')) {
      expect(evidenceField(contract, 'route_id')).toBe(contract.contractId);
      expect(evidenceField(contract, 'attribute_key'), `${label} constraint`).toBe(
        vector.expected_specialization_key,
      );
      expect(evidenceField(contract, 'resolver_result')).toBe(vector.expected_result);
      expect(evidenceField(contract, 'automatic_substitution_allowed')).toBe('FALSE');
    } else if (contract.contractId.startsWith('C4-SCOPE-')) {
      expect(evidenceField(contract, 'route_id')).toBe(contract.contractId);
      expect(evidenceField(contract, 'condition')).toContain(
        `specialization=${vector.expected_specialization_key}`,
      );
      expect(evidenceField(contract, 'evidence')).toContain(vector.expected_preferred_pi_id);
      expect(evidenceField(contract, 'resolver_result')).toBe(vector.expected_result);
    } else {
      expect(contract.contractId).toBe(`C4-RESOLVER:${vector.expected_target_id}`);
      expect(evidenceField(contract, 'home_auto_add_eligible')).toBe(vector.expected_auto_add);
      expect(evidenceField(contract, 'resolver_policy')).toBe(vector.notes);
      expect(evidenceField(contract, 'direct_alias_to_pi')).toBe('FALSE');
    }
    return;
  }

  if (suite === 'C5') {
    if (contract.sourceSheet === '01_SEARCH_ALIASES') {
      expect(contract.contractId).toBe('SA-ALIAS-H-000398');
      expect(evidenceField(contract, 'raw')).toBe(vector.input_text);
      expect(evidenceField(contract, 'targetId')).toBe(vector.expected_target_id);
      expect(evidenceField(contract, 'targetKey')).toBe(vector.expected_target_key);
      expect(evidenceField(contract, 'autoAddAllowed')).toBe('true');
      return;
    }
    if (contract.contractId.startsWith('C5-FORM-')) {
      expect(evidenceField(contract, 'form_route_id')).toBe(contract.contractId);
      expect(evidenceField(contract, 'target_id')).toBe(vector.expected_target_id);
      expect(evidenceField(contract, 'target_key')).toBe(vector.expected_target_key);
      expect(evidenceField(contract, 'preferred_candidate_pi_id')).toBe(
        vector.expected_preferred_candidate_pi_id,
      );
      expect(evidenceField(contract, 'auto_add_allowed')).toBe(
        vector.expected_auto_add_allowed,
      );
      return;
    }
    if (contract.contractId.startsWith('C5-SCOPE-')) {
      expect(evidenceField(contract, 'constraint_id')).toBe(contract.contractId);
      expect(evidenceField(contract, 'target_id')).toBe(vector.expected_target_id);
      expect(evidenceField(contract, 'target_key')).toBe(vector.expected_target_key);
      const resultColumn = vector.test_class === 'SCOPE_ALLOWED'
        ? 'sorbet_result'
        : vector.test_class === 'ALLERGEN_CONSTRAINT'
          ? 'lactose_free_result'
          : 'vegan_result';
      expect(evidenceField(contract, resultColumn), `${label} scope result`).toContain(
        vector.expected_result,
      );
      expect(evidenceField(contract, 'alias_targets_pi_directly')).toBe('FALSE');
      return;
    }
    expect(evidenceField(contract, 'guard_id')).toBe(contract.contractId);
    const expectedDecision = c5GuardDecisionByTestId[vector.test_id];
    expect(expectedDecision, `${label} expected guard decision`).toBeDefined();
    expect(evidenceField(contract, 'decision'), `${label} guard decision`).toBe(
      expectedDecision!,
    );
    expect(evidenceField(contract, 'status')).toBe('FROZEN');
    return;
  }

  expect(suite).toBe('C8');
  expect(evidenceField(contract, 'route_id')).toBe(vector.expected_alias_or_route);
  expect(evidenceField(contract, 'target_id')).toBe(vector.expected_target_id);
  expect(evidenceField(contract, 'target_key')).toBe(vector.expected_target_key);
  expect(evidenceField(contract, 'form_context_key')).toBe(vector.input_text);
  expect(evidenceField(contract, 'automatic_pi_resolution_allowed')).toBe(
    vector.expected_auto_add,
  );
  expect(evidenceField(contract, 'status')).toBe(vector.expected_resolution_or_guard);
  expect(split(evidenceField(contract, 'preferred_pi_id'))).toEqual(
    split(vector.found_target_ids),
  );
}

const localeMatches = (row: SearchAliasRecord, localeOrScope: string): boolean => {
  if (!localeOrScope || localeOrScope === 'GLOBAL') return true;
  if (/^[A-Z]{2}$/.test(localeOrScope)) {
    return row.market === 'GLOBAL' || split(row.market.replaceAll('/', ';')).includes(localeOrScope);
  }
  return row.locale.toLowerCase() === localeOrScope.toLowerCase();
};

const exactSearchRows = (vector: Vector): SearchAliasRecord[] => {
  const localeOrScope = vector.locale_or_scope ?? vector.locale_variant ?? '';
  return aliasLocales
    .flatMap(
      (locale) =>
        aliasesByNormalizedSurface.get(
          `${locale}:${normalizeMapperSearchText(vector.input_text, locale)}`,
        ) ?? [],
    )
    .filter((row) => localeMatches(row, localeOrScope));
};

const rows = Object.entries(vectors.data).flatMap(([suite, suiteRows]) =>
  suiteRows.map((vector) => ({ suite, vector })),
);

describe('SA12 FINAL_FROZEN data vectors — 459', () => {
  beforeAll(() => {
    expect(Object.fromEntries(Object.entries(vectors.data).map(([key, value]) => [key, value.length])))
      .toEqual({ PL3: 47, C3: 30, C4: 48, C5: 38, C6: 82, C7: 79, C8: 64, C9: 71 });
    expect(rows).toHaveLength(459);
    expect(new Set(rows.map(({ suite, vector }) => `${suite}:${vector.test_id}`)).size).toBe(459);
    expect(dataContracts).toHaveLength(45);
    expect(dataContractsByTestId.size).toBe(45);
    expect(
      dataContracts.map(({ suite, testId }) => `${suite}:${testId}`),
    ).toEqual([
      ...Array.from({ length: 11 }, (_, index) => `C4:C4-T${index + 30}`),
      ...Array.from({ length: 18 }, (_, index) => `C5:C5-T${index + 21}`),
      ...Array.from({ length: 16 }, (_, index) => `C8:C8-T-${String(index + 31).padStart(3, '0')}`),
    ]);
  });

  it.each(rows)('$suite $vector.test_id', ({ suite, vector }) => {
    assertAuxiliaryContract(suite, vector);
    expect(['DATA_PASS', 'DATA_SAFE_ABSENT'], `${suite}:${vector.test_id} result contract`)
      .toContain(vector.status);

    const aliasIds = foundAliasIds(vector);
    for (const aliasId of aliasIds) {
      expect(aliasesById.has(aliasId), `${suite}:${vector.test_id} alias ${aliasId}`).toBe(true);
    }

    if (suite === 'PL3') {
      const lookupUnits = split(vector.lookup_units);
      const matchPolicies = split(vector.match_policies);
      expect(aliasIds, `${suite}:${vector.test_id} alias cardinality`).toHaveLength(
        lookupUnits.length,
      );
      aliasIds.forEach((aliasId, index) => {
        const alias = aliasesById.get(aliasId)!;
        expect(
          aliasMatchesSurface(alias, lookupUnits[index]!, 'pl'),
          `${suite}:${vector.test_id} unit ${lookupUnits[index]}`,
        ).toBe(true);
        expect(alias.matchPolicy, `${suite}:${vector.test_id} match policy`).toBe(
          matchPolicies[index]!,
        );
      });
    } else {
      for (const aliasId of aliasIds) {
        const alias = aliasesById.get(aliasId)!;
        expect(
          aliasMatchesSurface(alias, vector.input_text),
          `${suite}:${vector.test_id} exact source surface`,
        ).toBe(true);
        expect(
          aliasMatchesVectorScope(alias, vector),
          `${suite}:${vector.test_id} locale/market scope`,
        ).toBe(true);
      }
    }

    const foundIds = foundTargetIds(vector);
    const expectedIds = expectedTargetIds(vector);
    const hasAuxiliaryContract = dataContractsByTestId.has(`${suite}:${vector.test_id}`);
    if (!hasAuxiliaryContract) {
      const localeOrScope = vector.locale_variant ?? vector.locale_or_scope ?? 'en';
      const locale = suite === 'PL3'
        ? 'pl'
        : /^[A-Z]{2}$/.test(localeOrScope)
          ? '*'
          : localeOrScope === 'GLOBAL'
            ? 'en'
            : localeOrScope;
      const market = vector.market_scope ?? (/^[A-Z]{2}$/.test(localeOrScope) ? localeOrScope : 'GLOBAL');
      const resolved = runtime.resolve(vector.input_text, {
        localeVariant: locale === 'ALL' || locale === 'ANY' ? '*' : locale,
        marketScope: market === 'ANY' ? 'GLOBAL' : market,
      });
      const searchTargetIds = resolved.searchMentions.flatMap((mention) => [
        mention.targetId,
        ...(mention.specializationId ? [mention.specializationId] : []),
      ]);
      const searchTargetKeys = resolved.searchMentions.flatMap((mention) => [
        mention.targetKey,
        ...(mention.specializationKey ? [mention.specializationKey] : []),
      ]);
      const negative = vector.status === 'DATA_SAFE_ABSENT' ||
        /NEGATIVE|NO_GUESS/.test(vector.test_class ?? vector.test_type ?? '') ||
        expectedIds.some((value) => /^(?:NOT(?::|\s)|NO_)/i.test(value));
      const conceptWithBlockedPi =
        suite === 'C6' &&
        ['C6-T-076', 'C6-T-077'].includes(vector.test_id);

      if (conceptWithBlockedPi) {
        expect(searchTargetIds, `${suite}:${vector.test_id} preserved semantic concept`).toContain(
          vector.expected_target_id,
        );
        expect(searchTargetKeys, `${suite}:${vector.test_id} preserved semantic key`).toContain(
          vector.expected_target_key,
        );
        expect(
          resolved.searchMentions
            .filter((mention) => mention.targetId === vector.expected_target_id)
            .every((mention) => mention.autoAddAllowed === false),
          `${suite}:${vector.test_id} PI/auto-add guard`,
        ).toBe(true);
        expect(resolved.attributes.length, `${suite}:${vector.test_id} explicit context`).toBeGreaterThan(0);
      } else if (negative) {
        for (const expected of expectedIds) {
          const forbidden = expected.replace(/^NOT(?::|\s)+/i, '');
          if (forbidden && !forbidden.startsWith('NO_')) {
            expect(searchTargetIds, `${suite}:${vector.test_id} runtime forbidden target`)
              .not.toContain(forbidden);
          }
        }
        const forbiddenKey = vector.expected_target_key?.replace(/^NOT(?::|\s)+/i, '');
        if (
          forbiddenKey &&
          !forbiddenKey.startsWith('NO_') &&
          vector.expected_policy !== 'EXISTING_COMPOSITE_OVERRIDE_NOT_C9_EXACT_IDENTITY'
        ) {
          expect(searchTargetKeys, `${suite}:${vector.test_id} runtime forbidden key`)
            .not.toContain(forbiddenKey);
        }
      } else if (suite === 'C9') {
        const allKeys = [
          ...searchTargetKeys,
          ...resolved.technicalMentions.flatMap((mention) => mention.targetKey ? [mention.targetKey] : []),
        ];
        expect(allKeys, `${suite}:${vector.test_id} runtime semantic route`).toContain(
          vector.expected_target_key,
        );
      } else if (foundIds.length > 0) {
        for (const targetId of foundIds) {
          expect(searchTargetIds, `${suite}:${vector.test_id} runtime target`).toContain(targetId);
        }
      }
      expect(resolved.downstream.piIds, `${suite}:${vector.test_id} direct PI`).toEqual([]);
    }
    if (vector.status === 'DATA_SAFE_ABSENT') {
      for (const expected of expectedIds) {
        const forbidden = expected.replace(/^NOT(?::|\s)+/i, '');
        expect(foundIds, `${suite}:${vector.test_id} forbidden target`).not.toContain(forbidden);
      }
      if (suite === 'C9') {
        if (vector.expected_policy === 'EXISTING_COMPOSITE_OVERRIDE_NOT_C9_EXACT_IDENTITY') {
          const compositeMatches = exactSearchRows(vector).filter(
            (row) => semanticTarget(row) === vector.expected_target_key,
          );
          expect(compositeMatches.length, `${suite}:${vector.test_id} composite override`)
            .toBeGreaterThan(0);
          expect(
            compositeMatches.every((row) => row.targetType !== 'EXACT_PRODUCT'),
            `${suite}:${vector.test_id} no exact-product identity`,
          ).toBe(true);
          return;
        }
        expect(
          exactSearchRows(vector).map(semanticTarget),
          `${suite}:${vector.test_id} forbidden C9 alias`,
        ).not.toContain(vector.expected_target_key);
      }
      return;
    }

    if (vector.expected_targets && vector.found_targets) {
      expect(split(vector.found_targets), `${suite}:${vector.test_id} target set`)
        .toEqual(split(vector.expected_targets));
    }
    if (vector.expected_target_id && vector.found_target_id) {
      expect(vector.found_target_id, `${suite}:${vector.test_id} target`).toBe(
        vector.expected_target_id,
      );
    }
    if (
      vector.expected_target_id &&
      vector.found_target_ids &&
      vector.test_type !== 'FORM_OR_ROUTE_CONTRACT'
    ) {
      expect(split(vector.found_target_ids), `${suite}:${vector.test_id} target set`)
        .toContain(vector.expected_target_id);
    }
    if (vector.expected_target_key && vector.found_target_key) {
      expect(vector.found_target_key, `${suite}:${vector.test_id} target key`)
        .toBe(vector.expected_target_key);
    }
    if (vector.expected_specialization && vector.found_specialization) {
      expect(vector.found_specialization, `${suite}:${vector.test_id} specialization`)
        .toBe(vector.expected_specialization);
    }
    if (vector.expected_specialization_key && vector.found_specialization_key) {
      expect(vector.found_specialization_key, `${suite}:${vector.test_id} specialization key`)
        .toBe(vector.expected_specialization_key);
    }
    if (vector.expected_preferred_pi_id && vector.found_preferred_pi_id) {
      expect(vector.found_preferred_pi_id, `${suite}:${vector.test_id} PI evidence`)
        .toBe(vector.expected_preferred_pi_id);
    }
    if (
      vector.expected_preferred_candidate_pi_id &&
      vector.found_preferred_candidate_pi_id
    ) {
      expect(
        vector.found_preferred_candidate_pi_id,
        `${suite}:${vector.test_id} candidate PI evidence`,
      ).toBe(vector.expected_preferred_candidate_pi_id);
    }

    for (const aliasId of aliasIds) {
      const alias = aliasesById.get(aliasId)!;
      if (foundIds.length > 0) {
        expect(
          foundIds,
          `${suite}:${vector.test_id} target evidence for ${aliasId}`,
        ).toContain(alias.overrideTargetId || alias.targetId);
      }
    }

    // C9 vectors intentionally omit duplicated "found" columns. Execute
    // their data-layer assertion directly against the immutable alias table.
    if (suite === 'C9') {
      const exactMatches = exactSearchRows(vector).filter(
        (row) => semanticTarget(row) === vector.expected_target_key,
      );
      const matches = exactMatches.length > 0
        ? exactMatches
        : release.searchAliases.filter(
            (row) =>
              localeMatches(row, vector.locale_or_scope) &&
              semanticTarget(row) === vector.expected_target_key,
          );
      expect(matches.length, `${suite}:${vector.test_id} exact frozen alias`).toBeGreaterThan(0);
      if (vector.expected_auto_add) {
        expect(
          matches.some((row) => String(row.autoAddAllowed).toUpperCase() === vector.expected_auto_add),
          `${suite}:${vector.test_id} auto-add contract`,
        ).toBe(true);
      }
    }
  });
});
