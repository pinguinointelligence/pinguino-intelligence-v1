import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import { getCurrentUser } from '@/services/auth';
import type {
  CatalogMarketPreferences,
  DuplicateCandidate,
  CatalogProductSearchHit,
  CatalogSubmissionResult,
} from '@/features/global-catalog/contracts';
import { ingestProduct } from '@/services/productIngest';

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
  entity_kind: 'pi_base' | 'commercial_product';
  status: 'pi_base' | 'verified' | 'manual_unverified' | 'blocked';
  verification_method:
    | 'pi_base'
    | 'mapper_verified'
    | 'mapper_estimated'
    | 'mapper_needs_label_review'
    | 'mapper_other'
    | 'automatic'
    | 'human'
    | 'manual_unverified'
    | 'blocked';
  provenance: string | null;
  display_name: string;
  original_name: string | null;
  original_language: string | null;
  brand: string | null;
  canonical_family: string | null;
  category: string | null;
  product_form: string | null;
  mapped_ingredient_id: string | null;
  markets: string[] | null;
  retailers: string[] | null;
  eans: string[] | null;
  aliases: string[] | null;
  favorite: boolean;
  recently_used_at: string | null;
  usable_in_base: boolean;
  main_allowed: boolean;
  usable_as_topping: boolean;
  blocked_reason: string | null;
  missing_fields: string[] | null;
  invalid_fields: string[] | null;
  public_data: Record<string, unknown> | null;
  private_price: number | null;
  private_currency: string | null;
  relevance: number | string;
}

interface DuplicatePreviewRow {
  product_id: string;
  strength: 'exact' | 'likely' | 'none';
  score: number | string;
  reasons: string[] | null;
  display_name: string | null;
  brand: string | null;
  net_quantity: string | null;
  market: string | null;
  ean: string | null;
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
  const nutrition = row.public_data?.nutrition;
  const nutritionBasis = nutrition && typeof nutrition === 'object'
    ? (nutrition as Record<string, unknown>).basis
    : null;
  return {
    id: row.id,
    currentVersionId: row.current_version_id,
    entityKind: row.entity_kind,
    status: row.status,
    provenance: row.provenance,
    displayName: row.display_name,
    originalName: row.original_name,
    originalLanguage: row.original_language,
    brand: row.brand,
    canonicalFamily: row.canonical_family,
    category: row.category,
    productForm: row.product_form,
    mappedIngredientId: row.mapped_ingredient_id,
    markets: row.markets ?? [],
    retailers: row.retailers ?? [],
    eans: row.eans ?? [],
    aliases: [...new Set(row.aliases ?? [])],
    favorite: row.favorite,
    recentlyUsedAt: row.recently_used_at,
    usableInBase: row.usable_in_base,
    mainAllowed: row.main_allowed,
    // Label-only additions stay outside Base/Engine. Declared nutrition can
    // still feed product mass, cost and final-label preflight.
    usableAsTopping: row.entity_kind === 'pi_base' || row.mapped_ingredient_id
      ? row.usable_as_topping
      : row.usable_as_topping && hasCompleteLabelOnlyToppingFacts(row.public_data),
    blockedReason: row.blocked_reason,
    relevance: Number(row.relevance),
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
  const { error } = await supabase.from('user_product_relations').upsert({
    user_id: user.id,
    product_id: input.catalogProductId,
    private_price: input.pricePerKg,
    currency: input.currency,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id' });
  if (error) throw new Error(error.message);
}

export async function resetPrivateCatalogProductPrice(catalogProductId: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required.');
  const { error } = await supabase
    .from('user_product_relations')
    .update({ private_price: null, currency: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('product_id', catalogProductId);
  if (error) throw new Error(error.message);
}

export async function searchProducts(input: {
  query: string;
  context: 'BASE' | 'TOPPING';
  marketScope?: 'my_markets' | 'my_markets_and_global' | 'global' | 'strict_market';
  selectedMarkets?: readonly string[];
  favoritesOnly?: boolean;
  productProfile?: string | null;
  entityKind?: 'pi_base' | 'commercial_product' | null;
  limit?: number;
  cursor?: number;
}): Promise<CatalogProductSearchHit[]> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.searchProducts', []);
  const { data, error } = await supabase.rpc('search_products_v1', {
    p_query: input.query,
    p_context: input.context,
    p_market_scope: input.marketScope ?? 'my_markets_and_global',
    p_selected_markets: [...(input.selectedMarkets ?? [])],
    p_favorites_only: input.favoritesOnly ?? false,
    p_product_profile: input.productProfile ?? null,
    p_entity_kind: input.entityKind ?? null,
    p_limit: input.limit ?? 100,
    p_cursor: input.cursor ?? 0,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SearchRow[]).map(mapSearchRow);
}

export async function previewProductDuplicates(facts: {
  displayName: string | null;
  brand: string | null;
  packageSize: string | null;
  ean: string | null;
  ingredientsText: string | null;
  nutrition: Record<string, unknown> | null;
  imagePhashes: string[];
}): Promise<DuplicateCandidate[]> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.previewDuplicates', []);
  const { data, error } = await supabase.rpc('preview_product_duplicates_v1', {
    p_facts: facts,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DuplicatePreviewRow[]).map((row) => ({
    productId: row.product_id,
    strength: row.strength,
    score: Number(row.score),
    reasons: row.reasons ?? [],
    displayName: row.display_name,
    brand: row.brand,
    netQuantity: row.net_quantity,
    market: row.market,
    ean: row.ean,
  }));
}

export async function listCatalogFavorites(): Promise<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.favorites', []);
  const { data, error } = await supabase
    .from('global_catalog_favorites')
    .select('entity_kind,catalog_product_id,mapper_ingredient_id')
    .eq('entity_kind', 'pi_base');
  if (error) throw new Error(error.message);
  const pi = (data ?? []).flatMap((row) => {
    const entityKind = row.entity_kind as 'pi_base' | 'commercial_product';
    const id = entityKind === 'pi_base' ? row.mapper_ingredient_id : row.catalog_product_id;
    return typeof id === 'string' ? [{ entityKind, id }] : [];
  });
  const { data: commercial, error: commercialError } = await supabase
    .from('user_product_relations')
    .select('product_id')
    .eq('favorite', true);
  if (commercialError) throw new Error(commercialError.message);
  return [
    ...pi,
    ...(commercial ?? []).map((row) => ({ entityKind: 'commercial_product' as const, id: row.product_id })),
  ];
}

/** Recipe-picker relation source. It deliberately never reads commercial
 * product relations, so an old owner/custom favorite cannot become a product
 * record in the active ingredient catalog. */
export async function listCurrentMapperCatalogFavorites(): Promise<Array<{ entityKind: 'pi_base'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.mapperFavorites', []);
  const { data, error } = await supabase
    .from('global_catalog_favorites')
    .select('mapper_ingredient_id')
    .eq('entity_kind', 'pi_base');
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) =>
    typeof row.mapper_ingredient_id === 'string'
      ? [{ entityKind: 'pi_base' as const, id: row.mapper_ingredient_id }]
      : [],
  );
}

export async function listCatalogRecent(): Promise<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.recent', []);
  const { data, error } = await supabase
    .from('global_catalog_recent_usage')
    .select('entity_kind,catalog_product_id,mapper_ingredient_id')
    .eq('entity_kind', 'pi_base')
    .order('last_used_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const pi = (data ?? []).flatMap((row) => {
    const entityKind = row.entity_kind as 'pi_base' | 'commercial_product';
    const id = entityKind === 'pi_base' ? row.mapper_ingredient_id : row.catalog_product_id;
    return typeof id === 'string' ? [{ entityKind, id }] : [];
  });
  const { data: commercial, error: commercialError } = await supabase
    .from('user_product_relations')
    .select('product_id,recently_used_at')
    .not('recently_used_at', 'is', null)
    .order('recently_used_at', { ascending: false })
    .limit(100);
  if (commercialError) throw new Error(commercialError.message);
  return [
    ...pi,
    ...(commercial ?? []).map((row) => ({ entityKind: 'commercial_product' as const, id: row.product_id })),
  ];
}

