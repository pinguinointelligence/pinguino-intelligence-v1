/**
 * The DRAFT label tells the truth — OWNER DECISION (2026-08-30).
 *
 * The pre-production preview is an approved divergence from the older V2.1
 * `pro-label-draft` gate, granted on strict conditions: it may show only what
 * genuinely exists now, it may not fabricate a completion snapshot, it may not
 * become a second final-label authority, and it may never be printable as a
 * final label. These tests pin exactly those conditions.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { defaultAccountLabelProfile } from '@/services/labels/labelRepository';
import { buildDraftLabelPreview, DRAFT_LABEL_IS_PRINTABLE } from './draftLabelPreview';

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

const draft = (productName?: string | null) =>
  buildDraftLabelPreview({ profile: profile(), result: calculateRecipe(input), productName });

describe('draft label preview', () => {
  it('is never printable as a final label', () => {
    expect(DRAFT_LABEL_IS_PRINTABLE).toBe(false);
  });

  it('reports LOT, the production date and the confirmed declaration as OUTSTANDING', () => {
    // The three things only a completed run can supply must be listed as
    // missing — never filled with a plausible-looking value.
    expect(draft().pending).toEqual(
      expect.arrayContaining(['lot', 'production_date', 'confirmed_ingredients']),
    );
  });

  it('invents no completion identity — there is no snapshot id or completion time', () => {
    const preview = draft() as unknown as Record<string, unknown>;
    expect(preview.sourceCompletionSessionId).toBeUndefined();
    expect(preview.sourceCompletedAt).toBeUndefined();
    expect(preview.lot).toBeUndefined();
    expect(preview.productionDate).toBeUndefined();
    expect(preview.kind).toBe('draft');
  });

  it('passes the engine nutrition through verbatim — it computes none of its own', () => {
    // Same object identity, so nothing is recomputed, rounded or reshaped.
    const result = calculateRecipe(input);
    const preview = buildDraftLabelPreview({ profile: profile(), result });
    expect(preview.nutritionPer100g).toBe(result.nutrition_per_100g);
  });

  it('carries the saved label settings rather than a guess', () => {
    const preview = draft();
    expect(preview.market).toBe('EU');
    expect(preview.businessName).toBe('Gellatti Laboratory');
    expect(preview.labelLanguages).toEqual(profile().labelLanguages);
  });

  it('lists the current ingredients ordered by mass', () => {
    const preview = draft();
    expect(preview.ingredients.length).toBeGreaterThan(0);
    const grams = preview.ingredients.map((line) => line.grams);
    expect([...grams].sort((a, b) => b - a)).toEqual(grams);
    for (const line of preview.ingredients) expect(line.grams).toBeGreaterThan(0);
  });

  it('reports the planned batch, not a net quantity', () => {
    const preview = draft();
    expect(preview.plannedBatchG).toBe(calculateRecipe(input).total_batch_g);
  });

  it('keeps an unnamed recipe unnamed instead of inventing a product name', () => {
    expect(draft().productName).toBeNull();
    expect(draft('   ').productName).toBeNull();
    expect(draft(' Pistacja ').productName).toBe('Pistacja');
  });
});
