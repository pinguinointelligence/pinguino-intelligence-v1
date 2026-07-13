import { describe, expect, it } from 'vitest';
import {
  buildCustomerRecipeStructure,
  buildRecipeStructure,
  type CustomerRecipeStructure,
} from './recipeStructure';
import {
  activeFlavorChips,
  addFlavorChip,
  createCustomerFlow,
  nextQuestion,
  pendingQuestions,
  resolveProductType,
  setProductType,
} from './customerFlow';
import { buildCustomerRecipeView, gramVisibilityForPersona } from './recipeView';

const flavorTagsOf = (s: CustomerRecipeStructure): string[] =>
  s.lines.filter((l) => l.role === 'flavor').map((l) => l.flavorTag!);

/* ------------------------------------------------------------------------ *
 * Every recognized flavor survives into the recipe skeleton (Defect 1)      *
 * ------------------------------------------------------------------------ */

describe('recipe structure keeps EVERY active flavor — none is silently dropped', () => {
  it('chocolate + whisky + raspberry all become explicit lines', () => {
    const s = buildRecipeStructure({
      productType: 'gelato',
      flavorTags: ['chocolate', 'whisky', 'raspberry'],
    });
    expect(flavorTagsOf(s)).toEqual(['chocolate', 'whisky', 'raspberry']);
    // The base is present too (milk skeleton), so the flavors are additive.
    expect(s.lines.some((l) => l.role === 'base')).toBe(true);
  });

  it('vanilla + basil + mint all survive (basil/mint are unrecognized, still shown)', () => {
    const s = buildRecipeStructure({ productType: 'gelato', flavorTags: ['vanilla', 'basil', 'mint'] });
    expect(flavorTagsOf(s)).toEqual(['vanilla', 'basil', 'mint']);
  });

  it('chocolate + orange both survive', () => {
    const s = buildRecipeStructure({ productType: 'gelato', flavorTags: ['chocolate', 'orange'] });
    expect(flavorTagsOf(s)).toEqual(['chocolate', 'orange']);
  });

  it('many secondaries all survive (no collapse to a single flavor line)', () => {
    const tags = ['vanilla', 'strawberry', 'mango', 'lemon', 'mint'];
    const s = buildRecipeStructure({ productType: 'gelato', flavorTags: tags });
    expect(flavorTagsOf(s)).toEqual(tags);
  });

  it('an unknown secondary flavor is kept as an explicit requirement, never hidden', () => {
    const s = buildRecipeStructure({ productType: 'gelato', flavorTags: ['vanilla', 'zzzmysteryflavor'] });
    expect(flavorTagsOf(s)).toContain('zzzmysteryflavor');
    const unknown = s.lines.find((l) => l.flavorTag === 'zzzmysteryflavor')!;
    // Not a recognized flavor concept → needs an ingredient choice, no dose invented.
    expect(unknown.resolution).toBe('needs_ingredient');
    expect(unknown.grams).toBeNull();
  });
});

/* ------------------------------------------------------------------------ *
 * No fabricated doses; honest resolution statuses                           *
 * ------------------------------------------------------------------------ */

describe('flavor lines are honest UNRESOLVED requirements — no invented grams', () => {
  const s = buildRecipeStructure({
    productType: 'gelato',
    flavorTags: ['chocolate', 'whisky', 'raspberry', 'basil'],
  });

  it('no flavor line carries a gram number', () => {
    for (const line of s.lines.filter((l) => l.role === 'flavor')) {
      expect(line.grams).toBeNull();
      expect(line.resolution).not.toBe('resolved');
    }
  });

  it('recognized flavors need a dose; unrecognized flavors need an ingredient choice', () => {
    const byTag = Object.fromEntries(s.lines.filter((l) => l.role === 'flavor').map((l) => [l.flavorTag, l.resolution]));
    expect(byTag['chocolate']).toBe('needs_dose');
    expect(byTag['whisky']).toBe('needs_dose');
    expect(byTag['raspberry']).toBe('needs_dose');
    expect(byTag['basil']).toBe('needs_ingredient');
  });

  it('any unresolved flavor keeps the recipe from claiming a full calculation', () => {
    expect(s.fullyResolved).toBe(false);
    expect(s.unresolvedFlavorCount).toBe(4);
  });

  it('base lines keep an illustrative preview gram value (persona-gated later)', () => {
    for (const line of s.lines.filter((l) => l.role === 'base')) {
      expect(line.resolution).toBe('resolved');
      expect(typeof line.grams).toBe('number');
    }
  });
});

/* ------------------------------------------------------------------------ *
 * Flow integration: chocolate routes internally, flavors preserved          *
 * ------------------------------------------------------------------------ */

