import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvedConceptOrder,
  conceptDefaultIntent,
  indexConceptDefaults,
} from './conceptDefaults';
import { MAPPER_CONCEPT_DEFAULTS } from './generated/conceptDefaults';
import {
  MAPPER_CONCEPT_DEFAULTS_SHA256,
  MAPPER_CONCEPT_DEFAULTS_SOURCE_SHA256,
} from './generated/conceptDefaultsManifest';
import { MAPPER_SEARCH_RELEASE_ID } from './generated/releaseManifest';
import { readTestMapperSearchRelease, createTestMapperSearchRuntime } from './testRelease';

const index = indexConceptDefaults(MAPPER_CONCEPT_DEFAULTS);
const runtime = createTestMapperSearchRuntime();
const resolve = (text: string) =>
  runtime.resolve(text, { localeVariant: '*', marketScope: 'GLOBAL', telemetry: { record() {} } });
const intent = (text: string, focus: string, hint: string | null, unknown: string[] = []) =>
  conceptDefaultIntent(
    resolve(text),
    { text: focus, hintedConceptKey: hint, unknownContentTokens: unknown },
    index,
  );

describe('SA03-EXPORT: FINAL concept defaults are exported verbatim with source control', () => {
  it('SA03-EXPORT-01: generated module matches its manifest and certified source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/mapper-search-runtime/generated/conceptDefaults.ts'),
      'utf8',
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(MAPPER_CONCEPT_DEFAULTS_SHA256);
    expect(MAPPER_CONCEPT_DEFAULTS.source.sha256).toBe(MAPPER_CONCEPT_DEFAULTS_SOURCE_SHA256);
    const release = readTestMapperSearchRelease() as unknown as {
      authorityHashes: { concepts: { fileName: string; sha256: string } };
    };
    expect(MAPPER_CONCEPT_DEFAULTS.source).toMatchObject(release.authorityHashes.concepts);
    expect(MAPPER_CONCEPT_DEFAULTS.searchReleaseId).toBe(MAPPER_SEARCH_RELEASE_ID);
    expect(MAPPER_CONCEPT_DEFAULTS.counts).toEqual({
      defaults: 245,
      ranked: 109,
      autoConfirmedSingle: 136,
    });
    expect(index.size).toBe(245);
  });

  it('SA03-EXPORT-02: every exported identity is a real Mapper id and aliases still never target a PI', () => {
    const release = readTestMapperSearchRelease();
    const ids = new Set(release.mapperRows.map((row) => row.id));
    for (const decision of index.values()) {
      for (const id of [decision.defaultPiId, ...decision.alternativePiIds]) {
        expect(ids.has(id)).toBe(true);
      }
    }
    expect(release.searchAliases.some((alias) => /^PI-ING-/i.test(alias.targetId))).toBe(false);
  });

  it('SA03-EXPORT-03: the owner control case and non-fruit defaults are the frozen values', () => {
    expect(index.get('strawberry')).toMatchObject({
      defaultPiId: 'PI-ING-001553',
      alternativePiIds: [
        'PI-ING-002331',
        'PI-ING-001554',
        'PI-ING-000406',
        'PI-ING-002374',
        'PI-ING-002358',
        'PI-ING-002377',
      ],
    });
    // Defaults other than a fresh fruit exist and are consumed the same way.
    expect(index.get('almond')?.defaultPiId).toBe('PI-ING-002415');
    expect(index.get('chocolate')?.defaultPiId).toBe('PI-ING-002450');
    expect(index.get('vanilla')?.defaultPiId).toBe('PI-ING-002306');
  });
});

