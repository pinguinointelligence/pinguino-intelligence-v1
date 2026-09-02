import { describe, expect, it } from 'vitest';
import { CAPABILITIES, type Capabilities } from '@/access/plans';
import { unlockBenefits } from './unlockBenefits';

describe('§18 — the CTA never invents a plan capability', () => {
  it('offers a paid user nothing, because they already have everything', () => {
    expect(unlockBenefits('pro')).toEqual([]);
  });

  it('offers a logged-out visitor only capabilities the paid tier really has', () => {
    const benefits = unlockBenefits('demo');
    expect(benefits.length).toBeGreaterThan(0);
    expect(benefits).toContain('Dokładne gramatury każdego składnika');
  });

  it('never promises a capability that is switched OFF in the matrix', () => {
    // productionMode / rescueMode are false for every tier today (later phase).
    for (const tier of ['demo', 'free'] as const) {
      expect(unlockBenefits(tier)).not.toContain('Tryb produkcji');
      expect(unlockBenefits(tier)).not.toContain('Tryb ratunkowy');
    }
    expect(CAPABILITIES.pro.productionMode).toBe(false);
    expect(CAPABILITIES.pro.rescueMode).toBe(false);
  });

  it('never offers a signed-in free user something they already have', () => {
    const benefits = unlockBenefits('free');
    // `free` already saves recipes and has My Recipes — those are not reasons to pay.
    expect(benefits).not.toContain('Zapisywanie receptur');
    expect(benefits).not.toContain('Biblioteka Moje receptury');
    expect(benefits).toContain('Dokładne gramatury każdego składnika');
  });

  it('is derived from the matrix, so a capability change propagates automatically', () => {
    const paidOnly = (Object.keys(CAPABILITIES.pro) as Array<keyof Capabilities>).filter(
      (capability) => CAPABILITIES.pro[capability] && !CAPABILITIES.demo[capability],
    );
    for (const label of unlockBenefits('demo')) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(unlockBenefits('demo').length).toBeLessThanOrEqual(paidOnly.length);
  });

  it('is deterministic', () => {
    expect(unlockBenefits('demo')).toEqual(unlockBenefits('demo'));
  });
});
