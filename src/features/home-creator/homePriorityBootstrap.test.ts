import { describe, expect, it } from 'vitest';
import {
  customerInstructions,
  homePriorityBootstrapInstructions,
  homeRecalculationInstructions,
} from './homePriorityBootstrap';

const line = (
  id: string,
  lock_type: string,
  planned_grams: number,
  actual_grams: number | null = null,
) => ({
  id,
  lock_type,
  planned_grams,
  actual_grams,
});

describe('OWNER OD-1 — a 0 g HOME priority line is handed to the solver as the Crown bootstrap', () => {
  const items = [
    line('banana', 'main', 0),
    line('strawberry', 'main', 120),
    line('cranberry', 'unlocked', 0),
    line('milk', 'unlocked', 600),
    line('actual', 'main', 0, 12),
  ];

  it('bootstraps only a priority line with no amount yet', () => {
    expect(homePriorityBootstrapInstructions(items, [])).toEqual([
      { lineId: 'banana', grams: 1, locked: false, bootstrap: true },
    ]);
  });

  it('never bootstraps an ordinary 0 g line — that one still needs the customer’s amount', () => {
    const ids = homePriorityBootstrapInstructions(items, []).map(
      (instruction) => instruction.lineId,
    );
    expect(ids).not.toContain('cranberry');
  });

  it('the customer’s own instruction for a line wins over the bootstrap', () => {
    const customer = [{ lineId: 'banana', grams: 80, locked: false }];
    expect(homePriorityBootstrapInstructions(items, customer)).toEqual([]);
    expect(homeRecalculationInstructions(items, customer)).toEqual(customer);
  });

  it('a run is the bootstraps plus the customer’s edits; the preview shows only the edits', () => {
    const edit = { lineId: 'strawberry', grams: 90, locked: true };
    const all = homeRecalculationInstructions(items, [edit]);
    expect(all).toEqual([{ lineId: 'banana', grams: 1, locked: false, bootstrap: true }, edit]);
    expect(customerInstructions(all)).toEqual([edit]);
    // Re-running from the preview never duplicates a bootstrap.
    expect(homeRecalculationInstructions(items, all)).toEqual(all);
  });
});
