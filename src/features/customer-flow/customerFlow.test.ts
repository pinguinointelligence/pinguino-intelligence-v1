import { describe, expect, it } from 'vitest';
import {
  activeFlavorChips,
  addFlavorChip,
  createCustomerFlow,
  detectedFlavorTags,
  flowStatus,
  nextQuestion,
  pendingQuestions,
  productTypeQuestion,
  removeFlavorChip,
  resolveBatch,
  resolveProductType,
  resolveServingRoute,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from './customerFlow';
import { buildCustomerRecipeStructure } from './recipeStructure';
import { buildCustomerRecipeView, gramVisibilityForPersona, type CustomerRecipeInput } from './recipeView';
import { parseBatchFromText } from './naturalLanguageBatch';
import { CUSTOMER_PRODUCT_TYPE_CHOICES } from './types';

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
describe('(3) a Ninja machine mode auto-sets its approved mass and skips the question', () => {
  let state = createCustomerFlow({ text: 'wanilia' });
  state = setProductType(state, 'gelato');
  state = selectServingMode(state, 'ninja_gelato');

  it('auto-sets the batch from the approved Ninja preset (700 g), never asked', () => {
    const b = resolveBatch(state);
    expect(b.source).toBe('mode_ninja');
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
    expect(b.batchGrams).toBe(700);
  });

  it('routes to the existing −13 Engine cell and lists no batch question', () => {
    expect(resolveServingRoute(state).temperatureC).toBe(-13);
    expect(pendingQuestions(state)).not.toContain('batch');
  });
});

/* Acceptance test (4) */
describe('(4) a Direct temperature mode, batch not supplied → asks batch', () => {
  let state = createCustomerFlow({ text: 'wanilia' });
  state = setProductType(state, 'gelato');
  state = selectServingMode(state, 'temp_minus_12');

  it('routes to the actual −12 Engine cell and asks the batch question', () => {
    expect(resolveServingRoute(state).temperatureC).toBe(-12);
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

describe('Ninja machine modes auto-set the approved mass and skip the batch step', () => {
  const modeFlow = (mode: 'ninja_gelato' | 'ninja_swirl') => {
    let s = createCustomerFlow({ text: 'wanilia' });
    s = setProductType(s, 'gelato');
    s = selectServingMode(s, mode);
    return s;
  };

  it('Ninja Gelato auto-sets 700 g, routes to −13, and skips the batch question', () => {
    const s = modeFlow('ninja_gelato');
    const b = resolveBatch(s);
    expect(b.source).toBe('mode_ninja');
    expect(b.batchGrams).toBe(700);
    expect(b.satisfied).toBe(true);
    expect(b.askBatch).toBe(false);
    expect(pendingQuestions(s)).not.toContain('batch');
    expect(resolveServingRoute(s).temperatureC).toBe(-13);
  });

  it('Ninja Swirl auto-sets 480 g and routes to −11', () => {
    const s = modeFlow('ninja_swirl');
    const b = resolveBatch(s);
    expect(b.source).toBe('mode_ninja');
    expect(b.batchGrams).toBe(480);
    expect(b.askBatch).toBe(false);
    expect(resolveServingRoute(s).temperatureC).toBe(-11);
  });

  it('changing Ninja Gelato → Ninja Swirl updates BOTH the mass and the temperature route', () => {
    let s = modeFlow('ninja_gelato');
    expect(resolveBatch(s).batchGrams).toBe(700);
    expect(resolveServingRoute(s).temperatureC).toBe(-13);
    s = selectServingMode(s, 'ninja_swirl');
    expect(resolveBatch(s).batchGrams).toBe(480);
    expect(resolveServingRoute(s).temperatureC).toBe(-11);
  });

  it('never introduces a serving-temperature question on a Ninja mode', () => {
    const s = modeFlow('ninja_gelato');
    expect(nextQuestion(s)).not.toBe('batch');
    for (const q of pendingQuestions(s)) {
      expect(['product_type', 'serving_mode', 'batch', 'recipe_path']).toContain(q);
    }
  });

  it('an explicit "Zmień ilość" mass overrides the Ninja preset', () => {
    let s = modeFlow('ninja_gelato');
    s = setBatchGrams(s, 1200);
    const b = resolveBatch(s);
    expect(b.source).toBe('user');
    expect(b.batchGrams).toBe(1200);
    expect(b.askBatch).toBe(false);
  });

  it('switching between Ninja modes drops a stale hand-set mass so the new preset applies', () => {
    let s = modeFlow('ninja_gelato');
    s = setBatchGrams(s, 1200);
    expect(resolveBatch(s).batchGrams).toBe(1200);
    s = selectServingMode(s, 'ninja_swirl');
    expect(resolveBatch(s).batchGrams).toBe(480);
  });

  it('starting over clears the mode and the auto-set mass', () => {
    const fresh = createCustomerFlow();
    expect(fresh.mode).toBeNull();
    const b = resolveBatch(fresh);
    expect(b.source).toBe('none');
    expect(b.batchGrams).toBeNull();
  });
});

describe('Direct / Fresh modes ask the batch only when it is unknown', () => {
  it('a direct temperature mode asks the batch when none was supplied', () => {
    let s = createCustomerFlow({ text: 'wanilia' });
    s = setProductType(s, 'gelato');
    s = selectServingMode(s, 'temp_minus_12');
    const b = resolveBatch(s);
    expect(b.source).toBe('none');
    expect(b.askBatch).toBe(true);
    expect(nextQuestion(s)).toBe('batch');
    expect(resolveServingRoute(s).temperatureC).toBe(-12);
  });

  it('a natural-language batch is preserved across Świeże (−11) and never asked twice', () => {
    let s = createCustomerFlow({ text: 'waniliowe gelato, 5 kg' });
    s = setProductType(s, 'gelato');
    s = selectServingMode(s, 'fresh');
    const b = resolveBatch(s);
    expect(b.source).toBe('text');
    expect(b.batchGrams).toBe(5000);
    expect(b.askBatch).toBe(false);
    expect(pendingQuestions(s)).not.toContain('batch');
    expect(resolveServingRoute(s).temperatureC).toBe(-11);
  });
});

describe('Serving mode: Demo sees the batch mass but no ingredient grams', () => {
  const ninjaFlow = () => {
    let s = createCustomerFlow({ text: 'wanilia' });
    s = setProductType(s, 'gelato');
    s = selectServingMode(s, 'ninja_swirl');
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
