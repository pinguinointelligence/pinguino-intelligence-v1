/**
 * Machine-preference → customer-flow bridge (Slice B INTEGRATION §2).
 *
 * Pins with the REAL catalog machinery (no hand-invented records):
 *  1. a saved NC7 Scoop & Swirl answers the six-mode question with
 *     'ninja_swirl' and pre-answers the amount with the DERIVED 460 g —
 *     overriding the mode-level 480 g preset (owner tension, documented);
 *  2. order: the derived grams are set AFTER the mode (selectServingMode
 *     clears a hand-set batch on Ninja modes — a pre-existing 999 g must not
 *     survive as the final answer);
 *  3. a record with defaultBatch 'none' applies the mode ONLY — and
 *     `machineBatchMustAsk` demands the batch QUESTION for Ninja modes until
 *     the customer answers (never the mode preset).
 */
import { describe, expect, it } from 'vitest';
import { createCustomerFlow, resolveBatch, setBatchGrams } from '@/features/customer-flow';
import { MACHINE_CATALOG_VERSION, NINJA_CREAMI_SCOOP_SWIRL_NC7 } from '@/features/machine-catalog';
import { buildMachinePreferenceRecord, type MachinePreferenceRecord } from '@/features/machine-onboarding';
import { applyMachineRecordToFlow, machineBatchMustAsk } from './machineFlowBridge';

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
  it('applies NC7: ninja_swirl mode + the DERIVED 460 g (not the 480 g mode preset)', () => {
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

  it("a 'none' record applies the mode only (no invented grams)", () => {
    const record: MachinePreferenceRecord = { ...nc7Record(), defaultBatch: { kind: 'none' } };
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), record);
    expect(flow.mode).toBe('ninja_swirl');
    expect(flow.explicitBatchGrams).toBeNull();
  });
});

describe('machineBatchMustAsk — the Ninja mode preset is never a machine answer', () => {
  const noneRecord = (): MachinePreferenceRecord => ({
    ...nc7Record(),
    defaultBatch: { kind: 'none' },
  });

  it('demands the batch QUESTION for a none-record on a Ninja mode', () => {
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), noneRecord());
    expect(machineBatchMustAsk(noneRecord(), flow)).toBe(true);
  });

  it('stops asking once the customer answers explicitly', () => {
    const flow = setBatchGrams(
      applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), noneRecord()),
      420,
    );
    expect(machineBatchMustAsk(noneRecord(), flow)).toBe(false);
  });

  it('never asks for derived-grams records or without a record', () => {
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), nc7Record());
    expect(machineBatchMustAsk(nc7Record(), flow)).toBe(false);
    expect(machineBatchMustAsk(null, flow)).toBe(false);
  });
});
