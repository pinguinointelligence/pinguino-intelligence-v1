/**
 * The DRAFT label tells the truth — OWNER DECISION (2026-09-06).
 *
 * A current recipe draft is a real label source. It owns a stable automatic LOT
 * and local production day, uses the final-product composition (Base + Topping),
 * and remains printable while unknown editable fields are disclosed at print time.
 * It is still not a Production snapshot and can never displace #199 authority.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { defaultAccountLabelProfile } from '@/services/labels/labelRepository';
import { buildDraftLabelPreview } from './draftLabelPreview';
import {
  attachRecipeLabelDraft,
  createRecipeLabelDraft,
  readRecipeLabelDraft,
} from './labelDraftPersistence';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

const profile = () => ({
  ...defaultAccountLabelProfile('owner-draft-label'),
  businessName: 'Gellatti Laboratory',
  market: 'EU' as const,
});

const topping = {
  id: 'topping-oat-crunch',
  ingredient: {
    kind: 'catalog_label_topping',
    id: 'catalog:oat-crunch',
    canonical_ingredient_id: 'catalog:oat-crunch',
    private_product_id: 'catalog:oat-crunch:version:v1',
    name: 'Owsiana posypka',
    catalog_product_id: 'oat-crunch',
    catalog_version_id: 'v1',
    verification_status: 'verified',
    label_nutrition_per_100g: {
      basis: 'per_100g',
      energyKcal: 420,
      fat: 12,
      saturatedFat: 2,
      carbohydrate: 68,
      sugars: 18,
      protein: 9,
      salt: 0.3,
      fibre: 7,
    },
    ingredients_text: 'Płatki owsiane, cukier',
    allergens_text: 'Zawiera owies (gluten)',
    cost_per_kg: 8,
    cost_currency: 'EUR',
  } satisfies CatalogLabelToppingIngredient,
  planned_grams: 25,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON' as const,
  addon_sort_order: 0,
};

const behaviorSnapshots = productBehaviorTestSnapshots(input, [topping]);
for (const item of input.items) {
  behaviorSnapshots[item.id]!.sharedFacts!.allergens = {
    ingredientsText: item.ingredient.name,
    allergensText: 'Zawiera mleko',
    declared: ['milk'],
    mayContain: [],
    evidenceVersion: `allergens:milk:${item.id}:v1`,
  };
}
behaviorSnapshots[topping.id]!.sharedFacts!.allergens = {
  ingredientsText: topping.ingredient.ingredients_text,
  allergensText: topping.ingredient.allergens_text,
  declared: ['gluten_wheat'],
  mayContain: [],
  evidenceVersion: 'allergens:oat:v1',
};

const composition: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: input.items.map((item) => item.id),
  toppings: [topping],
  behaviorSnapshots,
  migrationAmbiguities: [],
};

const labelDraft = () =>
  createRecipeLabelDraft({
    draftId: 'label-draft-owner-001',
    now: new Date('2026-09-05T22:30:00.000Z'),
    timeZone: 'Europe/Madrid',
  });

const draft = (productName?: string | null) =>
  buildDraftLabelPreview({
    profile: profile(),
    recipeInput: input,
    composition,
    productName,
    draft: labelDraft(),
  });

describe('draft label preview', () => {
  it('keeps a 1000 g Base at 1000 g when there is no Topping', () => {
    const withoutTopping = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, toppings: [] },
      productName: 'Pistacja',
      draft: labelDraft(),
    });
    expect(withoutTopping.baseBatchG).toBe(1000);
    expect(withoutTopping.finalProductG).toBe(1000);
    expect(withoutTopping.label.actualBatchQuantityG).toBe(1000);
  });

  it('shows the canonical automatic LOT and account-local production date immediately', () => {
    const preview = draft('Pistacja');
    expect(preview.label.lotCode).toBe('LOT-20260906-LABELDRAFT');
    expect(preview.label.productionDate).toBe('2026-09-06');
    expect(preview.pending).not.toContain('lot');
    expect(preview.pending).not.toContain('production_date');
    expect(preview.pending).not.toContain('confirmed_ingredients');
  });

  it('keeps a draft identity without pretending it is a Production completion', () => {
    const preview = draft() as unknown as Record<string, unknown>;
    expect(preview.productionSnapshot).toBeUndefined();
    expect(preview.kind).toBe('draft');
  });

  it('uses final-product mass and percentages while keeping Base mass separate', () => {
    const preview = draft('Pistacja');
    expect(preview.baseBatchG).toBe(1000);
    expect(preview.finalProductG).toBe(1025);
    expect(preview.label.actualBatchQuantityG).toBe(1025);
    expect(preview.ingredients.some((line) => line.name.includes('Płatki owsiane'))).toBe(true);
    expect(preview.ingredients.reduce((sum, line) => sum + (line.percent ?? 0), 0)).toBeCloseTo(
      100,
      8,
    );
  });

  it('renders known Base and Topping allergens from frozen product facts', () => {
    const preview = draft();
    expect(preview.label.allergens.labelStatements).toEqual([
      'Zawiera mleko · Zawiera owies (gluten)',
    ]);
    expect(preview.pending).not.toContain('allergens');
  });

  it('uses the resolved line from every Base ingredient when there is no Topping', () => {
    const preview = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, toppings: [] },
      draft: labelDraft(),
    });
    expect(preview.label.allergens.labelStatements).toEqual(['Zawiera mleko']);
  });

  it('uses the same whole-recipe authority when a recipe ingredient is Main', () => {
    const mainInput: RecipeInput = {
      ...input,
      items: input.items.map((item, index) =>
        index === 0 ? { ...item, lock_type: 'main' as const } : item,
      ),
    };
    const mainSnapshots = structuredClone(behaviorSnapshots);
    mainSnapshots[mainInput.items[0]!.id]!.sharedFacts!.allergens = {
      ...mainSnapshots[mainInput.items[0]!.id]!.sharedFacts!.allergens!,
      allergensText: 'Zawiera pistacje',
      declared: ['tree_nuts: pistachio'],
    };
    const preview = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: mainInput,
      composition: { ...composition, behaviorSnapshots: mainSnapshots },
      draft: labelDraft(),
    });
    expect(preview.label.allergens.labelStatements).toEqual([
      'Zawiera pistacje · Zawiera mleko · Zawiera owies (gluten)',
    ]);
  });

  it('treats a missing or UNKNOWN source line as non-blocking and never as allergen-free', () => {
    const incompleteSnapshots = structuredClone(behaviorSnapshots);
    delete (incompleteSnapshots[input.items[0]!.id]!.sharedFacts as { allergens?: unknown })
      .allergens;
    const incomplete = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, behaviorSnapshots: incompleteSnapshots },
      draft: labelDraft(),
    });
    expect(incomplete.label.allergens.status).toBe('incomplete');
    expect(incomplete.pending).not.toContain('allergens');

    const unknownSnapshots = structuredClone(behaviorSnapshots);
    for (const [lineId, snapshot] of Object.entries(unknownSnapshots)) {
      (snapshot.sharedFacts as { allergens?: unknown }).allergens = {
        ingredientsText: lineId,
        allergensText: 'UNKNOWN',
        declared: [],
        mayContain: [],
        evidenceVersion: `allergens:unknown:${snapshot.productVersionId}`,
      };
    }
    const unknown = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, behaviorSnapshots: unknownSnapshots },
      draft: labelDraft(),
    });
    expect(unknown.label.allergens.labelStatements).toEqual([]);
    expect(unknown.pending).not.toContain('allergens');
    expect(buildMasterLabelPrintHtml(unknown.label, null, { preview: true })).not.toContain(
      'Alergeny:',
    );
    expect(
      buildMasterLabelPrintHtml(unknown.label, null, { preview: true }).toLowerCase(),
    ).not.toContain('bez alergen');
  });

  it.each([
    {
      name: 'Base known + Main UNKNOWN',
      known: { base: 'Zawiera mleko' },
      expected: ['Zawiera mleko'],
    },
    {
      name: 'Main known + Topping UNKNOWN',
      known: { main: 'Zawiera pistacje' },
      expected: ['Zawiera pistacje'],
    },
    {
      name: 'Topping known + Base UNKNOWN',
      known: { topping: 'Zawiera owies (gluten)' },
      expected: ['Zawiera owies (gluten)'],
    },
    {
      name: 'several known declarations + one UNKNOWN',
      known: { base: 'Zawiera mleko', main: 'Zawiera pistacje' },
      expected: ['Zawiera mleko', 'Zawiera pistacje'],
    },
  ])('preserves known allergen text when $name', ({ known, expected }) => {
    const mixedInput: RecipeInput = {
      ...input,
      items: input.items.map((item, index) =>
        index === 0 ? { ...item, lock_type: 'main' as const } : item,
      ),
    };
    const snapshots = structuredClone(behaviorSnapshots);
    for (const [lineId, snapshot] of Object.entries(snapshots)) {
      snapshot.sharedFacts!.allergens = {
        ingredientsText: lineId,
        allergensText: 'UNKNOWN',
        declared: [],
        mayContain: [],
        evidenceVersion: `allergens:unknown:${lineId}`,
      };
    }
    const setKnown = (lineId: string, statement: string) => {
      snapshots[lineId]!.sharedFacts!.allergens = {
        ingredientsText: lineId,
        allergensText: statement,
        declared: statement.includes('pistacje') ? ['tree_nuts: pistachio'] : ['milk'],
        mayContain: [],
        evidenceVersion: `allergens:known:${lineId}`,
      };
    };
    if (known.base) setKnown(mixedInput.items[1]!.id, known.base);
    if (known.main) setKnown(mixedInput.items[0]!.id, known.main);
    if (known.topping) setKnown(topping.id, known.topping);

    const preview = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: mixedInput,
      composition: { ...composition, behaviorSnapshots: snapshots },
      draft: labelDraft(),
    });
    expect(preview.label.allergens.status).toBe('incomplete');
    for (const statement of expected) {
      expect(preview.label.allergens.labelStatements.join(' · ')).toContain(statement);
      expect(buildMasterLabelPrintHtml(preview.label, null, { preview: true })).toContain(
        statement,
      );
    }
    expect(buildMasterLabelPrintHtml(preview.label, null, { preview: true })).not.toContain(
      'UNKNOWN',
    );
  });

  it('prints the exact LOT and production date shown by the preview', () => {
    const preview = draft('Pistacja');
    const html = buildMasterLabelPrintHtml(preview.label, null, { preview: true });
    expect(html).toContain(preview.label.lotCode);
    expect(html).toContain(preview.label.productionDate);
  });

  it('preserves the edited label, Topping facts and final mass through Save/Reopen', () => {
    const initialDraft = {
      ...labelDraft(),
      productionDate: '2026-09-04',
    };
    const initial = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition,
      productName: 'Pistacja',
      draft: initialDraft,
    });
    const savedDraft = {
      ...initialDraft,
      confirmedFields: ['legal_product_name', 'allergens'],
      label: {
        ...initial.label,
        legalProductName: { pl: 'Lody pistacjowe' },
        allergens: {
          ...initial.label.allergens,
          labelStatements: ['Alergeny: MLEKO, ORZECHY PISTACJOWE'],
          reviewedByUser: true,
        },
      },
    };
    const reopenedDraft = readRecipeLabelDraft(attachRecipeLabelDraft(input, savedDraft))!;
    const reopened = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition,
      productName: 'Pistacja',
      draft: reopenedDraft,
    });

    expect(reopened.label.lotCode).toBe(initial.label.lotCode);
    expect(reopened.label.productionDate).toBe('2026-09-04');
    expect(reopened.label.legalProductName.pl).toBe('Lody pistacjowe');
    expect(reopened.baseBatchG).toBe(1000);
    expect(reopened.finalProductG).toBe(1025);
    expect(reopened.ingredients.some((line) => line.name.includes('Płatki owsiane'))).toBe(true);
    expect(reopened.label.allergens.labelStatements).toEqual([
      'Alergeny: MLEKO, ORZECHY PISTACJOWE',
    ]);
  });

  it('lists the final-product ingredients ordered by mass', () => {
    const preview = draft();
    expect(preview.ingredients.length).toBeGreaterThan(0);
    const grams = preview.ingredients.map((line) => line.grams);
    expect([...grams].sort((a, b) => b - a)).toEqual(grams);
    for (const line of preview.ingredients) expect(line.grams).toBeGreaterThan(0);
  });

  it('keeps an unnamed recipe unnamed instead of inventing a product name', () => {
    expect(draft().productName).toBeNull();
    expect(draft('   ').productName).toBeNull();
    expect(draft(' Pistacja ').productName).toBe('Pistacja');
  });
});
