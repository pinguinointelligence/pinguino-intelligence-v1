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
  setBatchGrams,
  setProductType,
} from './customerFlow';
import { buildCustomerRecipeStructure } from './recipeStructure';
import { buildCustomerRecipeView, gramVisibilityForPersona, type CustomerRecipeInput } from './recipeView';
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
  // A standalone verified preset constructed HERE in the test — independent of
  // the shipped catalogue — to pin the GENERIC verified-mass behavior (the shipped
  // Ninja models are covered separately below).
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

describe('Ninja device catalogue — owner-approved verified recipe masses', () => {
  it('carries the official container volumes and the owner-approved recipe masses', () => {
    expect(NINJA_CREAMI.containerCapacityMl).toBe(473);
    expect(NINJA_CREAMI_SCOOP_SWIRL.containerCapacityMl).toBe(473);
    expect(NINJA_CREAMI_DELUXE.containerCapacityMl).toBe(709);

    expect(NINJA_CREAMI.targetRecipeMassG).toBe(480);
    expect(NINJA_CREAMI_SCOOP_SWIRL.targetRecipeMassG).toBe(480);
    expect(NINJA_CREAMI_DELUXE.targetRecipeMassG).toBe(700);

    for (const d of [NINJA_CREAMI, NINJA_CREAMI_SCOOP_SWIRL, NINJA_CREAMI_DELUXE]) {
      expect(d.kind).toBe('appliance');
      // Each Ninja is owner-verified now — a verified recipe mass, never 'missing'.
      expect(d.targetRecipeMassStatus).toBe('verified');
      expect(classifyDeviceCapacity(d)).toBe('verified_mass');
    }
  });

  it('the verified mass is an approved preset, NEVER an ml→g conversion', () => {
    // 480 g is the approved fill mass, not the 473 ml volume; 700 g is not 709 ml.
    expect(NINJA_CREAMI.targetRecipeMassG).not.toBe(NINJA_CREAMI.containerCapacityMl);
    expect(NINJA_CREAMI_DELUXE.targetRecipeMassG).not.toBe(NINJA_CREAMI_DELUXE.containerCapacityMl);
  });
});

describe('Ninja verified masses auto-set the batch and skip the batch/temperature steps', () => {
  const applianceFlow = (device: DevicePreset) => {
    let s = createCustomerFlow({ text: 'wanilia' });
    s = setProductType(s, 'gelato');
    s = selectDevicePreset(s, device);
    return s;
  };

  it('standard CREAMi auto-sets 480 g and skips the batch + device-capacity questions', () => {
    const state = applianceFlow(NINJA_CREAMI);
    const b = resolveBatch(state);
    expect(b.source).toBe('device_verified');
    expect(b.batchGrams).toBe(480);
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
    expect(b.needsConfirmation).toBe(false);
    // 480 g is the approved preset, never the 473 ml volume.
    expect(b.batchGrams).not.toBe(NINJA_CREAMI.containerCapacityMl);
    expect(pendingQuestions(state)).not.toContain('batch');
    expect(pendingQuestions(state)).not.toContain('device_capacity');
  });

  it('Scoop & Swirl auto-sets 480 g (verified) and skips the batch question', () => {
    const b = resolveBatch(applianceFlow(NINJA_CREAMI_SCOOP_SWIRL));
    expect(b.source).toBe('device_verified');
    expect(b.batchGrams).toBe(480);
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
  });

  it('Deluxe auto-sets 700 g (verified) and never equates it with 709 ml', () => {
    const state = applianceFlow(NINJA_CREAMI_DELUXE);
    const b = resolveBatch(state);
    expect(b.source).toBe('device_verified');
    expect(b.batchGrams).toBe(700);
    expect(b.batchGrams).not.toBe(NINJA_CREAMI_DELUXE.containerCapacityMl);
    expect(pendingQuestions(state)).not.toContain('batch');
    expect(pendingQuestions(state)).not.toContain('device_capacity');
  });

  it('never introduces a serving-temperature question on a Ninja (appliance) path', () => {
    const state = applianceFlow(NINJA_CREAMI_DELUXE);
    // The only questions the flow can ask are the four known ids — none is a
    // temperature/serving question (temperature is a professional-only UI step).
    for (const q of pendingQuestions(state)) {
      expect(['product_type', 'device_capacity', 'batch', 'recipe_path']).toContain(q);
    }
  });

  it('changing the selected Ninja model updates the auto-set mass (480 ↔ 700)', () => {
    let state = applianceFlow(NINJA_CREAMI);
    expect(resolveBatch(state).batchGrams).toBe(480);
    state = selectDevicePreset(state, NINJA_CREAMI_DELUXE);
    expect(resolveBatch(state).batchGrams).toBe(700);
    state = selectDevicePreset(state, NINJA_CREAMI_SCOOP_SWIRL);
    expect(resolveBatch(state).batchGrams).toBe(480);
  });

  it('starting over clears the device and the auto-set mass', () => {
    const withDevice = applianceFlow(NINJA_CREAMI);
    expect(resolveBatch(withDevice).batchGrams).toBe(480);
    // A fresh flow (the "start over" reset) has no device and no batch.
    const fresh = createCustomerFlow();
    expect(fresh.device).toBeNull();
    const b = resolveBatch(fresh);
    expect(b.source).toBe('none');
    expect(b.batchGrams).toBeNull();
  });

  it('an explicit customer mass overrides the verified device mass ("Zmień ilość")', () => {
    let state = applianceFlow(NINJA_CREAMI);
    expect(resolveBatch(state).source).toBe('device_verified');
    // The optional override calls setBatchGrams — an explicit batch wins priority.
    state = setBatchGrams(state, 1200);
    const b = resolveBatch(state);
    expect(b.source).toBe('user');
    expect(b.batchGrams).toBe(1200);
    expect(b.askBatch).toBe(false);
  });
});

