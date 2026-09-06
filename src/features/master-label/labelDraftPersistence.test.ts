import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  attachRecipeLabelDraft,
  createRecipeLabelDraft,
  productionDateForTimeZone,
  readRecipeLabelDraft,
} from './labelDraftPersistence';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items,
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

describe('recipe label draft persistence', () => {
  it('derives today from the production timezone, not the UTC calendar day', () => {
    const nearMidnightUtc = new Date('2026-09-05T22:30:00.000Z');
    expect(productionDateForTimeZone(nearMidnightUtc, 'Europe/Madrid')).toBe('2026-09-06');
    expect(productionDateForTimeZone(nearMidnightUtc, 'America/Los_Angeles')).toBe('2026-09-05');
  });

  it('gives one draft one stable LOT through rerender and recalculation', () => {
    const args = {
      draftId: 'label-draft-owner-001',
      now: new Date('2026-09-05T22:30:00.000Z'),
      timeZone: 'Europe/Madrid',
    } as const;
    const first = createRecipeLabelDraft(args);
    const rerender = createRecipeLabelDraft(args);
    expect(first.lotCode).toBe('LOT-20260906-LABELDRAFT');
    expect(rerender).toEqual(first);
  });

  it('round-trips LOT, production date and confirmed label fields through Save/Reopen', () => {
    const draft = {
      ...createRecipeLabelDraft({
        draftId: 'label-draft-owner-002',
        now: new Date('2026-09-06T08:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      }),
      productionDate: '2026-09-04',
      confirmedFields: ['legal_product_name'] as const,
    };
    const saved = attachRecipeLabelDraft(input, draft);
    expect(readRecipeLabelDraft(saved)).toEqual(draft);
    expect(readRecipeLabelDraft(input)).toBeNull();
  });
});
