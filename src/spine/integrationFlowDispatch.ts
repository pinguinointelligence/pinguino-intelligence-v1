/**
 * PINGUINO Spine — Integration Flow context dispatch (Phase C Slice 19).
 *
 * A PURE, thin dispatcher that connects the three execution contexts of the
 * locked Integration Flow to their routers:
 *   - `recipe_design`       → the existing `routeRecipeIntegrationFlow` (IF1–IF8)
 *   - `actual_batch_rescue` → `routeBatchRescue` (IF9, Slice 17)
 *   - `stock_shortage`      → `routeStockShortage` (IF10, Slice 18)
 *
 * Guarantees:
 *  - the DEFAULT recipe flow is unchanged: `recipe_design` calls the existing
 *    router verbatim (that module is not modified by this slice at all);
 *  - a context whose required payload is missing is `blocked_missing_data` —
 *    actual-batch data and stock data are NEVER silently inferred;
 *  - an unknown context is `not_supported` — never remapped;
 *  - inputs are never mutated; no DB, no Mapper, no persistence.
 */
import {
  routeBatchRescue,
  type BatchRescueIntent,
  type BatchRescueResult,
} from './batchRescueRouter';
import {
  routeRecipeIntegrationFlow,
  type IntegrationFlowInput,
  type IntegrationFlowResult,
} from './integrationFlowRouter';
import {
  routeStockShortage,
  type StockShortageIntent,
  type StockShortageResult,
} from './stockShortageRouter';
import { SPINE_CONTRACT_VERSION, type SpineContractVersion } from './types';

export type IntegrationFlowDispatchVersion = '0.1.0';
export const INTEGRATION_FLOW_DISPATCH_VERSION: IntegrationFlowDispatchVersion = '0.1.0';

/** The three locked execution contexts (Integration_Flow.md §16–§18). */
export type IntegrationFlowContext = 'recipe_design' | 'actual_batch_rescue' | 'stock_shortage';

export interface IntegrationFlowDispatchInput {
  /** Untrusted — an unknown context is `not_supported`, never remapped. */
  context: string;
  /** Required when context is `recipe_design`. */
  recipeDesign?: IntegrationFlowInput | null;
  /** Required when context is `actual_batch_rescue`. */
  batchRescue?: BatchRescueIntent | null;
  /** Required when context is `stock_shortage`. */
  stockShortage?: StockShortageIntent | null;
}

/** Which branch actually ran (or `none` when dispatch itself blocked). */
export type IntegrationFlowDispatchBranch = IntegrationFlowContext | 'none';

export interface IntegrationFlowDispatchResult {
  context: string;
  branch: IntegrationFlowDispatchBranch;
  /** Unified decision surface: the branch's own decision, or the dispatch block. */
  decision: string;
  recipeDesign: IntegrationFlowResult | null;
  batchRescue: BatchRescueResult | null;
  stockShortage: StockShortageResult | null;
  blockedReason: string | null;
  warnings: string[];
  trace: {
    dispatchVersion: IntegrationFlowDispatchVersion;
    payloadProvided: {
      recipeDesign: boolean;
      batchRescue: boolean;
      stockShortage: boolean;
    };
  };
  contractVersion: SpineContractVersion;
}

/**
 * Dispatch one Integration Flow request to its context branch. Pure and
 * deterministic; mutates nothing; infers nothing — a missing branch payload
 * blocks instead of being reconstructed from another context's data.
 */
export function dispatchIntegrationFlow(
  input: IntegrationFlowDispatchInput,
): IntegrationFlowDispatchResult {
  const base: Omit<IntegrationFlowDispatchResult, 'branch' | 'decision' | 'blockedReason'> = {
    context: input.context,
    recipeDesign: null,
    batchRescue: null,
    stockShortage: null,
    warnings: [],
    trace: {
      dispatchVersion: INTEGRATION_FLOW_DISPATCH_VERSION,
      payloadProvided: {
        recipeDesign: input.recipeDesign != null,
        batchRescue: input.batchRescue != null,
        stockShortage: input.stockShortage != null,
      },
    },
    contractVersion: SPINE_CONTRACT_VERSION,
  };

  switch (input.context) {
    case 'recipe_design': {
      if (!input.recipeDesign) {
        return { ...base, branch: 'none', decision: 'blocked_missing_data', blockedReason: 'missing_recipe_design_payload' };
      }
      const flow = routeRecipeIntegrationFlow(input.recipeDesign);
      return { ...base, branch: 'recipe_design', decision: flow.decision, recipeDesign: flow, blockedReason: null };
    }
    case 'actual_batch_rescue': {
      if (!input.batchRescue) {
        // Actual-batch data is never inferred from a recipe-design payload.
        return { ...base, branch: 'none', decision: 'blocked_missing_data', blockedReason: 'missing_batch_rescue_payload' };
      }
      const rescue = routeBatchRescue(input.batchRescue);
      return { ...base, branch: 'actual_batch_rescue', decision: rescue.decision, batchRescue: rescue, blockedReason: rescue.blockedReason };
    }
    case 'stock_shortage': {
      if (!input.stockShortage) {
        // Stock data is never inferred.
        return { ...base, branch: 'none', decision: 'blocked_missing_data', blockedReason: 'missing_stock_shortage_payload' };
      }
      const shortage = routeStockShortage(input.stockShortage);
      return { ...base, branch: 'stock_shortage', decision: shortage.decision, stockShortage: shortage, blockedReason: shortage.blockedReason };
    }
    default:
      return { ...base, branch: 'none', decision: 'not_supported', blockedReason: 'unknown_integration_flow_context' };
  }
}
