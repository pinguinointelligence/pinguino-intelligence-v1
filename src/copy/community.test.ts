import { describe, expect, it } from 'vitest';
import {
  communityCopyEn,
  communityCopyPl,
  pluralWersja,
  resolveCommunityCopy,
  type CommunityCopy,
} from './community';

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
    keyPaths(entry, prefix ? `${prefix}.${key}` : key),
  );
};

describe('§63 — the feature is not hardcoded to one language', () => {
  it('both locales expose exactly the same key set', () => {
    expect(keyPaths(communityCopyPl).sort()).toEqual(keyPaths(communityCopyEn).sort());
  });

  it('every leaf is a non-empty string or a formatter function', () => {
    for (const locale of [communityCopyPl, communityCopyEn]) {
      const leaves = (value: unknown): unknown[] =>
        value !== null && typeof value === 'object'
          ? Object.values(value as Record<string, unknown>).flatMap(leaves)
          : [value];
      for (const leaf of leaves(locale)) {
        if (typeof leaf === 'function') continue;
        expect(typeof leaf).toBe('string');
        expect((leaf as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('covers every term the spec lists (§63)', () => {
    const required: ReadonlyArray<(copy: CommunityCopy) => string> = [
      (copy) => copy.nav.myRecipes,
      (copy) => copy.nav.sharedWithMe,
      (copy) => copy.nav.received,
      (copy) => copy.nav.sentByMe,
      (copy) => copy.nav.community,
      (copy) => copy.nav.top100,
      (copy) => copy.roles.creator,
      (copy) => copy.roles.partner,
      (copy) => copy.roles.createdBy,
      (copy) => copy.roles.sharedBy,
      (copy) => copy.roles.basedOn,
      (copy) => copy.actions.shareRecipe,
      (copy) => copy.actions.publishToCommunity,
      (copy) => copy.actions.useThisRecipe,
      (copy) => copy.actions.createMyVersion,
      (copy) => copy.actions.unlockThisRecipe,
      (copy) => copy.actions.revokeLink,
      (copy) => copy.windows.trending,
      (copy) => copy.windows.week,
      (copy) => copy.windows.month,
      (copy) => copy.windows.allTime,
      (copy) => copy.metrics.made,
      (copy) => copy.metrics.remixes,
      (copy) => copy.metrics.verifiedRating,
    ];
    for (const read of required) {
      expect(read(communityCopyPl).length).toBeGreaterThan(0);
      expect(read(communityCopyEn).length).toBeGreaterThan(0);
    }
  });

  it('defaults to Polish and resolves English on request', () => {
    expect(resolveCommunityCopy().nav.community).toBe(communityCopyPl.nav.community);
    expect(resolveCommunityCopy('en').nav.myRecipes).toBe(communityCopyEn.nav.myRecipes);
    expect(resolveCommunityCopy('pl').nav.myRecipes).toBe('Moje receptury');
  });

  it('states the Partner eligibility rule truthfully in both locales', () => {
    expect(communityCopyPl.partner.eligibilityNote).toMatch(/aktywnego statusu/);
    expect(communityCopyPl.partner.eligibilityNote).toMatch(/nie działają wstecz/);
    expect(communityCopyEn.partner.eligibilityNote).toMatch(/aktywnego statusu/);
    expect(communityCopyEn.partner.eligibilityNote).toMatch(/nie działają wstecz/);
  });

  it('counts versions with the Polish plural, never „1 Wersji”', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 102].map(pluralWersja)).toEqual([
      'wersja',
      'wersje',
      'wersje',
      'wersji',
      'wersji',
      'wersji',
      'wersji',
      'wersji',
      'wersje',
      'wersji',
      'wersje',
    ]);
    expect(communityCopyPl.metrics.remixCount(1)).toBe('1 wersja');
    expect(communityCopyPl.metrics.remixCount(3)).toBe('3 wersje');
    expect(communityCopyPl.metrics.remixCount(5)).toBe('5 wersji');
    expect(communityCopyEn.metrics.remixCount(1)).toBe('1 remix');
    expect(communityCopyEn.metrics.remixCount(2)).toBe('2 remixes');
    // The metric heading keeps its column form.
    expect(communityCopyPl.metrics.remixes).toBe('Wersji');
  });

  it('never promises a capability the plan matrix does not define', () => {
    for (const locale of [communityCopyPl, communityCopyEn]) {
      expect(locale.demo.gramsHidden).not.toMatch(/unlimited|nielimitowan/i);
      expect(locale.demo.body).not.toMatch(/free forever|za darmo na zawsze/i);
    }
  });
});
