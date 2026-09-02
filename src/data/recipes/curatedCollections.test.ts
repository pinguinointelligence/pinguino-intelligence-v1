import { describe, expect, it } from 'vitest';
import {
  CURATED_RECIPE_CANDIDATES,
  LOST_LEGENDARY_CANDIDATES,
  NATURAL_ICON_CANDIDATES,
  candidateStartIntent,
  isPublishableCandidate,
  publicCountryNavigation,
  visibleCuratedCandidates,
  type CuratedRecipeCandidate,
} from './curatedCollections';
import { inspirationStartHref, parseInspirationStartIntent } from './inspirationHandoff';

const publishableFixture = (
  overrides: Partial<CuratedRecipeCandidate> = {},
): CuratedRecipeCandidate => ({
  ...NATURAL_ICON_CANDIDATES[0]!,
  id: 'published-fixture',
  country: 'Testland',
  continent: 'Europe',
  publicationStage: 'published',
  status: 'authentic_reproducible',
  can_open_in_workbench: true,
  unavailable_mapper_items: [],
  ...overrides,
});

describe('curated recipe discovery candidates', () => {
  it('keeps the first curation deliberately small and earned', () => {
    expect(CURATED_RECIPE_CANDIDATES).toHaveLength(29);
    expect(LOST_LEGENDARY_CANDIDATES).toHaveLength(19);
    expect(NATURAL_ICON_CANDIDATES).toHaveLength(10);
  });

  it('respects the seven-stage publication gate', () => {
    expect(visibleCuratedCandidates()).toEqual([]);
    expect(CURATED_RECIPE_CANDIDATES.every((entry) => !isPublishableCandidate(entry))).toBe(true);
    expect(isPublishableCandidate(publishableFixture())).toBe(true);
    expect(
      isPublishableCandidate(publishableFixture({ publicationStage: 'sensory_approved' })),
    ).toBe(false);
    expect(isPublishableCandidate(publishableFixture({ status: 'research_required' }))).toBe(false);
    expect(
      isPublishableCandidate(publishableFixture({ unavailable_mapper_items: ['missing'] })),
    ).toBe(false);
  });

  it('shows public countries only when at least one genuinely publishable item survives', () => {
    const italy = publishableFixture({ id: 'italy-1', country: 'Włochy' });
    const second = publishableFixture({ id: 'italy-2', country: 'Włochy' });
    const forcedGermany = publishableFixture({
      id: 'germany',
      country: 'Niemcy',
      publicationStage: 'researched',
    });
    expect(publicCountryNavigation([italy, second, forcedGermany])).toEqual([
      { country: 'Włochy', continent: 'Europe', count: 2 },
    ]);
  });

  it('does not force geography or publish rejected research', () => {
    expect(CURATED_RECIPE_CANDIDATES.some((entry) => entry.country === 'Niemcy')).toBe(false);
    expect(
      visibleCuratedCandidates({ visibility: 'owner_review' }).some(
        (entry) => entry.status === 'not_suitable',
      ),
    ).toBe(false);
    expect(
      CURATED_RECIPE_CANDIDATES.filter((entry) => entry.status === 'not_suitable'),
    ).toHaveLength(4);
  });

  it('does not turn a non-geographic Natural Icon into a country', () => {
    const generic = publishableFixture({ country: 'Kierunek naturalny' });
    expect(publicCountryNavigation([generic])).toEqual([]);
  });

  it('keeps authentic and adapted items distinct and carries the substitution warning', () => {
    const adapted = CURATED_RECIPE_CANDIDATES.find(
      (entry) => entry.status === 'adaptable' && entry.can_open_in_workbench,
    )!;
    const authentic = CURATED_RECIPE_CANDIDATES.find(
      (entry) => entry.status === 'authentic_reproducible' && entry.can_open_in_workbench,
    )!;
    expect(adapted.substitutions.length).toBeGreaterThan(0);
    expect(candidateStartIntent(adapted)?.adaptationWarning).toBeTruthy();
    expect(candidateStartIntent(authentic)?.adaptationWarning).toBeNull();
  });

  it('opens the existing workbench with intent and mapped canonical ids, never final grams', () => {
    const pistachio = CURATED_RECIPE_CANDIDATES.find((entry) => entry.id === 'pistacchio-puro')!;
    const intent = candidateStartIntent(pistachio)!;
    const serialized = JSON.stringify(intent);
    expect(intent.canonicalIngredientIds).toEqual(['PI-ING-000444']);
    expect(serialized).not.toMatch(/planned_grams|actual_grams|dose|"grams"/i);
    const href = inspirationStartHref(intent);
    expect(href.startsWith('/start?')).toBe(true);
    expect(
      parseInspirationStartIntent(new URLSearchParams(href.split('?')[1]))?.canonicalIngredientIds,
    ).toEqual(['PI-ING-000444']);
  });

  it('never lets unsupported or special-process research masquerade as ready', () => {
    for (const entry of CURATED_RECIPE_CANDIDATES) {
      if (
        entry.status === 'not_suitable' ||
        entry.status === 'research_required' ||
        entry.canonical_product_type === 'special_process'
      ) {
        expect(candidateStartIntent(entry)).toBeNull();
      }
      expect(['gelato', 'sorbet', 'vegan', 'protein', 'special_process']).toContain(
        entry.canonical_product_type,
      );
    }
  });

  it('keeps every pre-publication customer preview visibly classifiable as pink readiness', () => {
    expect(
      visibleCuratedCandidates({ visibility: 'owner_review' }).every(
        (entry) => entry.publicationStage !== 'published',
      ),
    ).toBe(true);
  });

  it('keeps owner review explicit and never weakens customer publication visibility', () => {
    expect(visibleCuratedCandidates({ visibility: 'customer' })).toEqual([]);
    const ownerReview = visibleCuratedCandidates({ visibility: 'owner_review' });
    expect(ownerReview.length).toBeGreaterThan(0);
    expect(ownerReview.some((entry) => entry.publicationStage === 'researched')).toBe(true);
    expect(ownerReview.some((entry) => entry.publicationStage === 'mapper_ready')).toBe(true);
    expect(ownerReview.every((entry) => entry.status !== 'not_suitable')).toBe(true);
  });
});
