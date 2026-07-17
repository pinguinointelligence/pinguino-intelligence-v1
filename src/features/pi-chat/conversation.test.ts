import { describe, expect, it } from 'vitest';
import {
  advance,
  DEFAULT_BATCH_GRAMS,
  demoSummaryView,
  INITIAL_INTAKE,
  type IntakeState,
} from './conversation';

const deepNumbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepNumbers(v, found));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => deepNumbers(v, found));
  }
  return found;
};

const runTo = (...events: Parameters<typeof advance>[1][]): IntakeState =>
  events.reduce((state, event) => advance(state, event), INITIAL_INTAKE);

describe('conversation state machine', () => {
  it('starts at the flavor prompt with the default 1000 g batch', () => {
    expect(INITIAL_INTAKE.step).toBe('flavor');
    expect(INITIAL_INTAKE.batchGrams).toBe(DEFAULT_BATCH_GRAMS);
    expect(DEFAULT_BATCH_GRAMS).toBe(1000);
    expect(INITIAL_INTAKE.productProfileId).toBeNull();
  });

  it('asks the product type BEFORE any recipe is summarized or handed off', () => {
    // no product type yet → setBatch cannot reach a summary
    expect(advance(INITIAL_INTAKE, { type: 'setBatch', keep: true }).step).toBe('flavor');
    // no product type yet → unlock cannot reach the handoff
    expect(advance(INITIAL_INTAKE, { type: 'unlockPro' }).step).toBe('flavor');
  });

  it('captures the flavor verbatim and advances to product type', () => {
    const state = advance(INITIAL_INTAKE, { type: 'submitFlavor', text: '  Strawberry  ' });
    expect(state.flavorIdea).toBe('Strawberry');
    expect(state.step).toBe('product_type');
  });

  it('runs the full guided flow deterministically', () => {
    const summary = runTo(
      { type: 'submitFlavor', text: 'Strawberry' },
      { type: 'chooseProductType', id: 'sorbet' },
      { type: 'chooseServingProfile', id: 'display-minus-11' },
      { type: 'setBatch', keep: false, grams: 2000 },
    );
    expect(summary.step).toBe('demo_summary');
    expect(summary.batchGrams).toBe(2000);
    expect(advance(summary, { type: 'unlockPro' }).step).toBe('pro_handoff');
  });

  it('keeps the default batch when the user keeps it', () => {
    const summary = runTo(
      { type: 'submitFlavor', text: 'Pistachio' },
      { type: 'chooseProductType', id: 'gelato' },
      { type: 'chooseServingProfile', id: 'display-minus-11' },
      { type: 'setBatch', keep: true },
    );
    expect(summary.batchGrams).toBe(1000);
  });

  it('is pure — same (state, event) yields an equal next state', () => {
    const event = { type: 'chooseProductType', id: 'gelato' } as const;
    expect(advance(INITIAL_INTAKE, event)).toEqual(advance(INITIAL_INTAKE, event));
  });

  it('demo summary carries NO engine numbers — only the chosen batch size', () => {
    // Owner decision (Slice C, AUDIT #19 / SPEC §11.2): 'storage-minus-18' left the
    // serving vocabulary — 'display-minus-12' is the unconnected-preview example now.
    const summary = runTo(
      { type: 'submitFlavor', text: 'Strawberry' },
      { type: 'chooseProductType', id: 'sorbet' },
      { type: 'chooseServingProfile', id: 'display-minus-12' },
      { type: 'setBatch', keep: true },
    );
    const view = demoSummaryView(summary);
    expect(deepNumbers(view)).toEqual([view.batchGrams]);
    // a future serving profile is a preview — not connected to a real engine yet
    expect(view.servingConnected).toBe(false);
  });
});
