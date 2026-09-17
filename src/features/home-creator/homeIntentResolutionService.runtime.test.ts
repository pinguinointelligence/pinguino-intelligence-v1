import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDemoViewState } from '@/features/mapper-search-runtime/testMapperDemoView';

const mocks = vi.hoisted(() => ({
  searchProducts: vi.fn(),
  state: { table: [], searchPage: null, calls: [] } as FakeDemoViewState,
}));

/* The REAL SA-10 runtime (frozen release) and the REAL generated SA-03/SA-04 decisions;
   only the browser fetch of the release is replaced by the file on disk. */
vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  return {
    ...actual,
    loadMapperSearchRuntime: async () => runtime,
    planMapperCatalogSearch: async (
      text: string,
      options: Parameters<typeof actual.planMapperCatalogSearch>[1] = {},
    ) =>
      actual.createMapperCatalogSearchPlan(runtime, text, {
        ...options,
        telemetry: { record() {} },
      }),
  };
});

vi.mock('@/lib/supabase/client', async () => {
  const { createFakeDemoViewSupabase } =
    await import('@/features/mapper-search-runtime/testMapperDemoView');
  return { isSupabaseConfigured: true, supabase: createFakeDemoViewSupabase(mocks.state) };
});

vi.mock('@/services/globalCatalog', () => ({ searchProducts: mocks.searchProducts }));
vi.mock('@/services/ingredients', () => ({ getEngineApprovedIngredientById: vi.fn() }));
vi.mock('@/data/ingredients/ingredientMapper', () => ({
  ingredientRowToEngineIngredient: vi.fn(),
}));

import { MAPPER_CONCEPT_DEFAULTS } from '@/features/mapper-search-runtime/generated/conceptDefaults';
import { demoViewRowsFromRelease } from '@/features/mapper-search-runtime/testMapperDemoView';
import { parseIntent } from './homeIntentParsing';
import { resolveChipTerm } from './homeIntentResolutionService';

/** The real 27 963-alias SA-10 runtime resolves several inputs per test; CI runners are slow. */
const REAL_RUNTIME_TIMEOUT_MS = 60_000;

const decision = (conceptKey: string) => {
  const found = MAPPER_CONCEPT_DEFAULTS.defaults.find((row) => row.conceptKey === conceptKey);
  if (!found) throw new Error(`no frozen decision for ${conceptKey}`);
  return found;
};
const frozenOrder = (conceptKey: string) => {
  const row = decision(conceptKey);
  return [row.defaultPiId, ...row.alternativePiIds];
};

/** The chip exactly as HOME's composer creates it from typed text. */
const chipFrom = (text: string, index = 0) => {
  const term = parseIntent(text).terms[index];
  if (!term) throw new Error(`no term parsed from ${text}`);
  return {
    label: term.raw,
    concept: term.concept,
    segment: term.segment,
    utterance: term.utterance,
    segmentIndex: term.segmentIndex,
  };
};

const idsReadByExactId = () =>
  mocks.state.calls
    .filter((call) => call.method === 'in' && call.args[0] === 'ingredient_id')
    .map((call) => call.args[1]);

const guest = () =>
  mocks.searchProducts.mockRejectedValue(
    new Error('permission denied for function search_products_v1'),
  );

beforeEach(() => {
  mocks.searchProducts.mockReset();
  mocks.state.calls = [];
  mocks.state.searchPage = null;
  // Database order deliberately differs from the frozen order, and holds commercial
  // strawberry rows, so neither table order nor a name ranking can explain a result.
  mocks.state.table = [
    ...demoViewRowsFromRelease([...frozenOrder('strawberry')].reverse()),
    ...demoViewRowsFromRelease([...frozenOrder('banana')].reverse()),
    ...demoViewRowsFromRelease(['PI-ING-000624', 'PI-ING-000347']),
  ];
});

