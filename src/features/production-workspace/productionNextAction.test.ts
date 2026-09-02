import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { confirmProductionLine, createProductionSession } from './productionSession';
import { nextProductionLineId } from './productionNextAction';

const session = createProductionSession({
  sessionId: 'next-action-run',
  ownerUserId: 'owner',
  source: {
    recipeId: 'recipe',
    recipeVersionId: 'version',
    recipeVersionNumber: 1,
    recipeName: 'Next action QA',
  },
  plannedInput: {
    ...DEFAULT_PRESET,
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  },
  startedAt: '2026-08-26T10:00:00.000Z',
});

describe('Production next-action presentation', () => {
  it('advances from the completed ingredient to the next unconfirmed line', () => {
    const first = session.lines[0]!;
    const second = session.lines[1]!;
    expect(nextProductionLineId(session, false)).toBe(first.lineId);

    const advanced = confirmProductionLine(session, first.lineId, '2026-08-26T10:01:00.000Z');
    expect(nextProductionLineId(advanced, false)).toBe(second.lineId);
  });

  it('yields attention to a required deviation decision and stops after completion', () => {
    expect(nextProductionLineId(session, true)).toBeNull();
    expect(nextProductionLineId({ ...session, status: 'completed' }, false)).toBeNull();
  });
});