/** Same fail-closed source rule as favorites: recents rank current Mapper rows;
 * they never carry or hydrate a historical product snapshot. */
export async function listCurrentMapperCatalogRecent(): Promise<Array<{ entityKind: 'pi_base'; id: string }>> {
  if (!supabase) return emptyUnconfiguredRead('globalCatalog.mapperRecent', []);
  const { data, error } = await supabase
    .from('global_catalog_recent_usage')
    .select('mapper_ingredient_id')
    .eq('entity_kind', 'pi_base')
    .order('last_used_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) =>
    typeof row.mapper_ingredient_id === 'string'
      ? [{ entityKind: 'pi_base' as const, id: row.mapper_ingredient_id }]
      : [],
  );
}

export async function setCatalogFavorite(input: {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
  favorite: boolean;
}): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('Musisz być zalogowany, aby zmienić Ulubione.');
  if (input.entityKind === 'commercial_product') {
    const { error } = await supabase.from('user_product_relations').upsert({
      user_id: user.id,
      product_id: input.id,
      favorite: input.favorite,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id' });
    if (error) throw new Error(error.message);
    return;
  }
  const key = 'mapper_ingredient_id';
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
    entity_key: `pi:${input.id}`,
    entity_kind: input.entityKind,
    catalog_product_id: null,
    mapper_ingredient_id: input.id,
  };
  const { error } = await supabase
    .from('global_catalog_favorites')
    .upsert(payload, { onConflict: 'user_id,entity_key' });
  if (error) throw new Error(error.message);
}

export async function setCurrentMapperCatalogFavorite(input: {
  id: string;
  favorite: boolean;
}): Promise<void> {
  return setCatalogFavorite({ entityKind: 'pi_base', ...input });
}

export async function markCatalogProductUsed(input: {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
}): Promise<void> {
  if (!supabase) return;
  const user = await getCurrentUser();
  if (!user) return;
  const commercial = input.entityKind === 'commercial_product';
  if (commercial) {
    const { error } = await supabase.from('user_product_relations').upsert({
      user_id: user.id,
      product_id: input.id,
      recently_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id' });
    if (error) throw new Error(error.message);
    return;
  }
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

export async function markCurrentMapperCatalogProductUsed(id: string): Promise<void> {
  return markCatalogProductUsed({ entityKind: 'pi_base', id });
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
  return ingestProduct({
    source: 'ocr',
    idempotencyKey: input.idempotencyKey,
    // Compatibility input for an intake session saved before the canonical-root
    // migration. The Edge adapter loads this owned row and passes normalized facts
    // to ingest_product_v1; it never creates a second catalog identity.
    input: { legacyPrivateProductId: input.privateProductId },
    productId: input.privateProductId,
    ocrSessionId: input.ocrSessionId,
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
  });
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
