/**
 * Product profiles — recipe directions, NOT engines (Step 6A).
 *
 * A product profile picks the engine CATEGORY, the default product MODE and the
 * Premium-Taste-First hero policy. All calculation still runs on the active
 * −11°C Engine (see engines.ts). Where the engine has no dedicated band yet
 * (granita, protein) we map to the nearest category and carry a calm pending
 * note — never faking a dedicated profile.
 */
import type { ProductCategory, ProductMode } from '@/engine';

export type ProductProfileId = 'gelato' | 'sorbet' | 'granita' | 'vegan' | 'protein';

export interface ProductProfile {
  id: ProductProfileId;
  engineCategory: ProductCategory;
  defaultMode: ProductMode;
  /** Premium Taste First: a technically-safe hero ingredient is protected. */
  heroProtected: boolean;
  /** No animal-derived ingredients. */
  vegan: boolean;
  /** Calm note shown when the engine has no dedicated band/profile for this direction yet. */
  pendingNote?: string;
}

export const PRODUCT_PROFILES: readonly ProductProfile[] = [
  { id: 'gelato', engineCategory: 'milk_gelato', defaultMode: 'classic', heroProtected: false, vegan: false },
  { id: 'sorbet', engineCategory: 'sorbet', defaultMode: 'premium', heroProtected: true, vegan: false },
  {
    id: 'granita',
    engineCategory: 'sorbet',
    defaultMode: 'classic',
    heroProtected: false,
    vegan: false,
    // Granita is intentionally icy/crystalline, not creamy. TODO(future): a
    // dedicated granita texture target; for now it uses the sorbet base.
    pendingNote: 'Granita uses the sorbet base for now — a dedicated crystalline-texture profile is planned.',
  },
  { id: 'vegan', engineCategory: 'vegan_gelato', defaultMode: 'classic', heroProtected: false, vegan: true },
  {
    id: 'protein',
    engineCategory: 'milk_gelato',
    defaultMode: 'premium',
    heroProtected: false,
    vegan: false,
    // TODO(future): a dedicated higher-protein target band; for now it uses the milk base.
    pendingNote: 'Higher-protein balancing uses the milk base for now — a dedicated protein profile is planned.',
  },
];

/** Display order for the product-type choice chips. */
export const PRODUCT_PROFILE_ORDER: readonly ProductProfileId[] = [
  'gelato',
  'sorbet',
  'granita',
  'vegan',
  'protein',
];

export const findProductProfile = (id: ProductProfileId): ProductProfile =>
  PRODUCT_PROFILES.find((profile) => profile.id === id)!;
