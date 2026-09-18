/**
 * Owner 2026-09-17 — „truskawkowe” must find the ready Gellatti recipes that are built on
 * an approved strawberry PUREE, through the owner-approved discovery link, with the REAL
 * frozen release, the REAL frozen decisions and the REAL recipe library.
 */
import { describe, expect, it } from 'vitest';

vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  return { ...actual, loadMapperSearchRuntime: async () => runtime };
});

import { vi } from 'vitest';
import { MAPPER_CONCEPT_DEFAULTS } from '@/features/mapper-search-runtime/generated/conceptDefaults';
import { loadConceptMatchContext, searchOfficialMatches } from './homeMatchSearch';
import type { RequestedIngredient } from '../homeRecipeMatching';

const STRAWBERRY = MAPPER_CONCEPT_DEFAULTS.defaults.find(
  (row) => row.conceptKey === 'strawberry',
)!.defaultPiId;
const RAVIFRUIT_PUREE = 'PI-ING-001435';
const REAL_RUNTIME_TIMEOUT_MS = 60_000;

const genericStrawberry: RequestedIngredient = {
  productId: STRAWBERRY,
  statedRole: null,
  displayName: 'truskawkowe',
  conceptKey: 'strawberry',
};

describe('DISCOVERY — the idea finds the recipes, the recipe keeps its own product', () => {
  it(
    'DISCOVERY-06: a generic strawberry idea matches the ready official strawberry recipes',
    async () => {
      const context = await loadConceptMatchContext();
      const withoutLink = searchOfficialMatches({
        requested: [genericStrawberry],
        profile: null,
      });
      const withLink = searchOfficialMatches({
        requested: [genericStrawberry],
        profile: null,
        conceptMatcher: context.matcher,
      });
      expect(withoutLink).toHaveLength(0);
      expect(withLink.length).toBeGreaterThan(0);
      // Whatever READY recipes the link genuinely reaches — no card is forced. Today the
      // library's four strawberry recipes all pass readiness and the §40 profile filter.
      expect([...withLink.map((match) => match.candidate.id)].sort()).toEqual([
        'classic-frutilla-crema',
        'classic-strawberry',
        'cocktail-champagne-strawberry',
        'cocktail-strawberry-daiquiri',
      ]);
      // A sorbet idea keeps the §40 filter: only the sorbets are offered then.
      const sorbetOnly = searchOfficialMatches({
        requested: [genericStrawberry],
        profile: 'sorbet',
        conceptMatcher: context.matcher,
      });
      expect(sorbetOnly.map((match) => match.candidate.id)).not.toContain('classic-frutilla-crema');
      // The same fruit in another form is named as the form used, not as an extra flavour.
      for (const match of withLink) {
        expect(match.usedForms?.length ?? 0).toBeGreaterThan(0);
        expect(match.alsoIncludes).not.toContain(match.usedForms?.[0]);
      }
    },
    REAL_RUNTIME_TIMEOUT_MS,
  );

  it(
    'DISCOVERY-07: the Community forms reach the same link, after the frozen order',
    async () => {
      const context = await loadConceptMatchContext();
      const forms = context.formsOf('strawberry', null);
      expect(forms[0]).toBe(STRAWBERRY);
      expect(forms).toContain(RAVIFRUIT_PUREE);
      expect(forms.indexOf(RAVIFRUIT_PUREE)).toBe(forms.length - 1);
      // A concept with no owner link keeps exactly its frozen order.
      const banana = MAPPER_CONCEPT_DEFAULTS.defaults.find((row) => row.conceptKey === 'banana')!;
      expect(context.formsOf('banana', null)).toEqual([
        banana.defaultPiId,
        ...banana.alternativePiIds,
      ]);
    },
    REAL_RUNTIME_TIMEOUT_MS,
  );
});
