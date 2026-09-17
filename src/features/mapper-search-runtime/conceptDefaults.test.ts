import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvedConceptOrder,
  conceptDefaultIntent,
  conceptLineage,
  conceptMembership,
  indexConceptDefaults,
} from './conceptDefaults';
import { MAPPER_CONCEPT_DEFAULTS } from './generated/conceptDefaults';
import {
  MAPPER_CONCEPT_DEFAULTS_SHA256,
  MAPPER_CONCEPT_DEFAULTS_SOURCE_SHA256,
} from './generated/conceptDefaultsManifest';
import { MAPPER_SEARCH_RELEASE_ID } from './generated/releaseManifest';
import { readTestMapperSearchRelease, createTestMapperSearchRuntime } from './testRelease';

/** The real 27 963-alias SA-10 runtime resolves several inputs per test; CI runners are slow. */
const REAL_RUNTIME_TIMEOUT_MS = 60_000;

const index = indexConceptDefaults(MAPPER_CONCEPT_DEFAULTS);
const runtime = createTestMapperSearchRuntime();
const lineage = conceptLineage(runtime.release);
const resolve = (text: string) =>
  runtime.resolve(text, { localeVariant: '*', marketScope: 'GLOBAL', telemetry: { record() {} } });
const intent = (text: string, focus: string, hint: string | null) =>
  conceptDefaultIntent(
    resolve(text),
    {
      text: focus,
      hintedConceptKey: hint,
      siblingTexts: text.split(/\s+/).filter(Boolean),
    },
    index,
    lineage,
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

describe('SEARCH-MEMBER — concept membership by canonical id (frozen release)', () => {
  const member = conceptMembership(runtime.release);

  it('SEARCH-MEMBER-01: every PI→concept link of the release is a member of its concept', () => {
    const links = runtime.release.conceptPiLinks as ReadonlyArray<{
      piId: string;
      conceptKey: string;
    }>;
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(member(link.piId, link.conceptKey)).toBe(true);
    // The frozen strawberry alternatives, other forms included, all belong to strawberry.
    const strawberry = index.get('strawberry')!;
    for (const piId of approvedConceptOrder(strawberry, null)) {
      expect(member(piId, 'strawberry')).toBe(true);
    }
  });

  it('SEARCH-MEMBER-02: a child concept belongs to its parent, never the other way round', () => {
    const agave = (
      runtime.release.conceptPiLinks as ReadonlyArray<{ piId: string; conceptKey: string }>
    ).find((link) => link.conceptKey === 'agave_syrup')!;
    expect(lineage.within('agave_syrup', 'liquid_sweetener')).toBe(true);
    expect(lineage.within('liquid_sweetener', 'agave_syrup')).toBe(false);
    expect(member(agave.piId, 'liquid_sweetener')).toBe(true);
  });

  it('SEARCH-MEMBER-03: no link, no membership — a product is never classified by its name', () => {
    // A Ravifruit strawberry puree the release does not link to the concept stays outside it.
    expect(member('PI-ING-001435', 'strawberry')).toBe(false);
    expect(member('PI-ING-000394', 'strawberry')).toBe(false);
    expect(member('PI-ING-NOT-IN-RELEASE', 'strawberry')).toBe(false);
  });
});

describe(
  'HOME_ADD eligibility over the REAL SA-10 resolution',
  { timeout: REAL_RUNTIME_TIMEOUT_MS },
  () => {
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

    it('HOME-ADD-SEL-02: a form the release does not know yet selects only when a near central alias confirms it', () => {
      for (const form of ['truskawki', 'truskawa', 'truskawaka']) {
        expect(intent(form, form, 'strawberry')).toMatchObject({
          kind: 'default',
          recognisedBy: 'parser',
          decision: { conceptKey: 'strawberry' },
        });
      }
      expect(intent('truskawki', 'truskawki', null)).toMatchObject({
        kind: 'not_applicable',
        reason: 'no_concept',
      });
    });

    it('HOME-ADD-SEL-03: explicit form qualifiers and prepared-form roles ask; agreeing and recipe attributes do not', () => {
      expect(intent('puree truskawkowe', 'truskawkowe', 'strawberry')).toMatchObject({
        kind: 'clarify',
        reason: 'explicit_qualifier',
      });
      // „mrożona” is not an SA-10 alias, but it is one edit from the central qualifier „mrożony”.
      expect(intent('mrożona truskawka', 'truskawka', 'strawberry')).toMatchObject({
        kind: 'clarify',
        reason: 'explicit_qualifier',
      });
      expect(intent('sos truskawkowy', 'truskawkowy', 'strawberry')).toMatchObject({
        kind: 'clarify',
        reason: 'prepared_form_role',
      });
      // Agreeing qualifier and a recipe attribute keep the default.
      expect(intent('świeży banan', 'banan', 'banana')).toMatchObject({ kind: 'default' });
      expect(intent('truskawka bez cukru', 'truskawka', 'strawberry')).toMatchObject({
        kind: 'default',
      });
      expect(intent('bananowe wegańskie', 'bananowe', 'banana')).toMatchObject({
        kind: 'default',
        impliedScope: 'VEGAN',
      });
    });

    it('HOME-ADD-SEL-04: brands, grades, head nouns and alias collisions keep their meaning', () => {
      expect(intent('pregel truskawka', 'truskawka', 'strawberry')).toMatchObject({
        kind: 'not_applicable',
        reason: 'explicit_brand',
      });
      for (const graded of ['czekolada 70%', 'gorzka czekolada 85%', 'dark chocolate 60%']) {
        expect(intent(graded, 'czekolada', 'chocolate')).toMatchObject({
          kind: 'not_applicable',
          reason: 'explicit_grade',
        });
      }
      expect(intent('mleko migdałowe', 'migdałowe', 'almond')).toMatchObject({
        kind: 'not_applicable',
        reason: 'adjacent_context',
      });
      expect(intent('leche de almendras', 'almendras', 'almond')).toMatchObject({
        kind: 'not_applicable',
        reason: 'adjacent_context',
      });
      expect(intent('jagoda', 'jagoda', 'blueberry')).toMatchObject({
        kind: 'not_applicable',
        reason: 'concept_conflict',
      });
    });

    it('HOME-ADD-SEL-06 (review): request and filler words never block; a connector belongs to the role', () => {
      for (const [text, focus, hint] of [
        ['zrób mi lody bananowe', 'bananowe', 'banana'],
        ['poproszę banana', 'banana', 'banana'],
        ['chciałabym truskawki', 'truskawki', 'strawberry'],
        ['dodaj truskawki', 'truskawki', 'strawberry'],
        ['truskawka jako topping', 'truskawka', 'strawberry'],
      ] as const) {
        expect(intent(text, focus, hint)).toMatchObject({ kind: 'default' });
      }
    });

    it('HOME-ADD-SEL-07 (review): a typo is confirmed by the release, a real word never is', () => {
      // „toffee” is a Mapper product word; the parser's one-edit guess „coffee” is not used.
      expect(intent('toffee', 'toffee', 'coffee')).toMatchObject({ kind: 'not_applicable' });
      expect(intent('fresca', 'fresca', 'strawberry')).toMatchObject({ kind: 'not_applicable' });
    });

    it('HOME-ADD-SEL-08 (review): a coarser, specific or unknown parser key defers to the release', () => {
      expect(intent('gorzka czekolada', 'gorzka', 'chocolate')).toMatchObject({
        kind: 'default',
        decision: { conceptKey: 'dark_chocolate' },
        phraseText: 'gorzka czekolada',
      });
      expect(intent('wiśnia', 'wiśnia', 'cherry')).toMatchObject({
        kind: 'default',
        decision: { conceptKey: 'sour_cherry' },
      });
      expect(intent('marakuja', 'marakuja', 'passionfruit')).toMatchObject({
        kind: 'default',
        decision: { conceptKey: 'passion_fruit' },
      });
    });

    it('HOME-ADD-SEL-09 (review): one multi-word product is selected once', () => {
      expect(intent('syrop klonowy', 'syrop', null)).toMatchObject({
        kind: 'default',
        decision: { conceptKey: 'maple_syrup' },
        phraseText: 'syrop klonowy',
      });
      expect(intent('syrop klonowy', 'klonowy', null)).toMatchObject({
        kind: 'covered',
        phraseText: 'syrop klonowy',
      });
      expect(intent('mleczna czekolada', 'czekolada', 'chocolate')).toMatchObject({
        kind: 'covered',
      });
      expect(intent('mleczna czekolada', 'mleczna', null)).toMatchObject({
        kind: 'default',
        decision: { conceptKey: 'milk_chocolate' },
      });
    });

    it('HOME-ADD-SEL-05: the selection module holds no product identity of its own', () => {
      const source = readFileSync(
        join(process.cwd(), 'src/features/mapper-search-runtime/conceptDefaults.ts'),
        'utf8',
      );
      expect(source).not.toMatch(/PI-ING-\d/);
    });
  },
);
