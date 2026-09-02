import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import { getCurrentUser } from '@/services/auth';
import type {
  CatalogMarketPreferences,
  CatalogProductSearchHit,
  CatalogSubmissionResult,
} from '@/features/global-catalog/contracts';
import { aliasesForFamily } from '@/features/global-catalog/normalization';

const UNAVAILABLE = 'Global product catalog is not available in this build.';
const CATALOG_DEVICE_SIGNAL_KEY = 'pinguino_catalog_device_session_v1';

function currentCatalogDeviceSignal(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(CATALOG_DEVICE_SIGNAL_KEY);
    if (existing) return existing;
    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(CATALOG_DEVICE_SIGNAL_KEY, created);
    return created;
  } catch {
    return null;
  }
}

interface SearchRow {
  id: string;
  current_version_id: string | null;
  status: 'verified' | 'manual_unverified' | 'blocked';
  verification_method: 'automatic' | 'human' | 'manual_unverified' | 'blocked';
  display_name: string;
  original_name: string | null;
  original_language: string | null;
  brand: string | null;
  canonical_family: string | null;
  category: string | null;
  mapped_ingredient_id: string | null;
  markets: string[] | null;
  retailers: string[] | null;
  eans: string[] | null;
  aliases: string[] | null;
  favorite: boolean;
  recently_used_at: string | null;
  missing_fields: string[] | null;
  invalid_fields: string[] | null;
  public_data: Record<string, unknown> | null;
  private_price: number | null;
  private_currency: string | null;
}

const REQUIRED_TOPPING_FACTS = [
  'fat', 'protein', 'carbohydrate', 'salt', 'energyKcal',
] as const;

function hasCompleteLabelOnlyToppingFacts(publicData: Record<string, unknown> | null): boolean {
  const nutrition = publicData?.nutrition;
  if (!nutrition || typeof nutrition !== 'object') return false;
  const facts = nutrition as Record<string, unknown>;
  return facts.basis === 'per_100g'
    && typeof publicData?.ingredientsText === 'string' && publicData.ingredientsText.trim().length > 0
    && typeof publicData?.allergensText === 'string' && publicData.allergensText.trim().length > 0
    && REQUIRED_TOPPING_FACTS.every((key) => {
    const value = facts[key];
    return typeof value === 'number' && Number.isFinite(value);
  });
}

function mapSearchRow(row: SearchRow): CatalogProductSearchHit {
  const usable = row.status !== 'blocked';
  const nutrition = row.public_data?.nutrition;
  const nutritionBasis = nutrition && typeof nutrition === 'object'
    ? (nutrition as Record<string, unknown>).basis
    : null;
  return {
    id: row.id,
    currentVersionId: row.current_version_id,
    entityKind: 'commercial_product',
    status: row.status,
    displayName: row.display_name,
    originalName: row.original_name,
    originalLanguage: row.original_language,
    brand: row.brand,
    canonicalFamily: row.canonical_family,
    category: row.category,
    mappedIngredientId: row.mapped_ingredient_id,
    markets: row.markets ?? [],
    retailers: row.retailers ?? [],
    eans: row.eans ?? [],
    aliases: [...new Set([...(row.aliases ?? []), ...aliasesForFamily(row.canonical_family)])],
    favorite: row.favorite,
    recentlyUsedAt: row.recently_used_at,
    usableInBase: usable && Boolean(row.mapped_ingredient_id),
    // Label-only additions stay outside Base/Engine. Declared nutrition can
    // still feed product mass, cost and final-label preflight.
    usableAsTopping: usable && hasCompleteLabelOnlyToppingFacts(row.public_data),
    missingFields: row.missing_fields ?? [],
    invalidFields: [
      ...(row.invalid_fields ?? []),
      ...(nutritionBasis === 'per_100ml'
        ? ['nutrition_basis_per_100ml_requires_density_for_gram_topping']
        : []),
    ],
    verificationMethod: row.verification_method,
    publicData: row.public_data ?? {},
    privatePricePerKg: row.private_price,
    privatePriceCurrency: row.private_currency,
  };
}

export async function savePrivateCatalogProductPrice(input: {
  catalogProductId: string;
  pricePerKg: number;
  currency: string;
}): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required.');
  const { error } = await supabase.from('account_catalog_product_data').upsert({
    user_id: user.id,
    catalog_product_id: input.catalogProductId,
    private_price: input.pricePerKg,
    currency: input.currency,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,catalog_product_id' });
  if (error) throw new Error(error.message);
}

export async function resetPrivateCatalogProductPrice(catalogProductId: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required.');
  const { error } = await supabase
    .from('account_catalog_product_data')
    .update({ private_price: null, currency: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('catalog_product_id', catalogProductId);
  if (error) throw new Error(error.message);
}

export async function searchGlobalCatalog(input: {
  query: string;
  markets?: readonly string[];
  favoritesOnly?: boolean;
  limit?: number;
}): Promise<CatalogProductSearchHit[]> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.search', []);
  const { data, error } = await supabase.rpc('search_global_catalog', {
    p_query: input.query,
    p_market: [...(input.markets ?? [])],
    p_favorites_only: input.favoritesOnly ?? false,
    p_limit: input.limit ?? 100,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SearchRow[]).map(mapSearchRow);
}

export async function listCatalogFavorites(): Promise<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.favorites', []);
  const { data, error } = await supabase
    .from('global_catalog_favorites')
    .select('entity_kind,catalog_product_id,mapper_ingredient_id');
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const entityKind = row.entity_kind as 'pi_base' | 'commercial_product';
    const id = entityKind === 'pi_base' ? row.mapper_ingredient_id : row.catalog_product_id;
    return typeof id === 'string' ? [{ entityKind, id }] : [];
  });
}

