/**
 * Customer-shell ↔ machine-preference bridge (Slice B INTEGRATION §2).
 *
 * Pure: applies a saved Home machine preference to the conversational flow.
 * The saved machine ANSWERS the six-mode question — `resolvedVisibleMode` is a
 * strict subset of the EXISTING `ServingModeId` union, so it feeds
 * `selectServingMode` directly (no new mode system). Its DERIVED
 * „Zalecany wsad PINGÜINO" pre-answers the amount. ORDER MATTERS:
 * `selectServingMode` clears a hand-set batch when a Ninja mode is involved,
 * so the batch is set AFTER the mode (test-pinned).
 *
 * Batch honesty (owner-visible tension, INTEGRATION §2): a machine record
 * whose `defaultBatch` is 'none' resolved to a Ninja mode must ASK the amount
 * — the mode-level 700/480 presets are six-mode-path behavior the owner batch
 * rule deliberately does not endorse for an unknown container. The shell uses
 * `machineBatchMustAsk` to keep the batch step a QUESTION in that case
 * (presentation-level; `customerFlow.ts` production behavior is untouched).
 */
import {
  isNinjaMode,
  selectServingMode,
  setBatchGrams,
  type CustomerFlowState,
} from '@/features/customer-flow';
import type { MachinePreferenceRecord } from '@/features/machine-onboarding';

/** Apply a saved machine to the flow: mode first, then the derived grams. */
export function applyMachineRecordToFlow(
  state: CustomerFlowState,
  record: MachinePreferenceRecord,
): CustomerFlowState {
  let next = selectServingMode(state, record.resolvedVisibleMode);
  if (record.defaultBatch.kind === 'grams') {
    next = setBatchGrams(next, record.defaultBatch.grams);
  }
  return next;
}

/**
 * True when the machine-path batch step must be rendered as a QUESTION:
 * the saved machine carries no derived grams, the resolved mode is a Ninja
 * mode (whose mode-level preset the owner rule does not endorse for an
 * unknown container), and the customer has not answered yet.
 */
export function machineBatchMustAsk(
  record: MachinePreferenceRecord | null,
  state: CustomerFlowState,
): boolean {
  if (record === null) return false;
  if (record.defaultBatch.kind !== 'none') return false;
  if (!isNinjaMode(state.mode)) return false;
  return state.explicitBatchGrams === null;
}