describe('SA-03 frozen decision (the approved data, not a test fixture)', () => {
  it('HOME-SA03-00: strawberry is PI-ING-001553 fresh fruit with the owner alternative order', () => {
    expect(decision('strawberry')).toMatchObject({
      queueId: 'SA03-Q-000076',
      conceptId: 'SC-ING-000167',
      defaultStatus: 'RANKED',
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
    expect(decision('banana').defaultPiId).toBe('PI-ING-000345');
  });
});

describe(
  'HOME_ADD consumes the frozen concept default',
  { timeout: REAL_RUNTIME_TIMEOUT_MS },
  () => {
    it.each(['truskawka', 'truskawkowe', 'truskawki', 'truskawa', 'truskawaka', 'strawberry'])(
      'HOME-SA03-01: „%s” resolves STRAWBERRIES · Fresh Fruit without a product choice (guest)',
      async (text) => {
        guest();
        const result = await resolveChipTerm(chipFrom(text));
        expect(result).toMatchObject({
          kind: 'resolved',
          row: {
            ingredient_id: 'PI-ING-001553',
            ingredient_name_display: 'STRAWBERRIES · Fresh Fruit',
          },
          provenance: {
            authority: 'SA03_CONCEPT_DEFAULT',
            conceptKey: 'strawberry',
            decisionId: 'SA03-Q-000076',
            rank: 0,
          },
        });
        expect(idsReadByExactId()).toEqual([frozenOrder('strawberry')]);
        expect(mocks.searchProducts).not.toHaveBeenCalled();
      },
    );

    it('HOME-SA03-02: a signed-in account reaches the identical decision through the same read', async () => {
      mocks.searchProducts.mockResolvedValue([]);
      const account = await resolveChipTerm(chipFrom('truskawka'));
      mocks.state.calls = [];
      guest();
      const anonymous = await resolveChipTerm(chipFrom('truskawka'));
      expect(account).toEqual(anonymous);
      expect(mocks.searchProducts).not.toHaveBeenCalled();
      expect(mocks.state.calls.find((call) => call.method === 'from')?.args[0]).toBe(
        'mapper_basement_search_demo',
      );
    });

    it('HOME-SA03-03: the default cannot be lost to a search page that does not contain it', async () => {
      guest();
      mocks.state.searchPage = demoViewRowsFromRelease(['PI-ING-002331', 'PI-ING-002358']);
      const result = await resolveChipTerm(chipFrom('truskawka'));
      expect(result).toMatchObject({ kind: 'resolved', row: { ingredient_id: 'PI-ING-001553' } });
    });

    it('HOME-SA03-04: when the default is not legal now, the next frozen alternative is used — never a re-rank', async () => {
      guest();
      mocks.state.table = mocks.state.table.filter((row) => row.ingredient_id !== 'PI-ING-001553');
      const result = await resolveChipTerm(chipFrom('truskawka'));
      expect(result).toMatchObject({
        kind: 'resolved',
        row: { ingredient_id: 'PI-ING-002331' },
        provenance: { authority: 'SA03_CONCEPT_DEFAULT', rank: 1 },
      });
    });

    it.each(['banan', 'bananowe', 'bananowy', 'bananowa'])(
      'HOME-SA03-05: „%s” resolves Fresh Banana through the same shared decision (no HOME exception)',
      async (text) => {
        guest();
        await expect(resolveChipTerm(chipFrom(text))).resolves.toMatchObject({
          kind: 'resolved',
          row: { ingredient_id: 'PI-ING-000345', ingredient_name_display: 'BANANA · Fresh Fruit' },
          provenance: { authority: 'SA03_CONCEPT_DEFAULT', conceptKey: 'banana', rank: 0 },
        });
      },
    );
  },
);

describe('explicit customer words keep their meaning', { timeout: REAL_RUNTIME_TIMEOUT_MS }, () => {
  it('HOME-SA03-06: an explicit form („puree truskawkowe”) is a real, bounded choice over the frozen order', async () => {
    guest();
    const chip = chipFrom('puree truskawkowe', 1);
    expect(chip.concept).toBe('strawberry');
    const result = await resolveChipTerm(chip);
    expect(result.kind).toBe('ambiguous');
    // The frozen order, default first — a bounded real choice, never re-ranked.
    expect(
      result.kind === 'ambiguous' && result.candidates.map((row) => row.ingredient_id),
    ).toEqual(frozenOrder('strawberry').slice(0, 6));
  });

  it('HOME-SA03-07: a brand word next to the flavour („pregel truskawka”) keeps the literal catalogue path', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    const chip = chipFrom('pregel truskawka', 1);
    expect(chip.label).toBe('truskawka');
    const result = await resolveChipTerm(chip);
    expect(result).not.toMatchObject({ provenance: { authority: 'SA03_CONCEPT_DEFAULT' } });
    expect(idsReadByExactId()).toEqual([]);
  });

  it('HOME-SA03-08: an unrecognised form word („mrożona truskawka”) never silently becomes fresh fruit', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    const chip = chipFrom('mrożona truskawka', 1);
    const result = await resolveChipTerm(chip);
    expect(result).not.toMatchObject({ row: { ingredient_id: 'PI-ING-001553' } });
  });

  it('HOME-SA03-09: when the parser and the all-locale release disagree about a word, no default is applied', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    const chip = chipFrom('jagoda');
    expect(chip.concept).toBe('blueberry');
    const result = await resolveChipTerm(chip);
    expect(result).not.toMatchObject({ provenance: { authority: 'SA03_CONCEPT_DEFAULT' } });
  });

  it('HOME-SA03-11 (review): a row not approved for Engines is never selected, even as the default', async () => {
    guest();
    mocks.state.table = mocks.state.table.map((row) =>
      row.ingredient_id === 'PI-ING-001553' ? { ...row, approved_for_engines: false } : row,
    );
    await expect(resolveChipTerm(chipFrom('truskawka'))).resolves.toMatchObject({
      kind: 'resolved',
      row: { ingredient_id: 'PI-ING-002331' },
      provenance: { rank: 1 },
    });
  });

  it('HOME-SA03-12 (review): a decided concept with nothing legal now stays unresolved — no broad substitute', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    mocks.state.table = [];
    await expect(resolveChipTerm(chipFrom('truskawka'))).resolves.toEqual({ kind: 'unresolved' });
    expect(mocks.searchProducts).not.toHaveBeenCalled();
  });

  it('HOME-SA03-13 (review): a Sorbet scope with no compliant candidate adds nothing', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    mocks.state.table = demoViewRowsFromRelease(frozenOrder('milk_chocolate'));
    const chip = { label: 'czekolada mleczna', concept: null, segment: 'czekolada mleczna' };
    await expect(resolveChipTerm(chip)).resolves.toMatchObject({
      kind: 'resolved',
      row: { ingredient_id: decision('milk_chocolate').defaultPiId },
      provenance: { scope: null },
    });
    await expect(resolveChipTerm(chip, undefined, { profile: 'sorbet' })).resolves.toEqual({
      kind: 'unresolved',
    });
    expect(mocks.searchProducts).not.toHaveBeenCalled();
  });

  it('HOME-ADD-02: fails closed when nothing central or literal matches', async () => {
    mocks.searchProducts.mockResolvedValue([]);
    await expect(resolveChipTerm({ label: 'unlisted', concept: null })).resolves.toEqual({
      kind: 'unresolved',
    });
  });
});

