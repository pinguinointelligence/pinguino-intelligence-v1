import { describe, expect, it } from 'vitest';
import {
  activeFlavorChips,
  addFlavorChip,
  confirmDeviceCapacity,
  createCustomerFlow,
  detectedFlavorTags,
  flowStatus,
  nextQuestion,
  pendingQuestions,
  productTypeQuestion,
  removeFlavorChip,
  resolveBatch,
  resolveProductType,
  selectDevicePreset,
  setProductType,
} from './customerFlow';
import { parseBatchFromText } from './naturalLanguageBatch';
import { CUSTOMER_PRODUCT_TYPE_CHOICES } from './types';
import { classifyDeviceCapacity, type DevicePreset } from './devicePresets';
import {
  NINJA_CREAMI,
  NINJA_CREAMI_SCOOP_SWIRL,
  NINJA_CREAMI_DELUXE,
  PROFESSIONAL_MACHINE,
} from './__fixtures__/deviceFixtures';

describe('customer flow — product type never exposes chocolate', () => {
  it('the visible product-type question offers exactly gelato/sorbet/vegan/protein', () => {
    const q = productTypeQuestion();
    expect(q.choices.map((c) => c.value)).toEqual(['gelato', 'sorbet', 'vegan', 'protein']);
    expect(q.choices.some((c) => (c.value as string) === 'chocolate')).toBe(false);
    expect(CUSTOMER_PRODUCT_TYPE_CHOICES).not.toContain('chocolate' as never);
  });
});

/* Acceptance test (1) */
describe('(1) "Wanilia z dodatkiem bazylii i mięty"', () => {
  const state = createCustomerFlow({ text: 'Wanilia z dodatkiem bazylii i mięty' });

  it('recognizes the vanilla flavor and preserves the raw text', () => {
    expect(detectedFlavorTags(state)).toContain('vanilla');
    expect(activeFlavorChips(state)).toContain('vanilla');
    expect(state.rawText).toBe('Wanilia z dodatkiem bazylii i mięty');
  });

  it('asks the Gelato/Sorbet/Vegan/Protein question when the type is unknown', () => {
    expect(resolveProductType(state).status).toBe('unknown');
    expect(nextQuestion(state)).toBe('product_type');
    expect(productTypeQuestion().choices.map((c) => c.value)).toEqual([
      'gelato',
      'sorbet',
      'vegan',
      'protein',
    ]);
  });
});

/* Acceptance test (2) */
describe('(2) "Gelato czekoladowe z pomarańczą" — internal chocolate routing', () => {
  const state = createCustomerFlow({ text: 'Gelato czekoladowe z pomarańczą' });

  it('keeps the visible type Gelato while selecting the internal chocolate profile', () => {
    const r = resolveProductType(state);
    expect(r.status).toBe('resolved');
    expect(r.userFacingType).toBe('gelato');
    expect(r.internalProfile).toBe('chocolate_gelato');
    expect(r.engineCategory).toBe('chocolate_gelato');
    expect(r.chocolateRoutedInternally).toBe(true);
  });

  it('never asks the customer to choose Chocolate', () => {
    expect(pendingQuestions(state)).not.toContain('product_type');
    expect(nextQuestion(state)).not.toBe('product_type');
    expect(productTypeQuestion().choices.some((c) => (c.value as string) === 'chocolate')).toBe(false);
  });
});

/* Acceptance test (3) */
describe('(3) a VERIFIED device recipe mass auto-sets the batch and skips the question', () => {
  // No shipped device carries an owner-approved mass yet (all are 'missing'), so
  // a verified preset is constructed HERE in the test only — never invented into
  // the real device catalogue.
  const VERIFIED_TEST_DEVICE: DevicePreset = {
    id: 'test-verified-appliance',
    label: 'Test appliance (verified mass)',
    kind: 'appliance',
    containerCapacityMl: 473,
    targetRecipeMassG: 700,
    targetRecipeMassStatus: 'verified',
  };
  let state = createCustomerFlow({ text: 'wanilia' });
  state = setProductType(state, 'gelato');
  state = selectDevicePreset(state, VERIFIED_TEST_DEVICE);

  it('classifies the device as a verified recipe mass', () => {
    expect(classifyDeviceCapacity(VERIFIED_TEST_DEVICE)).toBe('verified_mass');
  });

  it('auto-sets the batch from the verified recipe mass', () => {
    const b = resolveBatch(state);
    expect(b.source).toBe('device_verified');
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
    expect(b.batchGrams).toBe(VERIFIED_TEST_DEVICE.targetRecipeMassG);
  });

  it('does not list batch or device confirmation as pending', () => {
    expect(pendingQuestions(state)).not.toContain('batch');
    expect(pendingQuestions(state)).not.toContain('device_capacity');
  });
});

/* Acceptance test (4) */
describe('(4) Professional machine, batch not supplied → asks batch', () => {
  let state = createCustomerFlow({ text: 'wanilia' });
  state = setProductType(state, 'gelato');
  state = selectDevicePreset(state, PROFESSIONAL_MACHINE);

  it('is a professional device with no auto batch and asks the batch question', () => {
    expect(PROFESSIONAL_MACHINE.kind).toBe('professional');
    expect(classifyDeviceCapacity(PROFESSIONAL_MACHINE)).toBe('unspecified');
    const b = resolveBatch(state);
    expect(b.source).toBe('none');
    expect(b.askBatch).toBe(true);
    expect(b.satisfied).toBe(false);
    expect(nextQuestion(state)).toBe('batch');
  });
});

