import { supabase } from '@/lib/supabase/client';
import type { ProfileSettingsSnapshot } from '@/features/pro-workbench/recipeProfileStore';
import { VISIBLE_PRODUCT_TYPES } from '@/features/studio/productType';

const TABLE = 'user_recipe_defaults';

export interface UserRecipeDefaultRow {
  owner_user_id: string;
  product_context_key: import('@/features/studio/productType').VisibleProductType;
  settings: ProfileSettingsSnapshot;
  updated_at: string;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isProfileSettingsSnapshot(value: unknown): value is ProfileSettingsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ProfileSettingsSnapshot>;
  const targets = row.directionTargets as Record<string, unknown> | undefined;
  return (
    VISIBLE_PRODUCT_TYPES.includes(row.visibleProductType as never) &&
    (row.machineKind === 'professional' || row.machineKind === 'home') &&
    typeof row.servingModeId === 'string' &&
    typeof row.machineLabel === 'string' &&
    isFiniteNumber(row.targetBatchGrams) &&
    row.targetBatchGrams > 0 &&
    isFiniteNumber(row.targetTemperatureC) &&
    (row.machineCapacityGrams === null || isFiniteNumber(row.machineCapacityGrams)) &&
    !!targets &&
    ['sweetness', 'softness', 'creaminess', 'flavor'].every(
      (axis) =>
        isFiniteNumber(targets[axis]) && Number(targets[axis]) >= -2 && Number(targets[axis]) <= 2,
    )
  );
}

async function requireAuthenticatedOwner(expectedOwnerUserId: string): Promise<string> {
  if (!supabase) throw new Error('Recipe defaults backend is unavailable.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const ownerUserId = data.user?.id;
  if (!ownerUserId || ownerUserId !== expectedOwnerUserId) {
    throw new Error('Recipe defaults owner does not match the authenticated account.');
  }
  return ownerUserId;
}

export async function listUserRecipeDefaults(ownerUserId: string): Promise<UserRecipeDefaultRow[]> {
  if (!supabase) return [];
  const owner = await requireAuthenticatedOwner(ownerUserId);
  const { data, error } = await supabase
    .from(TABLE)
    .select('owner_user_id,product_context_key,settings,updated_at')
    .eq('owner_user_id', owner)
    .order('product_context_key');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as UserRecipeDefaultRow[];
  if (
    rows.some(
      (row) =>
        row.owner_user_id !== owner ||
        !VISIBLE_PRODUCT_TYPES.includes(row.product_context_key) ||
        !isProfileSettingsSnapshot(row.settings) ||
        row.settings.visibleProductType !== row.product_context_key,
    )
  ) {
    throw new Error('Stored recipe defaults failed validation.');
  }
  return rows;
}

export async function upsertUserRecipeDefault(
  ownerUserId: string,
  productContextKey: string,
  settings: ProfileSettingsSnapshot,
): Promise<void> {
  if (!supabase) return;
  const owner = await requireAuthenticatedOwner(ownerUserId);
  if (
    !VISIBLE_PRODUCT_TYPES.includes(productContextKey as never) ||
    !isProfileSettingsSnapshot(settings) ||
    settings.visibleProductType !== productContextKey
  ) {
    throw new Error('Recipe defaults failed validation.');
  }
  const { error } = await supabase.from(TABLE).upsert(
    {
      owner_user_id: owner,
      product_context_key: productContextKey,
      settings,
    },
    { onConflict: 'owner_user_id,product_context_key' },
  );
  if (error) throw new Error(error.message);
}
