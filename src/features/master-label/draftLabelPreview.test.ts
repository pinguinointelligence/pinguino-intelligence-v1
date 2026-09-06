/**
 * The DRAFT label tells the truth — OWNER DECISION (2026-09-06).
 *
 * A current recipe draft is a real label source. It owns a stable automatic LOT
 * and local production day, uses the final-product composition (Base + Topping),
 * and is printable once the ordinary label preflight has no genuine blockers.
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
behaviorSnapshots[input.items[0]!.id]!.sharedFacts!.allergens = {
  ingredientsText: input.items[0]!.ingredient.name,
  allergensText: 'Zawiera mleko',
  declared: ['milk'],
  mayContain: [],
  evidenceVersion: 'allergens:milk:v1',
};
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
    expect(preview.label.allergens.declared).toEqual(
      expect.arrayContaining(['milk', 'gluten_wheat']),
    );
    expect(preview.allergenState).toBe('known');
  });

  it('distinguishes missing allergen facts from a confirmed empty declaration', () => {
    const incompleteSnapshots = structuredClone(behaviorSnapshots);
    delete (incompleteSnapshots[input.items[0]!.id]!.sharedFacts as { allergens?: unknown })
      .allergens;
    const incomplete = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, behaviorSnapshots: incompleteSnapshots },
      draft: labelDraft(),
    });
    expect(incomplete.allergenState).toBe('missing');
    expect(incomplete.label.allergens.status).toBe('incomplete');

    const confirmedNoneSnapshots = structuredClone(behaviorSnapshots);
    for (const [lineId, snapshot] of Object.entries(confirmedNoneSnapshots)) {
      (snapshot.sharedFacts as { allergens?: unknown }).allergens = {
        ingredientsText: lineId,
        allergensText: 'none_declared',
        declared: [],
        mayContain: [],
        evidenceVersion: `allergens:none:${snapshot.productVersionId}`,
      };
    }
    const confirmedNone = buildDraftLabelPreview({
      profile: profile(),
      recipeInput: input,
      composition: { ...composition, behaviorSnapshots: confirmedNoneSnapshots },
      draft: labelDraft(),
    });
    expect(confirmedNone.allergenState).toBe('confirmed_none');
    expect(confirmedNone.label.allergens.status).toBe('complete');
    expect(confirmedNone.label.allergens.declared).toEqual([]);
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
      confirmedFields: ['legal_product_name'],
      label: {
        ...initial.label,
        legalProductName: { pl: 'Lody pistacjowe' },
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
    expect(reopened.label.allergens.declared).toEqual(
      expect.arrayContaining(['milk', 'gluten_wheat']),
    );
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
