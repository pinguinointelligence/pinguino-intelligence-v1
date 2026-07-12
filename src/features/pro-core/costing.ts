/**
 * PINGÜINO PRO CORE — costing domain (PURE, deterministic, no IO/SDK).
 *
 * Turns a user purchase entry into an honest `cost_per_kg`, resolves the current price for an
 * ingredient (effective/expiry aware), and freezes a recipe/production cost snapshot. Safe
 * conversions ONLY: g↔kg, ml/l→mass via an explicit density, unit/package→mass via an explicit
 * unit weight. It NEVER converts between currencies, NEVER guesses a VAT rate, and NEVER assumes a
 * mass↔volume relationship without a density. All functions are pure and never mutate their input.
 */
import type {
  CostBasis,
  CostEntry,
  CostResolution,
  CostSnapshotLine,
  CostState,
  PurchaseUnit,
  RecipeCostSnapshot,
} from './costContracts';

export type KgResult = { ok: true; kg: number } | { ok: false; missing: CostState };

export interface ConvertContext {
  densityGPerMl?: number | null;
  unitWeightG?: number | null;
  unitsPerPackage?: number | null;
}

/** Convert a purchase quantity to kilograms using ONLY safe, explicit conversions. */
export function toKilograms(quantity: number, unit: PurchaseUnit, ctx: ConvertContext = {}): KgResult {
  if (!(quantity > 0)) return { ok: false, missing: 'invalid' };
  switch (unit) {
    case 'g':
      return { ok: true, kg: quantity / 1000 };
    case 'kg':
      return { ok: true, kg: quantity };
    case 'ml':
    case 'l': {
      const ml = unit === 'l' ? quantity * 1000 : quantity;
      const d = ctx.densityGPerMl;
      if (d == null || !(d > 0)) return { ok: false, missing: 'needs_density' };
      return { ok: true, kg: (ml * d) / 1000 };
    }
    case 'unit': {
      const w = ctx.unitWeightG;
      if (w == null || !(w > 0)) return { ok: false, missing: 'needs_unit_weight' };
      return { ok: true, kg: (quantity * w) / 1000 };
    }
    case 'package': {
      const w = ctx.unitWeightG;
      const per = ctx.unitsPerPackage;
      if (w == null || !(w > 0)) return { ok: false, missing: 'needs_unit_weight' };
      if (per == null || !(per > 0)) return { ok: false, missing: 'needs_units_per_package' };
      return { ok: true, kg: (quantity * per * w) / 1000 };
    }
  }
}

const STATE_REASON: Record<CostState, string> = {
  known: 'ok',
  unknown: 'No cost entry for this ingredient.',
  currency_mismatch: 'Cost entry is in a different currency; currencies are never converted.',
  needs_density: 'Costing a volume purchase needs an explicit density (g/ml).',
  needs_unit_weight: 'Costing a unit/package purchase needs an explicit unit weight (g).',
  needs_units_per_package: 'Costing a package purchase needs the number of units per package.',
  needs_tax_rate: 'Converting between net and gross needs an explicit tax rate; it is never guessed.',
  invalid: 'The purchase quantity must be greater than zero.',
};

const fail = (ingredientId: string, currency: string, basis: CostBasis, state: CostState, entryId: string | null): CostResolution => ({
  ingredientId,
  costPerKg: null,
  currency,
  basis,
  state,
  reason: STATE_REASON[state],
  entryId,
});

export interface ResolveOptions {
  targetCurrency: string;
  basis: CostBasis;
}

/**
 * Resolve `cost_per_kg` for a single entry at a requested currency + basis. Same currency only
 * (never converted). Net↔gross needs an explicit tax rate — never guessed.
 */
export function resolveEntryCostPerKg(entry: CostEntry, options: ResolveOptions): CostResolution {
  const { targetCurrency, basis } = options;
  if (entry.currency !== targetCurrency) {
    return fail(entry.ingredientId, targetCurrency, basis, 'currency_mismatch', entry.entryId);
  }
  const kg = toKilograms(entry.purchaseQuantity, entry.purchaseUnit, {
    densityGPerMl: entry.densityGPerMl,
    unitWeightG: entry.unitWeightG,
    unitsPerPackage: entry.unitsPerPackage,
  });
  if (!kg.ok) return fail(entry.ingredientId, targetCurrency, basis, kg.missing, entry.entryId);

  const entryBasis: CostBasis = entry.priceIncludesTax ? 'gross' : 'net';
  let amount: number;
  if (basis === entryBasis) {
    amount = entry.price;
  } else if (entry.taxRatePercent == null) {
    return fail(entry.ingredientId, targetCurrency, basis, 'needs_tax_rate', entry.entryId);
  } else {
    const factor = 1 + entry.taxRatePercent / 100;
    amount = basis === 'net' ? entry.price / factor : entry.price * factor;
  }
  return {
    ingredientId: entry.ingredientId,
    costPerKg: amount / kg.kg,
    currency: targetCurrency,
    basis,
    state: 'known',
    reason: 'ok',
    entryId: entry.entryId,
  };
}

