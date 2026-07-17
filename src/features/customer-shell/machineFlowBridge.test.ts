/**
 * Machine-preference → customer-flow bridge (Slice B INTEGRATION §2 +
 * OWNER FINAL DECISION 2026-07-17).
 *
 * Pins with the REAL catalog machinery (no hand-invented records):
 *  1. a saved NC7 Scoop & Swirl answers the six-mode question with
 *     'ninja_swirl' and pre-answers the amount with the DERIVED 460 g —
 *     Machine Profile data takes PRECEDENCE over the mode-level 480 g preset
 *     (owner final decision);
 *  2. order: the derived grams are set AFTER the mode (selectServingMode
 *     clears a hand-set batch on Ninja modes);
 *  3. a record with defaultBatch 'none' applies the mode ONLY — the amount
 *     falls back to the editable mode preset (soft default, never a block);
 *  4. owner test 11: an in-progress flow (mode already chosen) is NEVER
 *     silently rewritten by `applyMachineRecordIfUnanswered`.
 */
import { describe, expect, it } from 'vitest';
import { createCustomerFlow, resolveBatch, setBatchGrams } from '@/features/customer-flow';
import { MACHINE_CATALOG_VERSION, NINJA_CREAMI_SCOOP_SWIRL_NC7 } from '@/features/machine-catalog';
import { buildMachinePreferenceRecord, type MachinePreferenceRecord } from '@/features/machine-onboarding';
import { applyMachineRecordIfUnanswered, applyMachineRecordToFlow } from './machineFlowBridge';

const nc7Record = (): MachinePreferenceRecord => {
  const record = buildMachinePreferenceRecord({
    profile: NINJA_CREAMI_SCOOP_SWIRL_NC7,
    isCustom: false,
    setAt: '2026-07-17T10:00:00.000Z',
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('NC7 must build a preference record');
  return record;
};

describe('applyMachineRecordToFlow — saved machine answers mode + amount', () => {
  it('applies NC7: ninja_swirl mode + the DERIVED 460 g (precedence over the 480 g preset)', () => {
    const record = nc7Record();
    expect(record.defaultBatch).toMatchObject({ kind: 'grams', grams: 460 });

    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), record);
    expect(flow.mode).toBe('ninja_swirl');
    expect(flow.explicitBatchGrams).toBe(460);

    const batch = resolveBatch(flow);
    expect(batch.satisfied).toBe(true);
    expect(batch.batchGrams).toBe(460); // machine-derived, explicit ('user') — not mode_ninja 480
    expect(batch.source).toBe('user');
  });

  it('sets the grams AFTER the mode — a pre-existing batch never survives the apply', () => {
    const dirty = setBatchGrams(createCustomerFlow({ text: 'wanilia' }), 999);
    const flow = applyMachineRecordToFlow(dirty, nc7Record());
    expect(flow.explicitBatchGrams).toBe(460);
  });

  it("a 'none' record applies the mode only — the amount falls back to the EDITABLE preset", () => {
    const record: MachinePreferenceRecord = { ...nc7Record(), defaultBatch: { kind: 'none' } };
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), record);
    expect(flow.mode).toBe('ninja_swirl');
    expect(flow.explicitBatchGrams).toBeNull();
    // Soft default (owner final decision: no blocks): the mode preset answers
    // until the user edits — source 'mode_ninja', not an invented machine value.
    const batch = resolveBatch(flow);
    expect(batch.satisfied).toBe(true);
    expect(batch.source).toBe('mode_ninja');
  });
});

describe('applyMachineRecordIfUnanswered — owner test 11 (no silent overwrites)', () => {
  it('applies to a flow whose mode question is still open', () => {
    const flow = applyMachineRecordIfUnanswered(createCustomerFlow({ text: 'wanilia' }), nc7Record());
    expect(flow.mode).toBe('ninja_swirl');
    expect(flow.explicitBatchGrams).toBe(460);
  });

  it('returns an in-progress flow UNCHANGED (same reference), keeping hand-set grams', () => {
    const inProgress = setBatchGrams(
      applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), nc7Record()),
      520,
    );
    const after = applyMachineRecordIfUnanswered(inProgress, nc7Record());
    expect(after).toBe(inProgress);
    expect(after.explicitBatchGrams).toBe(520);
  });
});
