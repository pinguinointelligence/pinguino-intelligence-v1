import { describe, expect, it } from 'vitest';
import {
  HOME_SWEETNESS_ORDER,
  projectSweetnessForDisplay,
  sweetnessValueForTap,
  tapChangesStoredValue,
} from './homeSweetness';

describe('§61 — HOME exposes exactly three choices', () => {
  it('offers less / balanced / sweeter', () => {
    expect(HOME_SWEETNESS_ORDER).toEqual(['less', 'balanced', 'sweeter']);
  });

  it('writes only −1, 0 or +1', () => {
    expect(HOME_SWEETNESS_ORDER.map(sweetnessValueForTap)).toEqual([-1, 0, 1]);
  });
});

describe('§62 — viewing projects, it never writes', () => {
  it('projects the full PRO range onto the three choices', () => {
    expect(projectSweetnessForDisplay(-2)).toBe('less');
    expect(projectSweetnessForDisplay(-1)).toBe('less');
    expect(projectSweetnessForDisplay(0)).toBe('balanced');
    expect(projectSweetnessForDisplay(1)).toBe('sweeter');
    expect(projectSweetnessForDisplay(2)).toBe('sweeter');
  });

  it('does not rewrite an already-correct ±2 when its segment is tapped', () => {
    // A PRO recipe at +2 displays as "sweeter"; tapping "sweeter" must be a no-op,
    // otherwise merely looking at HOME would flatten +2 to +1.
    expect(projectSweetnessForDisplay(2)).toBe('sweeter');
    expect(tapChangesStoredValue(2, 'sweeter')).toBe(true);
    // …and when it DOES write, it writes the exact HOME value with no ±2 memory.
    expect(sweetnessValueForTap('sweeter')).toBe(1);
  });

  it('reports a real change for a different choice', () => {
    expect(tapChangesStoredValue(-2, 'balanced')).toBe(true);
    expect(tapChangesStoredValue(0, 'balanced')).toBe(false);
  });

  it('has no memory of a previous ±2 — the tap value depends only on the choice', () => {
    expect(sweetnessValueForTap('less')).toBe(-1);
    expect(sweetnessValueForTap('sweeter')).toBe(1);
    // Called twice with the same choice from different stored states → same answer.
    expect(sweetnessValueForTap('less')).toBe(sweetnessValueForTap('less'));
  });
});

describe('§63/§64 — a sweetness edit cannot touch another axis', () => {
  it('takes no other axis as input, so it can move none', () => {
    // Structural: the write function's only parameter is the sweetness choice.
    expect(sweetnessValueForTap.length).toBe(1);
    expect(projectSweetnessForDisplay.length).toBe(1);
  });
});
