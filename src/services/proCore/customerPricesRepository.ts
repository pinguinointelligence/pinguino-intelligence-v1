import type { CustomerIngredientPriceOverride } from '@/features/pro-core/costContracts';
import { isCustomerPriceCanonicalIngredientId } from '@/features/pro-core/costing';

export interface UpsertCustomerPriceOverride {
  ownerUserId: string;
  canonicalIngredientId: string;
  pricePerKg: number;
  currency: string;
  createdBy: string;
}

export interface CustomerPricesRepository {
  listOverrides(ownerUserId: string): Promise<CustomerIngredientPriceOverride[]>;
  upsertOverride(input: UpsertCustomerPriceOverride): Promise<CustomerIngredientPriceOverride>;
  deleteOverride(ownerUserId: string, canonicalIngredientId: string): Promise<void>;
}

/** Deterministic owner-scoped reference adapter used by tests and local DEV. */
export class InMemoryCustomerPricesRepository implements CustomerPricesRepository {
  private readonly rows = new Map<string, CustomerIngredientPriceOverride>();

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly nextId: () => string = () => crypto.randomUUID(),
  ) {}

  private key(ownerUserId: string, canonicalIngredientId: string): string {
    return `${ownerUserId}::${canonicalIngredientId}`;
  }

  async listOverrides(ownerUserId: string): Promise<CustomerIngredientPriceOverride[]> {
    return [...this.rows.values()]
      .filter((row) => row.ownerUserId === ownerUserId)
      .sort((a, b) => a.canonicalIngredientId.localeCompare(b.canonicalIngredientId));
  }

  async upsertOverride(
    input: UpsertCustomerPriceOverride,
  ): Promise<CustomerIngredientPriceOverride> {
    if (!isCustomerPriceCanonicalIngredientId(input.canonicalIngredientId)) {
      throw new Error('A verified Mapper canonical ingredient id is required.');
    }
    if (!Number.isFinite(input.pricePerKg) || input.pricePerKg < 0) {
      throw new Error('Price per kg must be a non-negative number.');
    }
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new Error('Currency must be a 3-letter ISO code.');
    }
    const key = this.key(input.ownerUserId, input.canonicalIngredientId);
    const existing = this.rows.get(key);
    const at = this.now();
    const row: CustomerIngredientPriceOverride = {
      overrideId: existing?.overrideId ?? this.nextId(),
      ownerUserId: input.ownerUserId,
      canonicalIngredientId: input.canonicalIngredientId,
      pricePerKg: input.pricePerKg,
      currency: input.currency,
      createdBy: existing?.createdBy ?? input.createdBy,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.rows.set(key, row);
    return { ...row };
  }

  async deleteOverride(ownerUserId: string, canonicalIngredientId: string): Promise<void> {
    this.rows.delete(this.key(ownerUserId, canonicalIngredientId));
  }
}
