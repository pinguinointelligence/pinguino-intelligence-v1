/**
 * HOME ENTRY — OWNER FROZEN.
 *
 * Copy, structure and hierarchy of the first screen. Frozen means a change here should
 * fail loudly rather than drift.
 *
 * Re-frozen 2026-09-02 (owner §4): the composer is the ONLY refinement surface. The
 * separate „Składnik" / „Topping" picker row is permanently removed; once at least one
 * idea chip exists the same field asks „Jeszcze coś?", marked by the canonical orange
 * status dot. Powiedz and Zeskanuj do not move.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_CREATOR_COPY_BY_LOCALE, homeCreatorCopy } from '../homeCreatorCopy';

const en = HOME_CREATOR_COPY_BY_LOCALE.en;

const intent = readFileSync('src/features/home-creator/ui/HomeIntentSection.tsx', 'utf8');

const CHIPS_BRANCH = '{chips.length > 0 ? (';

describe('frozen copy', () => {
  it('keeps the exact approved strings', () => {
    expect(homeCreatorCopy.intent.headline).toBe('Stwórz własne lody. Jak profesjonalista.');
    expect(homeCreatorCopy.intent.question).toBe('Jakie lody robimy dzisiaj?');
    expect(homeCreatorCopy.intent.placeholder).toBe('Napisz, co chcesz zrobić…');
    expect(homeCreatorCopy.intent.cta).toBe('Stwórz swoją recepturę');
    expect(homeCreatorCopy.intent.anythingElse).toBe('Jeszcze coś?');
  });

  it('keeps Powiedz and Zeskanuj as the other two composer inputs', () => {
    expect(homeCreatorCopy.intent.addByVoice).toBe('Powiedz');
    expect(homeCreatorCopy.intent.addByScan).toBe('Zeskanuj');
  });

  it('says Topping, never Posypka, in customer-facing HOME copy', () => {
    expect(homeCreatorCopy.recipe.topping).toBe('Topping');
    expect(homeCreatorCopy.recipe.addTopping).toBe('Dodaj topping');
    const pl = JSON.stringify(homeCreatorCopy);
    expect(pl.toLowerCase()).not.toContain('posypk');
  });

  it('keeps both locales complete', () => {
    expect(en.intent.anythingElse).toBeTruthy();
    expect(en.recipe.topping).toBe('Topping');
  });
});

describe('the removed refinement row stays removed', () => {
  it('has no refineIngredient / refineTopping copy keys', () => {
    const keys = Object.keys(homeCreatorCopy.intent);
    expect(keys).not.toContain('refineIngredient');
    expect(keys).not.toContain('refineTopping');
    expect(Object.keys(en.intent)).not.toContain('refineIngredient');
  });

  it('opens no product picker from the idea screen', () => {
    expect(intent).not.toContain('ProductPickerPopover');
    expect(intent).not.toContain('data-testid="home-intent-refine"');
  });
});

describe('frozen structure — one composer, two states', () => {
  it('asks „Jeszcze coś?" only once an idea exists', () => {
    expect(intent).toContain(
      'hasIdea ? homeCreatorCopy.intent.anythingElse : homeCreatorCopy.intent.placeholder',
    );
    expect(intent).toContain('const hasIdea = chips.length > 0;');
  });

  it('keeps the composer in ONE place — the prompt changes, the field does not move', () => {
    // The field, the dot, Powiedz and Zeskanuj all render ABOVE the chips branch, so
    // none of them can be re-mounted or repositioned when the first chip appears.
    for (const marker of [
      'data-testid="home-intent-input"',
      'data-testid="home-intent-dot"',
      'data-testid="home-intent-voice"',
      'data-testid="home-intent-scan"',
    ]) {
      expect(intent.indexOf(marker), marker).toBeLessThan(intent.indexOf(CHIPS_BRANCH));
    }
  });

  it('reserves the dot slot in both states instead of unmounting it', () => {
    // `invisible` keeps the box; `display:none`/conditional render would move the field
    // by the dot's width the moment the first idea lands.
    expect(intent).toContain("cn('size-1.5 rounded-full', !hasIdea && 'invisible')");
  });
});

describe('frozen hierarchy — the dot is the canonical accent', () => {
  it('uses the canonical dot size and the canonical orange token', () => {
    expect(intent).toContain('size-1.5 rounded-full');
    expect(intent).toContain("background: 'var(--g-orange)'");
  });

  it('keeps the dot out of the accessibility tree', () => {
    const dot = intent.slice(
      intent.indexOf('<span\n              aria-hidden'),
      intent.indexOf('<textarea'),
    );
    expect(dot).toContain('aria-hidden');
  });

  it('keeps the primary CTA last', () => {
    expect(intent.indexOf(CHIPS_BRANCH)).toBeLessThan(
      intent.indexOf('data-testid="home-intent-cta"'),
    );
  });
});