export async function listCatalogRecent(): Promise<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.recent', []);
  const { data, error } = await supabase
    .from('global_catalog_recent_usage')
    .select('entity_kind,catalog_product_id,mapper_ingredient_id')
    .order('last_used_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const entityKind = row.entity_kind as 'pi_base' | 'commercial_product';
    const id = entityKind === 'pi_base' ? row.mapper_ingredient_id : row.catalog_product_id;
    return typeof id === 'string' ? [{ entityKind, id }] : [];
  });
}

export async function setCatalogFavorite(input: {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
  favorite: boolean;
}): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Musisz być zalogowany, aby zmienić Ulubione.');
  const key = input.entityKind === 'pi_base' ? 'mapper_ingredient_id' : 'catalog_product_id';
  if (!input.favorite) {
    const { error } = await supabase
      .from('global_catalog_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq(key, input.id);
    if (error) throw new Error(error.message);
    return;
  }
  const payload = {
    user_id: user.id,
    entity_key: `${input.entityKind === 'pi_base' ? 'pi' : 'catalog'}:${input.id}`,
    entity_kind: input.entityKind,
    catalog_product_id: input.entityKind === 'commercial_product' ? input.id : null,
    mapper_ingredient_id: input.entityKind === 'pi_base' ? input.id : null,
  };
  const { error } = await supabase
    .from('global_catalog_favorites')
    .upsert(payload, { onConflict: 'user_id,entity_key' });
  if (error) throw new Error(error.message);
}

export async function markCatalogProductUsed(input: {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
}): Promise<void> {
  if (!supabase) return;
  const user = await getCurrentUser();
  if (!user) return;
  const commercial = input.entityKind === 'commercial_product';
  const { error } = await supabase.from('global_catalog_recent_usage').upsert(
    {
      user_id: user.id,
      entity_key: `${commercial ? 'catalog' : 'pi'}:${input.id}`,
      entity_kind: input.entityKind,
      catalog_product_id: commercial ? input.id : null,
      mapper_ingredient_id: commercial ? null : input.id,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,entity_key' },
  );
  if (error) throw new Error(error.message);
}

export const DEFAULT_CATALOG_MARKET_PREFERENCES: CatalogMarketPreferences = {
  primaryMarket: null,
  additionalMarkets: [],
  preferredRetailers: [],
  defaultScope: 'my_markets_and_global',
};

export async function getCatalogMarketPreferences(): Promise<CatalogMarketPreferences> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.marketPreferences', DEFAULT_CATALOG_MARKET_PREFERENCES);
  const user = await getCurrentUser();
  if (!user) return DEFAULT_CATALOG_MARKET_PREFERENCES;
  const { data, error } = await supabase
    .from('account_product_market_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_CATALOG_MARKET_PREFERENCES;
  return {
    primaryMarket: data.primary_market ?? null,
    additionalMarkets: data.additional_markets ?? [],
    preferredRetailers: data.preferred_retailers ?? [],
    defaultScope: data.default_scope,
  } as CatalogMarketPreferences;
}

export async function saveCatalogMarketPreferences(preferences: CatalogMarketPreferences): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Musisz być zalogowany, aby zapisać rynki produktów.');
  const additional = [...new Set(preferences.additionalMarkets.filter((value) => value && value !== preferences.primaryMarket))];
  const { error } = await supabase.from('account_product_market_preferences').upsert({
    user_id: user.id,
    primary_market: preferences.primaryMarket,
    additional_markets: additional,
    preferred_retailers: [...new Set(preferences.preferredRetailers.filter(Boolean))],
    default_scope: preferences.defaultScope,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export async function submitOwnedOcrProductToGlobalCatalog(input: {
  privateProductId: string;
  ocrSessionId: string;
  idempotencyKey: string;
  market?: string | null;
  retailer?: string | null;
  packageLanguage?: string | null;
  duplicateDecision?: 'same' | 'different' | null;
  distinguishingEvidence?: Record<string, unknown>;
  deviceSignal?: string | null;
  riskChallengeToken?: string | null;
  resumeBlocked?: boolean;
}): Promise<CatalogSubmissionResult> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('catalog-submit', {
    body: {
      privateProductId: input.privateProductId,
      ocrSessionId: input.ocrSessionId,
      idempotencyKey: input.idempotencyKey,
      market: input.market ?? null,
      retailer: input.retailer ?? null,
      packageLanguage: input.packageLanguage ?? null,
      duplicateDecision: input.duplicateDecision ?? null,
      distinguishingEvidence: input.distinguishingEvidence ?? {},
      // Private session-scoped abuse signal. The Edge function HMACs it before
      // persistence; raw device/session values never enter the shared catalog.
      deviceSignal: input.deviceSignal ?? currentCatalogDeviceSignal(),
      riskChallengeToken: input.riskChallengeToken ?? null,
      resumeBlocked: input.resumeBlocked === true,
    },
  });
  if (error) throw new Error(error.message);
  return data as CatalogSubmissionResult;
}

export function catalogSubmissionMessage(result: CatalogSubmissionResult): string | null {
  if (result.kind !== 'rate_limited') return null;
  const retry = result.retryAt ? new Date(result.retryAt).toLocaleString('pl-PL') : null;
  if (result.challengeRequired) {
    return retry
      ? `Zbyt wiele prób. Potwierdź, że nie jesteś robotem, albo spróbuj ponownie po ${retry}.`
      : 'Zbyt wiele prób. Potwierdź, że nie jesteś robotem, aby kontynuować.';
  }
  return retry
    ? `Zbyt wiele prób. Spróbuj ponownie po ${retry}.`
    : 'To zgłoszenie zostało już niedawno przetworzone.';
}
