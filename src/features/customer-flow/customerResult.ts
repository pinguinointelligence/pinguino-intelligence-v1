/**
 * Customer result assembly (pure) — the REAL recipe the public card shows.
 *
 * Replaces the hardcoded preview skeleton: the base lines and their grams come
 * from the REAL engine (`buildCustomerEngineRecipe` → `calculateRecipe`) when a
 * safe reference template exists; the flavor requirements are the customer's
 * unresolved chips (resolved later via the picker). Nothing is faked:
 *  - `calculated` / `calculated_out_of_band`: real engine grams + real metrics;
 *  - `structure_only`: honest structure with NO grams (never fixture numbers).
 *
 * Display names + Demo redaction are the shell's job (this module carries engine
 * ids + grams + resolution only). Pure: no IO, no persistence.
 */
import type { RecipeInput } from '@/engine';
import { buildCustomerEngineRecipe, type CustomerEngineReason } from './customerEngineRecipe';
import { activeFlavorChips, isRecognizedFlavorTag, resolveProductType } from './customerFlow';
import type { CustomerFlowState } from './customerFlow';
import { buildCustomerRecipeStructure, type LineResolution } from './recipeStructure';
import { CHOCOLATE_FLAVOR_TAGS, type CustomerProductType } from './types';

export type CustomerResultState = 'calculated' | 'calculated_out_of_band' | 'structure_only';

export interface CustomerResultLine {
  /** Engine ingredient id (base line) or `flavor:<tag>` (flavor requirement). */
  id: string;
  role: 'base' | 'flavor';
  /** Real engine grams for a calculated base line; null for flavors / structure-only. */
  grams: number | null;
  resolution: LineResolution;
}

export interface CustomerResultMetrics {
  pod: number | null;
  npac: number | null;
  iceFractionPercent: number | null;
  /** True when the real engine result has no hard-gate violation. */
  inBand: boolean;
}

export interface CustomerResult {
  state: CustomerResultState;
  /** True only when a real `calculateRecipe` result backs the base lines. */
  calculated: boolean;
  reason: CustomerEngineReason;
  productType: CustomerProductType;
  lines: CustomerResultLine[];
  /** Real engine metrics, or null when not calculated. */
  metrics: CustomerResultMetrics | null;
  /** The real RecipeInput (for Monitor PI recalculation), or null. */
  recipeInput: RecipeInput | null;
}

/** Flavor requirement lines from the active chips, minus any chip realized by the base. */
function flavorLines(state: CustomerFlowState, intrinsic: ReadonlySet<string>): CustomerResultLine[] {
  return activeFlavorChips(state)
    .filter((tag) => !intrinsic.has(tag))
    .map((tag) => ({
      id: `flavor:${tag}`,
      role: 'flavor' as const,
      grams: null,
      resolution: (isRecognizedFlavorTag(tag) ? 'needs_dose' : 'needs_ingredient') as LineResolution,
    }));
}

/**
 * Assemble the customer result. A chocolate profile realizes the chocolate flavor
 * in its base (so it is not repeated as an unresolved flavor line).
 */
export function buildCustomerResult(state: CustomerFlowState): CustomerResult {
  const type = resolveProductType(state);
  const productType: CustomerProductType = type.userFacingType ?? 'gelato';
  const engine = buildCustomerEngineRecipe(state);

  if (engine.calculated && engine.draft?.recipeInput && engine.draft.enginePreview) {
    const preview = engine.draft.enginePreview;
    // The chocolate base intrinsically realizes the chocolate flavor family.
    const intrinsic = type.internalProfile === 'chocolate_gelato' ? CHOCOLATE_FLAVOR_TAGS : new Set<string>();
    const baseLines: CustomerResultLine[] = engine.draft.ingredients.map((i) => ({
      id: i.id,
      role: 'base',
      grams: Math.round(i.grams),
      resolution: 'resolved',
    }));
    return {
      state: preview.optimizationRecommended ? 'calculated_out_of_band' : 'calculated',
      calculated: true,
      reason: 'ok',
      productType,
      lines: [...baseLines, ...flavorLines(state, intrinsic)],
      metrics: {
        pod: preview.podPoints,
        npac: preview.npacPoints,
        iceFractionPercent: preview.iceFractionPercent,
        inBand: preview.inBand,
      },
      recipeInput: engine.draft.recipeInput,
    };
  }

  // Not calculated → honest structure only (NO grams — never a fixture number).
  const structure = buildCustomerRecipeStructure(state);
  const baseLines: CustomerResultLine[] = structure.lines
    .filter((l) => l.role === 'base')
    .map((l) => ({ id: l.id, role: 'base', grams: null, resolution: 'resolved' }));
  return {
    state: 'structure_only',
    calculated: false,
    reason: engine.reason,
    productType,
    lines: [...baseLines, ...flavorLines(state, new Set<string>())],
    metrics: null,
    recipeInput: null,
  };
}
