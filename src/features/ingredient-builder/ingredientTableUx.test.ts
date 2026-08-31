import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INGREDIENT_ROW_META,
  customerRoleFor,
  displayValueToGrams,
  gramsToDisplayValue,
  nextExclusiveLock,
  requiredRemovalRoute,
  type SubstituteCandidate,
} from './ingredientTableUx';
import { ingredientRowMeta, useIngredientTableUxStore } from './ingredientTableUxStore';

const candidate: SubstituteCandidate = {
  id: 'candidate-a',
  name: 'Candidate A',
  fit: 'reformulation',
  expectedImpact: 'Wymaga ponownego przeliczenia.',
  compatibility: 'Zgodny z profilem produktu.',
};

describe('ingredient table UX contracts', () => {
  beforeEach(() => useIngredientTableUxStore.getState().reset());

  it('keeps g/kg as presentation only and returns canonical grams', () => {
    expect(gramsToDisplayValue(10_000, 'g')).toBe(10_000);
    expect(gramsToDisplayValue(10_000, 'kg')).toBe(10);
    expect(displayValueToGrams(10, 'kg')).toBe(10_000);
    expect(displayValueToGrams(350, 'g')).toBe(350);
  });

  it('moves one exclusive formulation lock instead of stacking two', () => {
    expect(nextExclusiveLock('grams', 'percent')).toBe('percent');
    expect(nextExclusiveLock('percent', 'grams')).toBe('grams');
    expect(nextExclusiveLock('grams', 'grams')).toBe('unlocked');
  });

  it('keeps required status independent from exact gram locking', () => {
    const store = useIngredientTableUxStore.getState();
    store.toggleRequired('milk');
    expect(useIngredientTableUxStore.getState().metaByLineId.milk?.required).toBe(true);
    expect(customerRoleFor('unlocked', ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'milk'))).toBe('standard');
  });

  it('stores Addition as customer metadata without inventing Engine semantics', () => {
    useIngredientTableUxStore.getState().setRole('oreo', 'addition');
    const meta = ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'oreo');
    expect(meta.role).toBe('addition');
    expect(customerRoleFor('unlocked', meta)).toBe('addition');
    expect(customerRoleFor('main', meta)).toBe('main');
  });

  it('keeps availability reversible without removing the row metadata', () => {
    const store = useIngredientTableUxStore.getState();
    store.setUnavailable('milk', true);
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'milk').unavailable).toBe(true);
    useIngredientTableUxStore.getState().setUnavailable('milk', false);
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'milk').unavailable).toBe(false);
  });

  it('routes normal deletion without a substitute guard', () => {
    expect(requiredRemovalRoute(false, [])).toBe('normal-remove');
  });

  it('offers the explicit substitute path only when a candidate was supplied', () => {
    expect(requiredRemovalRoute(true, [candidate])).toBe('offer-substitute');
  });

  it('does not fabricate a substitute for a required ingredient', () => {
    expect(requiredRemovalRoute(true, [])).toBe('no-substitute');
  });

  it('records an explicitly removed required role as unresolved/infeasible', () => {
    useIngredientTableUxStore.getState().toggleRequired('milk');
    useIngredientTableUxStore.getState().markRequiredRemoved('milk', 'Milk');
    const state = useIngredientTableUxStore.getState();
    expect(state.metaByLineId.milk).toBeUndefined();
    expect(state.unresolvedRequiredByLineId.milk).toEqual({ lineId: 'milk', name: 'Milk' });
  });

  it('can resolve the infeasible marker when the missing ingredient is restored', () => {
    useIngredientTableUxStore.getState().markRequiredRemoved('milk', 'Milk');
    useIngredientTableUxStore.getState().clearLine('milk');
    expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
  });

  it('tracks automatic, unknown and USER_SET dose ownership without creating an Engine lock', () => {
    const store = useIngredientTableUxStore.getState();
    store.setDoseMeta('fruit', {
      provenance: 'AUTO_SUGGESTED',
      groupId: 'fresh-fruit-v1',
      suggestedPercent: 30,
      suggestedTotalGrams: 300,
    });
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'fruit').dose)
      .toMatchObject({ provenance: 'AUTO_SUGGESTED', groupId: 'fresh-fruit-v1' });

    store.markDoseUserSet('fruit');
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'fruit').dose.provenance)
      .toBe('USER_SET');
  });

  it('hydrates saved dose ownership without resetting USER_SET', () => {
    const dose = {
      provenance: 'USER_SET' as const,
      groupId: 'fruit-dose',
      suggestedPercent: 30,
      suggestedTotalGrams: 300,
    };
    useIngredientTableUxStore.getState().hydrateRecipeMeta({
      fruit: { role: 'standard', required: false, dose },
    });
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'fruit').dose)
      .toEqual(dose);
  });

  it('normalizes legacy persisted row metadata without a dose sidecar', () => {
    useIngredientTableUxStore.setState({
      metaByLineId: {
        legacy: { role: 'standard', required: false, unavailable: false } as never,
      },
    });
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'legacy').dose)
      .toEqual(DEFAULT_INGREDIENT_ROW_META.dose);
  });

  it('returns quiet standard defaults for rows without metadata', () => {
    expect(ingredientRowMeta({}, 'new-line')).toEqual(DEFAULT_INGREDIENT_ROW_META);
  });
});
