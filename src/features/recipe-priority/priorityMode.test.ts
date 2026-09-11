import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITY_MODE,
  autoPriorityAppliesToNewLine,
  effectivePriorityLineIds,
  visibleCrownLineIds,
} from './priorityMode';

const items = [
  { id: 'banana', lock_type: 'main' },
  { id: 'chocolate', lock_type: 'main' },
  { id: 'milk', lock_type: 'unlocked' },
  { id: 'sugar', lock_type: 'grams' },
];

describe('PACKAGE 2A — the product-layer priority questions', () => {
  it('a draft is MANUAL unless HOME deliberately starts it in AUTO', () => {
    expect(DEFAULT_PRIORITY_MODE).toBe('MANUAL');
  });

  it('the effective set is the Main role — the same in both modes', () => {
    expect(effectivePriorityLineIds(items)).toEqual(['banana', 'chocolate']);
  });

  it('AUTO priorities are real but never shown as crowns', () => {
    expect(visibleCrownLineIds(items, 'AUTO')).toEqual([]);
  });

  it('MANUAL crowns are exactly the priorities', () => {
    expect(visibleCrownLineIds(items, 'MANUAL')).toEqual(['banana', 'chocolate']);
  });

  it('only AUTO grants a new line automatic priority', () => {
    expect(autoPriorityAppliesToNewLine('AUTO')).toBe(true);
    expect(autoPriorityAppliesToNewLine('MANUAL')).toBe(false);
  });

  it('an unknown persisted value behaves as MANUAL, never as AUTO', () => {
    const garbage = 'auto' as unknown as 'AUTO';
    expect(visibleCrownLineIds(items, garbage)).toEqual(['banana', 'chocolate']);
    expect(autoPriorityAppliesToNewLine(garbage)).toBe(false);
  });
});