/**
 * The entry in effect for an ingredient as of `asOf` (ISO date): effectiveFrom ≤ asOf and not
 * expired (expiresAt is exclusive). The newest effective entry wins, tie-broken by createdAt then
 * entryId — fully deterministic. Returns null when no entry applies.
 */
export function selectCurrentEntry(
  entries: readonly CostEntry[],
  ingredientId: string,
  asOf: string,
): CostEntry | null {
  const applicable = entries.filter(
    (e) => e.ingredientId === ingredientId && e.effectiveFrom <= asOf && (e.expiresAt == null || asOf < e.expiresAt),
  );
  if (applicable.length === 0) return null;
  return applicable.reduce((best, e) => {
    if (e.effectiveFrom !== best.effectiveFrom) return e.effectiveFrom > best.effectiveFrom ? e : best;
    if (e.createdAt !== best.createdAt) return e.createdAt > best.createdAt ? e : best;
    return e.entryId > best.entryId ? e : best;
  });
}

/** Resolve cost_per_kg for each requested ingredient from the owner's entries (as of a date). */
export function resolveIngredientCosts(
  entries: readonly CostEntry[],
  ingredientIds: readonly string[],
  options: ResolveOptions & { asOf: string },
): CostResolution[] {
  return ingredientIds.map((id) => {
    const entry = selectCurrentEntry(entries, id, options.asOf);
    if (!entry) return fail(id, options.targetCurrency, options.basis, 'unknown', null);
    return resolveEntryCostPerKg(entry, options);
  });
}

/* ── immutable cost snapshot ──────────────────────────────────────────────────── */

export interface SnapshotLineInput {
  ingredientId: string;
  ingredientName: string;
  grams: number;
}

export interface BuildSnapshotInput {
  snapshotId: string;
  recipeId: string;
  recipeVersionId: string;
  productionRunId?: string | null;
  currency: string;
  basis: CostBasis;
  lines: SnapshotLineInput[];
  resolutions: readonly CostResolution[];
  engineVersion: string;
  configVersion: string;
  resolvedAt: string;
  createdBy: string;
}

/**
 * Freeze a recipe/production cost snapshot. Each line's cost = grams/1000 × cost_per_kg (when
 * known). The snapshot is complete only when every line resolved; otherwise money fields are null
 * and the missing ingredient ids are listed — a missing cost is never silently treated as 0. The
 * result is a deep copy, so a later change to entries or resolutions can never mutate it.
 */
export function buildRecipeCostSnapshot(input: BuildSnapshotInput): RecipeCostSnapshot {
  const byId = new Map(input.resolutions.map((r) => [r.ingredientId, r]));
  const lines: CostSnapshotLine[] = input.lines.map((l) => {
    const res = byId.get(l.ingredientId);
    const costPerKg = res?.state === 'known' ? res.costPerKg : null;
    return {
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      grams: l.grams,
      costPerKg,
      lineCost: costPerKg === null ? null : (l.grams / 1000) * costPerKg,
      state: res?.state ?? 'unknown',
    };
  });
  const missingIngredientIds = lines.filter((l) => l.state !== 'known').map((l) => l.ingredientId);
  const complete = missingIngredientIds.length === 0;
  const totalGrams = lines.reduce((sum, l) => sum + l.grams, 0);
  const totalCost = complete ? lines.reduce((sum, l) => sum + (l.lineCost ?? 0), 0) : null;
  const costPerKg = complete && totalGrams > 0 ? (totalCost! / totalGrams) * 1000 : null;

  // Deep clone so the frozen snapshot can never be mutated by a later caller.
  return JSON.parse(
    JSON.stringify({
      snapshotId: input.snapshotId,
      recipeId: input.recipeId,
      recipeVersionId: input.recipeVersionId,
      productionRunId: input.productionRunId ?? null,
      currency: input.currency,
      basis: input.basis,
      lines,
      totalCost,
      costPerKg,
      complete,
      missingIngredientIds,
      engineVersion: input.engineVersion,
      configVersion: input.configVersion,
      resolvedAt: input.resolvedAt,
      createdBy: input.createdBy,
    }),
  ) as RecipeCostSnapshot;
}