/* Acceptance test (5) */
describe('(5) "Zrób 5 kg wanilii" — batch recognized, never asked again', () => {
  const state = createCustomerFlow({ text: 'Zrób 5 kg wanilii' });

  it('parses 5 kg as 5000 g from the text', () => {
    expect(parseBatchFromText('Zrób 5 kg wanilii').grams).toBe(5000);
    const b = resolveBatch(state);
    expect(b.source).toBe('text');
    expect(b.batchGrams).toBe(5000);
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
  });

  it('does not list batch as pending', () => {
    expect(pendingQuestions(state)).not.toContain('batch');
  });
});

/* Acceptance test (10) */
describe('(10) Protein has no supported engine profile → honest gap, no silent fallback', () => {
  it('explicit protein choice resolves to an unsupported gap, not Standard Gelato', () => {
    const state = setProductType(createCustomerFlow(), 'protein');
    const r = resolveProductType(state);
    expect(r.status).toBe('unsupported');
    expect(r.unsupported).toBe('protein');
    expect(r.internalProfile).toBeNull();
    expect(r.engineCategory).toBeNull();
    // Explicitly assert it did NOT silently become the milk/standard base.
    expect(r.internalProfile).not.toBe('standard_gelato');
    expect(r.engineCategory).not.toBe('milk_gelato');
    expect(flowStatus(state)).toBe('validation_required');
    expect(nextQuestion(state)).toBeNull();
  });

  it('protein detected in free text is captured as an unsupported gap', () => {
    const state = createCustomerFlow({ text: 'lody proteinowe waniliowe' });
    const r = resolveProductType(state);
    expect(r.status).toBe('unsupported');
    expect(r.unsupported).toBe('protein');
    expect(r.internalProfile).toBeNull();
    expect(flowStatus(state)).toBe('validation_required');
  });
});

describe('Ninja device catalogue — explicit European models, honest capacities', () => {
  it('carries the official container volumes and no invented recipe mass', () => {
    expect(NINJA_CREAMI.containerCapacityMl).toBe(473);
    expect(NINJA_CREAMI_SCOOP_SWIRL.containerCapacityMl).toBe(473);
    expect(NINJA_CREAMI_DELUXE.containerCapacityMl).toBe(709);

    for (const d of [NINJA_CREAMI, NINJA_CREAMI_SCOOP_SWIRL, NINJA_CREAMI_DELUXE]) {
      expect(d.kind).toBe('appliance');
      // No owner-approved mass exists yet — every model is 'missing', never verified.
      expect(d.targetRecipeMassG).toBeNull();
      expect(d.targetRecipeMassStatus).toBe('missing');
      expect(classifyDeviceCapacity(d)).toBe('volume_needs_mass');
    }
  });
});

describe('a Ninja container volume is NEVER auto-treated as grams', () => {
  it('the volume alone never sets a batch — it asks for the recipe mass once', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = selectDevicePreset(state, NINJA_CREAMI);

    const before = resolveBatch(state);
    expect(before.needsConfirmation).toBe(true);
    expect(before.source).toBe('device_unverified');
    expect(before.batchGrams).toBeNull();
    // 473 ml is never quietly turned into 473 g.
    expect(before.batchGrams).not.toBe(473);
    expect(nextQuestion(state)).toBe('device_capacity');

    state = confirmDeviceCapacity(state, 900);
    const after = resolveBatch(state);
    expect(after.satisfied).toBe(true);
    expect(after.source).toBe('device_confirmed');
    expect(after.batchGrams).toBe(900);
    // The mass question is asked exactly once — not repeated after it is answered.
    expect(pendingQuestions(state)).not.toContain('device_capacity');
    expect(pendingQuestions(state).filter((q) => q === 'device_capacity')).toHaveLength(0);
  });

  it('a Ninja flow never introduces a serving-temperature question', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = selectDevicePreset(state, NINJA_CREAMI_DELUXE);
    state = confirmDeviceCapacity(state, 800);
    // The only questions the flow can ask are the four known ids — none is a
    // temperature/serving question.
    for (const q of pendingQuestions(state)) {
      expect(['product_type', 'device_capacity', 'batch', 'recipe_path']).toContain(q);
    }
  });
});

describe('editable flavor chips are removable and correctable', () => {
  it('removing the chocolate chip turns off internal chocolate routing', () => {
    let state = createCustomerFlow({ text: 'gelato czekoladowe' });
    state = setProductType(state, 'gelato');
    expect(resolveProductType(state).internalProfile).toBe('chocolate_gelato');

    state = removeFlavorChip(state, 'chocolate');
    expect(activeFlavorChips(state)).not.toContain('chocolate');
    const r = resolveProductType(state);
    expect(r.internalProfile).toBe('standard_gelato');
    expect(r.chocolateRoutedInternally).toBe(false);
  });

  it('adding a chocolate chip routes to the internal chocolate profile', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = addFlavorChip(state, 'chocolate');
    expect(activeFlavorChips(state)).toContain('chocolate');
    const r = resolveProductType(state);
    expect(r.internalProfile).toBe('chocolate_gelato');
    expect(r.userFacingType).toBe('gelato');
  });
});

describe('natural-language batch parser honesty', () => {
  it('recognizes grams and a decimal-comma kilogram value', () => {
    expect(parseBatchFromText('500 g').grams).toBe(500);
    expect(parseBatchFromText('1,5 kg').grams).toBe(1500);
    expect(parseBatchFromText('10 kg').grams).toBe(10000);
  });

  it('never converts a stated volume into grams', () => {
    const p = parseBatchFromText('zrób 2 litry sorbetu');
    expect(p.grams).toBeNull();
    expect(p.volumeStatedMl).toBe(2000);
  });
});
