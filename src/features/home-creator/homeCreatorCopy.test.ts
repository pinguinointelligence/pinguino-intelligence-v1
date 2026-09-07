/**
 * §102 — locale key parity. An untranslated key must fail here, not surface as an
 * English word on a Polish screen (or a Polish word on an English one).
 */
import { describe, expect, it } from 'vitest';
import {
  HOME_CREATOR_COPY_BY_LOCALE,
  homeCreatorCopy,
  resolveHomeCreatorCopy,
} from './homeCreatorCopy';

type Leaf = string;
const flatten = (value: unknown, prefix = ''): Record<string, Leaf> => {
  const out: Record<string, Leaf> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[path] = child;
    else Object.assign(out, flatten(child, path));
  }
  return out;
};

describe('HOME creator copy', () => {
  const pl = flatten(HOME_CREATOR_COPY_BY_LOCALE.pl);
  const en = flatten(HOME_CREATOR_COPY_BY_LOCALE.en);

  it('ships identical key sets for every locale', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty string anywhere', () => {
    for (const [key, value] of Object.entries({ ...pl, ...en })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('defaults to Polish — the served reference locale', () => {
    expect(homeCreatorCopy.intent.question).toBe('Jakie lody robimy dzisiaj?');
    expect(resolveHomeCreatorCopy('pl')).toBe(homeCreatorCopy);
  });

  it('carries the owner-approved English semantic direction (§17)', () => {
    expect(HOME_CREATOR_COPY_BY_LOCALE.en.intent.headline).toBe(
      'Create your own ice cream recipe. Like a pro.',
    );
    expect(HOME_CREATOR_COPY_BY_LOCALE.en.intent.question).toBe(
      'What flavour are we making today?',
    );
    // SUPERSEDED BY OWNER — 2026-09-02: the CTA now names what Gellatti does with the
    // idea, rather than asking the customer to create the recipe themselves.
    // Was: 'Create your recipe' / „Stwórz swoją recepturę".
    expect(HOME_CREATOR_COPY_BY_LOCALE.en.intent.cta).toBe('Turn the idea into a recipe');
  });

  it('never shows a fabricated gram value in the masked state (§54)', () => {
    for (const locale of ['pl', 'en'] as const) {
      expect(HOME_CREATOR_COPY_BY_LOCALE[locale].recipe.maskedGrams).not.toMatch(/\d/);
    }
  });
});
