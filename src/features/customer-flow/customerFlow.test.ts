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
import {
  NINJA_UNVERIFIED_FIXTURE,
  NINJA_VERIFIED_FIXTURE,
  PROFESSIONAL_MACHINE_FIXTURE,
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
describe('(3) Ninja preset with a verified capacity skips the batch question', () => {
  let state = createCustomerFlow({ text: 'wanilia' });
  state = setProductType(state, 'gelato');
  state = selectDevicePreset(state, NINJA_VERIFIED_FIXTURE);

  it('auto-sets the batch from the verified device capacity', () => {
    const b = resolveBatch(state);
    expect(b.source).toBe('device_verified');
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
    expect(b.batchGrams).toBe(NINJA_VERIFIED_FIXTURE.verifiedCapacityGrams);
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
  state = selectDevicePreset(state, PROFESSIONAL_MACHINE_FIXTURE);

  it('has no auto batch and asks the batch question', () => {
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

describe('device with a nominal volume only → confirm once, never guess', () => {
  it('awaits a single confirmation instead of equating ml with grams', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = selectDevicePreset(state, NINJA_UNVERIFIED_FIXTURE);

    const before = resolveBatch(state);
    expect(before.needsConfirmation).toBe(true);
    expect(before.source).toBe('device_unverified');
    expect(before.batchGrams).toBeNull();
    expect(nextQuestion(state)).toBe('device_capacity');

    state = confirmDeviceCapacity(state, 900);
    const after = resolveBatch(state);
    expect(after.satisfied).toBe(true);
    expect(after.source).toBe('device_confirmed');
    expect(after.batchGrams).toBe(900);
    expect(pendingQuestions(state)).not.toContain('device_capacity');
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
