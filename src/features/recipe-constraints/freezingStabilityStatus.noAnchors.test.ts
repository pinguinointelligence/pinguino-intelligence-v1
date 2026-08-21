import { describe, expect, it, vi } from 'vitest';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  sorbetAuthoritySnapshots,
  sorbetMultiMainBase,
} from './__fixtures__/sorbetAuthorityFixture';
import { starterMilkBase } from './constraintFixtures';
import { evaluateFreezingStabilityStatus } from './freezingStabilityStatus';

// Independence probe: with EVERY seeded ice-anchor row removed, Sorbet freezing
// stability must still certify from the composition solver, while an
// anchor-calibrated Gelato loses its direct authority and fails closed.
vi.mock('@/engine/config/iceAnchors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/config/iceAnchors')>();
  return { ...actual, ICE_ANCHOR_ROWS: [] };
});

describe('freezing stability — Sorbet authority does not depend on any ice-anchor row', () => {
  it.each([-11, -12, -13] as const)(
    'Sorbet at %i°C stays GOOD with zero anchor rows',
    (temperature) => {
      const recipe = sorbetMultiMainBase(temperature);
      const assessment = evaluateFreezingStabilityStatus({
        recipe,
        snapshots: sorbetAuthoritySnapshots(recipe),
        calculationState: 'CURRENT',
      });
      expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
      expect(Number.isFinite(assessment.result.ice_fraction_percent)).toBe(true);
    },
  );

  it('Gelato without its seeded anchor rows fails closed (never certified from nothing)', () => {
    const recipe = starterMilkBase();
    const assessment = evaluateFreezingStabilityStatus({
      recipe,
      snapshots: productBehaviorTestSnapshots(recipe),
      calculationState: 'CURRENT',
    });
    expect(assessment.status).toBe('UNAVAILABLE');
  });
});