describe('an unverified-volume device still asks once for the recipe mass (never ml→g)', () => {
  // No shipped device is unverified-volume anymore, so a synthetic one pins the
  // ask-once confirmation path that still lives in resolveBatch.
  const UNVERIFIED_VOLUME_DEVICE: DevicePreset = {
    id: 'test-unverified-volume',
    label: 'Test appliance (volume only)',
    kind: 'appliance',
    containerCapacityMl: 500,
    targetRecipeMassG: null,
    targetRecipeMassStatus: 'missing',
  };

  it('asks once, never converts the volume, and never repeats after confirmation', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = selectDevicePreset(state, UNVERIFIED_VOLUME_DEVICE);

    const before = resolveBatch(state);
    expect(before.needsConfirmation).toBe(true);
    expect(before.source).toBe('device_unverified');
    expect(before.batchGrams).toBeNull();
    // 500 ml is never quietly turned into 500 g.
    expect(before.batchGrams).not.toBe(500);
    expect(nextQuestion(state)).toBe('device_capacity');

    state = confirmDeviceCapacity(state, 900);
    const after = resolveBatch(state);
    expect(after.satisfied).toBe(true);
    expect(after.source).toBe('device_confirmed');
    expect(after.batchGrams).toBe(900);
    // The mass question is asked exactly once — not repeated after it is answered.
    expect(pendingQuestions(state)).not.toContain('device_capacity');
  });
});

describe('professional machine still asks the batch (and gets the temperature UI step)', () => {
  it('asks the batch question and never auto-sets a mass', () => {
    let state = createCustomerFlow({ text: 'wanilia' });
    state = setProductType(state, 'gelato');
    state = selectDevicePreset(state, PROFESSIONAL_MACHINE);
    const b = resolveBatch(state);
    expect(b.source).toBe('none');
    expect(b.satisfied).toBe(false);
    expect(b.askBatch).toBe(true);
    expect(nextQuestion(state)).toBe('batch');
    // Professional is the ONLY path that carries the display-temperature/serving
    // step (rendered by the shell); a Ninja appliance never does.
    expect(PROFESSIONAL_MACHINE.kind).toBe('professional');
  });
});

describe('Ninja batch mass vs ingredient grams — persona boundaries', () => {
  const ninjaFlow = () => {
    let s = createCustomerFlow({ text: 'wanilia' });
    s = setProductType(s, 'gelato');
    s = selectDevicePreset(s, NINJA_CREAMI);
    return s;
  };

  const viewInput = (state: ReturnType<typeof ninjaFlow>): CustomerRecipeInput => {
    const structure = buildCustomerRecipeStructure(state);
    return {
      recipeId: 'preview-gelato',
      title: 'Wanilia',
      productType: structure.productType,
      lines: structure.lines.map((l) => ({
        ingredientId: l.id,
        ingredientName: l.id,
        grams: l.grams,
        resolution: l.resolution,
      })),
    };
  };

  it('Demo sees the overall selected batch size (480 g) but NO ingredient grams', () => {
    const state = ninjaFlow();
    // The overall batch mass is persona-independent — Demo may see 480 g.
    expect(resolveBatch(state).batchGrams).toBe(480);
    const demoView = buildCustomerRecipeView(viewInput(state), gramVisibilityForPersona('demo'));
    expect(demoView.gramsVisible).toBe(false);
    for (const line of demoView.lines) expect('grams' in line).toBe(false);
  });

  it('Home/Pro see calculated ingredient grams on resolved base lines', () => {
    const state = ninjaFlow();
    const homeView = buildCustomerRecipeView(viewInput(state), gramVisibilityForPersona('home'));
    expect(homeView.gramsVisible).toBe(true);
    expect(homeView.lines.find((l) => l.ingredientId === 'milk')?.grams).toBe(620);

    const proView = buildCustomerRecipeView(viewInput(state), gramVisibilityForPersona('pro'));
    expect(proView.lines.find((l) => l.ingredientId === 'milk')?.grams).toBe(620);
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
