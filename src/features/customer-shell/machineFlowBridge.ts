/**
 * Customer-shell ↔ machine-preference bridge (Slice B INTEGRATION §2 +
 * OWNER FINAL DECISION 2026-07-17).
 *
 * Pure: applies a saved Home machine preference to the conversational flow.
 * The saved machine ANSWERS the six-mode question — `resolvedVisibleMode` is a
 * strict subset of the EXISTING `ServingModeId` union, so it feeds
 * `selectServingMode` directly (no new mode system). Its DERIVED
 * „Zalecany wsad PINGÜINO" pre-answers the amount as a SOFT starting proposal.
 * ORDER MATTERS: `selectServingMode` clears a hand-set batch when a Ninja mode
 * is involved, so the grams are set AFTER the mode (test-pinned) — this is
 * also how Machine Profile data takes PRECEDENCE over the mode-level 700/480
 * presets in `servingMode.ts` (owner final decision): the explicit grams win
 * in `resolveBatch` (source 'user'), while a record with NO derived grams
 * falls back to the editable mode preset — never a block, never a lock.
 *
 * Owner test 11 (no silent overwrites): `applyMachineRecordIfUnanswered` only
 * touches a flow whose mode question is still OPEN — a flow with a chosen
 * mode (and any hand-entered grams) passes through IDENTICALLY.
 */
import {
  selectServingMode,
  setBatchGrams,
  type CustomerFlowState,
} from '@/features/customer-flow';
import { effectiveDefaultBatchGrams, type MachinePreferenceRecord } from '@/features/machine-onboarding';

/**
 * Apply a saved machine to the flow: mode first, then the EFFECTIVE default
 * batch (owner hotfix §5 source order — the user's own saved default wins over
 * PINGÜINO's recommendation; neither present → the legacy mode preset).
 */
export function applyMachineRecordToFlow(
  state: CustomerFlowState,
  record: MachinePreferenceRecord,
): CustomerFlowState {
  let next = selectServingMode(state, record.resolvedVisibleMode);
  const grams = effectiveDefaultBatchGrams(record);
  if (grams !== null) next = setBatchGrams(next, grams);
  return next;
}

/**
 * Apply the saved machine ONLY when the mode question is still unanswered —
 * an in-progress flow (mode chosen, grams possibly hand-set) is returned
 * UNCHANGED (same reference), never silently rewritten (owner final decision).
 */
export function applyMachineRecordIfUnanswered(
  state: CustomerFlowState,
  record: MachinePreferenceRecord,
): CustomerFlowState {
  return state.mode === null ? applyMachineRecordToFlow(state, record) : state;
}
