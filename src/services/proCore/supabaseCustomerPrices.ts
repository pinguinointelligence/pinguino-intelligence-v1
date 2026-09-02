import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { CustomerIngredientPriceOverride } from '@/features/pro-core/costContracts';
import { isCustomerPriceCanonicalIngredientId } from '@/features/pro-core/costing';
import type {
  CustomerPricesRepository,
  UpsertCustomerPriceOverride,
} from './customerPricesRepository';

const TABLE = 'customer_ingredient_prices';

interface PriceRow {
  id: string;
  owner_user_id: string;
  canonical_ingredient_id: string;
  price_per_kg: number | string;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const mapRow = (row: PriceRow): CustomerIngredientPriceOverride => ({
  overrideId: row.id,
  ownerUserId: row.owner_user_id,
  canonicalIngredientId: row.canonical_ingredient_id,
  pricePerKg: Number(row.price_per_kg),
  currency: row.currency,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function supabaseCustomerPricesBackendFactory():
  | (() => CustomerPricesRepository)
  | undefined {
  if (!supabase) return undefined;
  const client = supabase;
  return () => supabaseCustomerPricesRepository(client);
}

/** RLS remains the final privacy boundary; every query is also explicitly owner-scoped. */
export function supabaseCustomerPricesRepository(client: SupabaseClient): CustomerPricesRepository {
  async function currentUserId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data.user?.id) throw new Error('You must be signed in to manage prices.');
    return data.user.id;
  }

  return {
    async listOverrides(ownerUserId) {
      const current = await currentUserId();
      if (current !== ownerUserId) throw new Error('Price owner mismatch.');
      const { data, error } = await client.from(TABLE).select('*').eq('owner_user_id', ownerUserId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as PriceRow[]).map(mapRow);
    },

    async upsertOverride(input: UpsertCustomerPriceOverride) {
      if (!isCustomerPriceCanonicalIngredientId(input.canonicalIngredientId)) {
        throw new Error('A verified Mapper canonical ingredient id is required.');
      }
      if (!Number.isFinite(input.pricePerKg) || input.pricePerKg < 0) {
        throw new Error('Price per kg must be a non-negative number.');
      }
      if (!/^[A-Z]{3}$/.test(input.currency)) {
        throw new Error('Currency must be a 3-letter ISO code.');
      }
      const ownerUserId = await currentUserId();
      if (ownerUserId !== input.ownerUserId) throw new Error('Price owner mismatch.');
      const row = {
        owner_user_id: ownerUserId,
        canonical_ingredient_id: input.canonicalIngredientId,
        price_per_kg: input.pricePerKg,
        currency: input.currency,
        created_by: ownerUserId,
      };
      const { data, error } = await client
        .from(TABLE)
        .upsert(row, { onConflict: 'owner_user_id,canonical_ingredient_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Price override upsert returned no row.');
      return mapRow(data as PriceRow);
    },

    async deleteOverride(ownerUserId, canonicalIngredientId) {
      const current = await currentUserId();
      if (current !== ownerUserId) throw new Error('Price owner mismatch.');
      const { error } = await client
        .from(TABLE)
        .delete()
        .eq('owner_user_id', ownerUserId)
        .eq('canonical_ingredient_id', canonicalIngredientId);
      if (error) throw new Error(error.message);
    },
  };
}
