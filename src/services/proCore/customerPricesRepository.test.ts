import { describe, expect, it } from 'vitest';
import { InMemoryCustomerPricesRepository } from './customerPricesRepository';

describe('customer prices repository', () => {
  it('isolates owners, persists into future reads and reset deletes the override', async () => {
    let tick = 0;
    const repo = new InMemoryCustomerPricesRepository(
      () => `2026-08-09T00:00:0${tick++}.000Z`,
      () => `id-${tick}`,
    );
    await repo.upsertOverride({
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      pricePerKg: 1.12,
      currency: 'EUR',
      createdBy: 'owner-a',
    });
    expect(await repo.listOverrides('owner-a')).toHaveLength(1);
    expect(await repo.listOverrides('owner-b')).toEqual([]);
    expect((await repo.listOverrides('owner-a'))[0]!.pricePerKg).toBe(1.12);
    await repo.deleteOverride('owner-a', 'PI-ING-000236');
    expect(await repo.listOverrides('owner-a')).toEqual([]);
  });

  it('updates one current row per owner and canonical ingredient', async () => {
    const repo = new InMemoryCustomerPricesRepository(
      () => 'now',
      () => 'same-id',
    );
    const base = {
      ownerUserId: 'owner-a',
      canonicalIngredientId: 'PI-ING-000236',
      currency: 'EUR',
      createdBy: 'owner-a',
    };
    const first = await repo.upsertOverride({ ...base, pricePerKg: 1 });
    const second = await repo.upsertOverride({ ...base, pricePerKg: 2 });
    expect(second.overrideId).toBe(first.overrideId);
    expect(await repo.listOverrides('owner-a')).toHaveLength(1);
    expect((await repo.listOverrides('owner-a'))[0]!.pricePerKg).toBe(2);
  });

  it('rejects raw line ids instead of treating them as Mapper canonical identity', async () => {
    const repo = new InMemoryCustomerPricesRepository(
      () => 'now',
      () => 'id',
    );
    await expect(
      repo.upsertOverride({
        ownerUserId: 'owner-a',
        canonicalIngredientId: 'private-line-id',
        pricePerKg: 1,
        currency: 'EUR',
        createdBy: 'owner-a',
      }),
    ).rejects.toThrow('Mapper canonical ingredient id');
  });
});