describe('flow → structure: "czekoladowe z whisky i malina" keeps all three flavors', () => {
  let state = createCustomerFlow({ text: 'lody czekoladowe z whisky i malina' });

  it('detects chocolate + whisky + raspberry as active chips', () => {
    const chips = activeFlavorChips(state);
    expect(chips).toContain('chocolate');
    expect(chips).toContain('whisky');
    expect(chips).toContain('raspberry');
  });

  it('routes chocolate INTERNALLY — visible type is Gelato, no Chocolate question', () => {
    const r = resolveProductType(state);
    expect(r.userFacingType).toBe('gelato');
    expect(r.internalProfile).toBe('chocolate_gelato');
    expect(r.chocolateRoutedInternally).toBe(true);
    expect(pendingQuestions(state)).not.toContain('product_type');
    expect(nextQuestion(state)).not.toBe('product_type');
  });

  it('the structure retains chocolate + whisky + raspberry as explicit lines', () => {
    const s = buildCustomerRecipeStructure(state);
    expect(flavorTagsOf(s)).toEqual(expect.arrayContaining(['chocolate', 'whisky', 'raspberry']));
    expect(s.fullyResolved).toBe(false);
  });

  it('manually added secondary flavors are also retained', () => {
    state = setProductType(state, 'gelato');
    state = addFlavorChip(state, 'mint');
    const s = buildCustomerRecipeStructure(state);
    expect(flavorTagsOf(s)).toContain('mint');
  });
});

/* ------------------------------------------------------------------------ *
 * Inflected-Polish repro: detection must not drop a flavor (residual defect) *
 * ------------------------------------------------------------------------ */

describe('flow → structure: inflected Polish "maliną" is retained as raspberry', () => {
  const state = createCustomerFlow({ text: 'lody czekoladowe z whisky i maliną' });

  it('chips retain chocolate (internal) + whisky + raspberry despite the inflection', () => {
    const chips = activeFlavorChips(state);
    expect(chips).toContain('chocolate');
    expect(chips).toContain('whisky');
    expect(chips).toContain('raspberry');
  });

  it('chocolate is routed internally — visible type stays Gelato', () => {
    const r = resolveProductType(state);
    expect(r.userFacingType).toBe('gelato');
    expect(r.internalProfile).toBe('chocolate_gelato');
    expect(r.chocolateRoutedInternally).toBe(true);
  });

  it('the structure keeps all three flavors as explicit unresolved lines', () => {
    const s = buildCustomerRecipeStructure(state);
    expect(flavorTagsOf(s)).toEqual(expect.arrayContaining(['chocolate', 'whisky', 'raspberry']));
    for (const line of s.lines.filter((l) => l.role === 'flavor')) {
      expect(line.grams).toBeNull(); // no fabricated dose
    }
    expect(s.fullyResolved).toBe(false);
  });
});

describe('flow → structure: "wanilia z bazylią i miętą" retains vanilla + basil + mint', () => {
  const state = createCustomerFlow({ text: 'wanilia z bazylią i miętą' });

  it('detects all three flavors from inflected Polish, none dropped', () => {
    const chips = activeFlavorChips(state);
    expect(chips).toContain('vanilla');
    expect(chips).toContain('basil');
    expect(chips).toContain('mint');
  });

  it('the structure carries a line for each of the three flavors', () => {
    const s = buildCustomerRecipeStructure(state);
    expect(flavorTagsOf(s)).toEqual(expect.arrayContaining(['vanilla', 'basil', 'mint']));
  });
});

/* ------------------------------------------------------------------------ *
 * Entitlements: names always visible; grams only where safely resolved      *
 * ------------------------------------------------------------------------ */

describe('entitlement gating over the structure (Demo names, no grams)', () => {
  const structure = buildRecipeStructure({
    productType: 'gelato',
    flavorTags: ['chocolate', 'whisky', 'raspberry'],
  });
  const input = {
    recipeId: 'preview-gelato',
    title: 'Preview',
    productType: structure.productType,
    lines: structure.lines.map((l) => ({
      ingredientId: l.id,
      ingredientName: l.flavorTag ?? l.id,
      grams: l.grams,
      resolution: l.resolution,
    })),
  };

  it('Demo sees every ingredient name incl. whisky + raspberry, but ZERO grams', () => {
    const demo = buildCustomerRecipeView(input, gramVisibilityForPersona('demo'));
    const names = demo.lines.map((l) => l.ingredientName);
    expect(names).toContain('whisky');
    expect(names).toContain('raspberry');
    expect(names).toContain('chocolate');
    for (const line of demo.lines) expect('grams' in line).toBe(false);
    expect(demo.gramsVisible).toBe(false);
  });

  it('Pro sees grams ONLY on resolved base lines — never on an unresolved flavor line', () => {
    const pro = buildCustomerRecipeView(input, gramVisibilityForPersona('pro'));
    for (const line of pro.lines) {
      if (line.resolution === 'resolved') {
        expect(typeof line.grams).toBe('number');
      } else {
        expect('grams' in line).toBe(false);
      }
    }
    // At least one flavor line remains an open requirement.
    expect(pro.unresolvedCount).toBeGreaterThan(0);
    expect(pro.fullyResolved).toBe(false);
  });
});
