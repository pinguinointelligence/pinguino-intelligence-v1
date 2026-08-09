import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/pro-core/customerPricesRepo', async () => {
  const { InMemoryCustomerPricesRepository } =
    await import('@/services/proCore/customerPricesRepository');
  let next = 0;
  const repository = new InMemoryCustomerPricesRepository(
    () => '2026-08-09T00:00:00.000Z',
    () => 'price-' + ++next,
  );
  return {
    resolveCustomerPricesRepository: () => ({
      repository,
      mode: 'memory',
      isLocalDev: true,
      unavailable: false,
    }),
  };
});

const { useCustomerPriceStore } = await import('./customerPriceStore');
const { useRecipeStore } = await import('./recipeStore');

describe('customer price store', () => {
  beforeEach(() => {
    useCustomerPriceStore.getState().clear();
    useRecipeStore.setState({
      formulation_strategy: 'optimal',
      dirty: false,
      draftRevision: 0,
    });
  });

  it('reuses an owner override on a future load and never exposes it to another owner', async () => {
    await useCustomerPriceStore.getState().loadForOwner('owner-a');
    await useCustomerPriceStore.getState().saveOverride({
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.12,
      currency: 'EUR',
    });
    useCustomerPriceStore.getState().clear();

    await useCustomerPriceStore.getState().loadForOwner('owner-a');
    expect(
      useCustomerPriceStore.getState().overridesByCanonicalId['PI-ING-000236']?.pricePerKg,
    ).toBe(1.12);

    useCustomerPriceStore.getState().clear();
    await useCustomerPriceStore.getState().loadForOwner('owner-b');
    expect(useCustomerPriceStore.getState().overridesByCanonicalId).toEqual({});
  });

  it('does not dirty OPTIMAL grams, but invalidates ECO exactly once without mutating items', async () => {
    await useCustomerPriceStore.getState().loadForOwner('owner-a');
    const beforeItems = useRecipeStore.getState().items;
    useRecipeStore.setState({
      formulation_strategy: 'optimal',
      dirty: false,
      draftRevision: 10,
    });
    await useCustomerPriceStore.getState().saveOverride({
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.2,
      currency: 'EUR',
    });
    expect(useRecipeStore.getState()).toMatchObject({ dirty: false, draftRevision: 10 });
    expect(useRecipeStore.getState().items).toBe(beforeItems);

    useRecipeStore.setState({
      formulation_strategy: 'eco',
      dirty: false,
      draftRevision: 20,
    });
    await useCustomerPriceStore.getState().saveOverride({
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.3,
      currency: 'EUR',
    });
    expect(useRecipeStore.getState()).toMatchObject({ dirty: true, draftRevision: 21 });
    expect(useRecipeStore.getState().items).toBe(beforeItems);
  });

  it('does not repopulate or dirty the next account after an old-owner mutation completes', async () => {
    await useCustomerPriceStore.getState().loadForOwner('owner-a');
    const pending = useCustomerPriceStore.getState().saveOverride({
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.4,
      currency: 'EUR',
    });
    useCustomerPriceStore.getState().clear();
    await useCustomerPriceStore.getState().loadForOwner('owner-b');
    await pending;

    expect(useCustomerPriceStore.getState()).toMatchObject({
      activeOwnerUserId: 'owner-b',
      overridesByCanonicalId: {},
    });
  });
});