describe(
  'a stated form belongs to its ingredient (served staging df1d0d33 reproducer)',
  {
    timeout: REAL_RUNTIME_TIMEOUT_MS,
  },
  () => {
    beforeEach(() => {
      mocks.searchProducts.mockResolvedValue([]);
      mocks.state.table = [
        ...mocks.state.table,
        ...demoViewRowsFromRelease(frozenOrder('lemon')),
        ...demoViewRowsFromRelease(frozenOrder('mango')),
      ];
    });

    it('HOME-FORM-02: „sok z cytryny” never becomes the fresh-lemon default — the form is asked', async () => {
      const lemon = chipFrom('sok z cytryny', 1);
      expect(lemon.concept).toBe('lemon');
      const result = await resolveChipTerm(lemon);
      expect(result.kind).toBe('ambiguous');
      expect(
        result.kind === 'ambiguous' && result.candidates.map((row) => row.ingredient_id),
      ).toEqual(frozenOrder('lemon').slice(0, 6));
    });

    it('HOME-FORM-03: „puree z mango” keeps the stated form for mango', async () => {
      const result = await resolveChipTerm(chipFrom('puree z mango', 1));
      expect(result).not.toMatchObject({ kind: 'resolved' });
      expect(result.kind).toBe('ambiguous');
    });

    it('HOME-FORM-04: the form word itself asks nothing — its ingredient carries the question', async () => {
      for (const [text, index] of [
        ['puree truskawkowe', 0],
        ['sok z cytryny', 0],
        ['świeży banan', 0],
        ['mrożone truskawki', 0],
      ] as const) {
        await expect(resolveChipTerm(chipFrom(text, index)), text).resolves.toEqual({
          kind: 'covered',
        });
      }
    });

    it('HOME-FORM-05: a form that agrees with the fresh default still consumes it („świeży banan”)', async () => {
      const result = await resolveChipTerm(chipFrom('świeży banan', 1));
      expect(result).toMatchObject({
        kind: 'resolved',
        row: { ingredient_id: decision('banana').defaultPiId },
        provenance: { authority: 'SA03_CONCEPT_DEFAULT' },
      });
    });

    it('HOME-FORM-06: two ingredients joined by „z” stay two ingredients with their own defaults', async () => {
      const result = await resolveChipTerm(chipFrom('truskawki z bananem', 0));
      expect(result).toMatchObject({
        kind: 'resolved',
        row: { ingredient_id: decision('strawberry').defaultPiId },
      });
    });

    it('HOME-FORM-07: a lone form word with no ingredient keeps the literal path (nothing is covered)', async () => {
      const result = await resolveChipTerm(chipFrom('puree'));
      expect(result.kind).not.toBe('covered');
    });
  },
);

describe('source guards', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/features/home-creator/homeIntentResolutionService.ts'),
    'utf8',
  );
  it('HOME-SA03-10: HOME holds no product ids, no local banana exception and no first-row pick', () => {
    expect(source).not.toMatch(/PI-ING-\d/);
    expect(source).not.toContain('CANONICAL_FRESH_BANANA');
    expect(source).not.toContain('SIMPLE_FRESH_BANANA_INTENTS');
    expect(source).not.toMatch(/rows\[0\]/);
    expect(source).toContain('selectApprovedConceptDefault');
  });
});
