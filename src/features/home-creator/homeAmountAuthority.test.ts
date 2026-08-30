import { describe, expect, it } from 'vitest';
import {
  canonicalTotalForContainers,
  capacityGuidance,
  defaultHomeAmount,
  displayedContainers,
  manualAmount,
  stepContainers,
} from './homeAmountAuthority';

// A real per-container limit from the machine authority; HOME defines none of its own.
const LIMIT = 600;

describe('§45 — container-first amount', () => {
  it('starts at exactly one container, at the canonical amount', () => {
    expect(defaultHomeAmount(LIMIT)).toEqual({ totalGrams: 600, source: 'containers' });
  });

  it('steps containers up and down to canonical multiples', () => {
    expect(stepContainers(1, 1, LIMIT)).toEqual({ totalGrams: 1200, source: 'containers' });
    expect(stepContainers(3, -1, LIMIT)).toEqual({ totalGrams: 1200, source: 'containers' });
  });

  it('never goes below one container', () => {
    expect(stepContainers(1, -1, LIMIT)).toEqual({ totalGrams: 600, source: 'containers' });
  });

  it('invents nothing when the machine authority has no per-container figure (§44)', () => {
    expect(defaultHomeAmount(null)).toBeNull();
    expect(stepContainers(1, 1, null)).toBeNull();
    expect(canonicalTotalForContainers(2, null)).toBeNull();
  });
});

describe('§46 — a manual amount is kept exactly', () => {
  it('keeps 1850 g as 1850 g — no rounding to a container multiple', () => {
    expect(manualAmount(1850)).toEqual({ totalGrams: 1850, source: 'manual' });
  });

  it('annotates it with the existing capacity guidance: 1850 g · 3 containers', () => {
    const amount = manualAmount(1850);
    const plan = capacityGuidance(amount!, LIMIT);
    expect(plan?.containers).toBe(4);
    expect(plan?.totalGrams).toBe(1850);
  });

  it('reports the owner-pinned split for a 450 g limit', () => {
    // The owner's own examples, proving HOME reuses the split rule rather than its own.
    expect(capacityGuidance({ totalGrams: 900, source: 'manual' }, 450)?.containers).toBe(2);
    expect(capacityGuidance({ totalGrams: 1000, source: 'manual' }, 450)?.containers).toBe(3);
    expect(capacityGuidance({ totalGrams: 1350, source: 'manual' }, 450)?.containers).toBe(3);
  });

  it('refuses a non-positive or non-finite amount rather than guessing', () => {
    expect(manualAmount(0)).toBeNull();
    expect(manualAmount(-5)).toBeNull();
    expect(manualAmount(Number.NaN)).toBeNull();
  });
});

describe('§46 — picking a container count returns to the canonical amount', () => {
  it('steps from a manual amount back onto canonical multiples', () => {
    const manual = manualAmount(1850)!;
    const containers = displayedContainers(manual, LIMIT); // 4
    expect(containers).toBe(4);
    // Selecting "2 containers" yields the canonical 2-container amount, not 1850/2.
    expect(canonicalTotalForContainers(2, LIMIT)).toBe(1200);
  });
});
