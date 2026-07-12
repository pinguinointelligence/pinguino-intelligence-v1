/**
 * PINGÜINO PRO CORE — ingredient cost + export contracts (types only, no IO/SDK).
 *
 * Costs are the user's OWN purchase data (a personal price list), keyed on the internal user id.
 * The engine's per-kg cost stage is reused unchanged; this layer only turns a purchase entry into
 * an honest `cost_per_kg`. It NEVER converts between currencies, never guesses
 * a VAT rate, and never converts mass↔volume without an explicit density. A recipe/production cost
 * snapshot is IMMUTABLE — a later price change produces a new snapshot; the historical one is frozen.
 */

/** Units a purchase can be measured in. Volume needs a density; unit/package need a unit weight. */
export type PurchaseUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit' | 'package';

/** Whether a resolved cost is net (tax-excluded) or gross (tax-included). */
export type CostBasis = 'net' | 'gross';

/** A single purchase record — what the user actually paid for a quantity of an ingredient. */
export interface CostEntry {
  entryId: string;
  ownerUserId: string;
  ingredientId: string;
  ingredientName: string;
  supplier: string | null;
  purchaseQuantity: number;
  purchaseUnit: PurchaseUnit;
  /** g/ml — required to cost a volume purchase (no mass↔volume assumption without it). */
  densityGPerMl: number | null;
  /** grams per single unit — required to cost a unit/package purchase. */
  unitWeightG: number | null;
  /** units per package — required to cost a package purchase. */
  unitsPerPackage: number | null;
  price: number;
  /** ISO 4217, e.g. 'EUR'. Never converted to another currency. */
  currency: string;
  /** True = `price` already includes tax (gross); false = net. */
  priceIncludesTax: boolean;
  /** Explicit VAT rate; null = unknown (never guessed). */
  taxRatePercent: number | null;
  /** ISO date the price becomes effective. */
  effectiveFrom: string;
  /** ISO date the price stops applying (exclusive); null = open-ended. */
  expiresAt: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

/** Why a cost could (not) be resolved for an ingredient — honest, never a fabricated number. */
export type CostState =
  | 'known'
  | 'unknown'
  | 'currency_mismatch'
  | 'needs_density'
  | 'needs_unit_weight'
  | 'needs_units_per_package'
  | 'needs_tax_rate'
  | 'invalid';

export interface CostResolution {
  ingredientId: string;
  costPerKg: number | null;
  currency: string;
  basis: CostBasis;
  state: CostState;
  reason: string;
  /** The entry the cost was resolved from (null when unknown). */
  entryId: string | null;
}

/** One immutable line of a cost snapshot. */
export interface CostSnapshotLine {
  ingredientId: string;
  ingredientName: string;
  grams: number;
  costPerKg: number | null;
  lineCost: number | null;
  state: CostState;
}

/** A frozen record of a recipe/production cost at one point in time. Never mutated afterward. */
export interface RecipeCostSnapshot {
  snapshotId: string;
  recipeId: string;
  recipeVersionId: string;
  /** Set when the snapshot is for a specific production run. */
  productionRunId: string | null;
  currency: string;
  basis: CostBasis;
  lines: CostSnapshotLine[];
  totalCost: number | null;
  costPerKg: number | null;
  /** True only when every line resolved to a known cost. */
  complete: boolean;
  missingIngredientIds: string[];
  engineVersion: string;
  configVersion: string;
  resolvedAt: string;
  createdBy: string;
}

/** Export capability (Track C). Demo cannot export; exact grams stay gated on canViewExactGrams. */
export interface ExportCapabilities {
  canExport: boolean;
  canViewExactGrams: boolean;
}