describe('SA04-SCOPE: recipe scope narrows the frozen order without re-ranking', () => {
  it('SA04-SCOPE-01: ANY and GELATO read default + alternatives in owner order', () => {
    const strawberry = index.get('strawberry')!;
    const any = [strawberry.defaultPiId, ...strawberry.alternativePiIds];
    expect(approvedConceptOrder(strawberry, null)).toEqual(any);
    expect(approvedConceptOrder(strawberry, 'GELATO')).toEqual(any);
  });

  it('SA04-SCOPE-02: a frozen alternative leads for SORBET/VEGAN when the policy says so', () => {
    const spread = index.get('hazelnut_cocoa_spread')!;
    expect(spread.scopes.SORBET.policy).toBe('USE_ALTERNATIVE_FINAL');
    expect(approvedConceptOrder(spread, 'SORBET')[0]).toBe('PI-ING-002478');
    expect(approvedConceptOrder(spread, 'VEGAN')[0]).toBe('PI-ING-002478');
  });

  it('SA04-SCOPE-03: no compliant candidate means no product, never a fabricated one', () => {
    const milkChocolate = index.get('milk_chocolate')!;
    expect(approvedConceptOrder(milkChocolate, 'SORBET')).toEqual([]);
    expect(approvedConceptOrder(milkChocolate, 'VEGAN')).toEqual([]);
    expect(approvedConceptOrder(milkChocolate, 'GELATO')[0]).toBe(milkChocolate.defaultPiId);
  });
});

describe('HOME_ADD eligibility over the REAL SA-10 resolution', () => {
  it('HOME-ADD-SEL-01: a generic concept word consumes the default', () => {
    expect(intent('truskawka', 'truskawka', 'strawberry')).toMatchObject({
      kind: 'default',
      recognisedBy: 'central',
    });
    expect(intent('truskawkowe gelato', 'truskawkowe', 'strawberry')).toMatchObject({
      kind: 'default',
    });
    expect(intent('truskawka mango', 'mango', 'mango')).toMatchObject({
      kind: 'default',
      decision: { conceptKey: 'mango' },
    });
  });

  it('HOME-ADD-SEL-02: a form the release does not know yet is bridged only by the recognised concept', () => {
    expect(intent('truskawki', 'truskawki', 'strawberry')).toMatchObject({
      kind: 'default',
      recognisedBy: 'parser',
    });
    expect(intent('truskawki', 'truskawki', null)).toMatchObject({
      kind: 'not_applicable',
      reason: 'no_concept',
    });
  });

  it('HOME-ADD-SEL-03: explicit qualifiers and prepared-form roles ask instead of defaulting', () => {
    expect(intent('puree truskawkowe', 'truskawkowe', 'strawberry')).toMatchObject({
      kind: 'clarify',
      reason: 'explicit_qualifier',
    });
    expect(intent('truskawka bez cukru', 'truskawka', 'strawberry')).toMatchObject({
      kind: 'clarify',
    });
    expect(intent('sos truskawkowy', 'truskawkowy', 'strawberry')).toMatchObject({
      kind: 'clarify',
      reason: 'prepared_form_role',
    });
  });

  it('HOME-ADD-SEL-04: unknown content words, conflicts and filler words', () => {
    expect(intent('pregel truskawka', 'truskawka', 'strawberry', ['pregel'])).toMatchObject({
      kind: 'not_applicable',
      reason: 'unknown_content_words',
    });
    expect(intent('mrożona truskawka', 'truskawka', 'strawberry', ['mrozona'])).toMatchObject({
      kind: 'not_applicable',
      reason: 'unknown_content_words',
    });
    expect(intent('jagoda', 'jagoda', 'blueberry')).toMatchObject({
      kind: 'not_applicable',
      reason: 'concept_conflict',
    });
    // A word the caller skipped (not kept as its own term) does not block.
    expect(intent('chcę lody truskawkowe', 'truskawkowe', 'strawberry')).toMatchObject({
      kind: 'default',
    });
  });

  it('HOME-ADD-SEL-05: the selection module holds no product identity of its own', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/mapper-search-runtime/conceptDefaults.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/PI-ING-\d/);
  });
});
