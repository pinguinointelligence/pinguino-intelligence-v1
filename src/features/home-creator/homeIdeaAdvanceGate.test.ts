/**
 * Owner QA 2026-09-06 — "aplikacja przeszła dalej do wyboru rodzaju lodów, maszyny
 * i receptury, ZANIM zakończyłem wybór konkretnych produktów", and "wybór produktu
 * pojawił się na górze, dopiero po przewinięciu w dół".
 *
 * Both symptoms came from ONE defect: the advance scroll in `onSubmit` sat outside
 * the async identity-resolution block on a 60 ms timer, so it raced the resolver and
 * always won. These are source contracts because the defect is structural — where the
 * scroll SITS decides the behaviour, and a rendered assertion cannot see that.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveIdea } from './homeIdeaResolution';
import type { IntentChip } from './homeDraftStore';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

const chip = (over: Partial<IntentChip> = {}): IntentChip =>
  ({
    id: 'c1',
    label: 'banan',
    productId: 'prod-banana-puree',
    productName: 'BANANA · Puree',
    ambiguous: false,
    role: null,
    ...over,
  }) as IntentChip;

describe('the idea gate holds the flow on the intent stage', () => {
  it('never advances while an element still has no concrete product', () => {
    const chips = [chip(), chip({ id: 'c2', label: 'czekolada', productId: null })];
    const blocked = resolveIdea(chips).unresolved.some((e) => e.gaps.includes('product'));
    expect(blocked).toBe(true);
  });

  it('never advances while an element is still ambiguous', () => {
    const chips = [chip({ ambiguous: true })];
    const blocked = resolveIdea(chips).unresolved.some((e) => e.gaps.includes('product'));
    expect(blocked).toBe(true);
  });

  it('advances once every element resolved to a concrete product', () => {
    const chips = [chip(), chip({ id: 'c2', label: 'czekolada', productId: 'prod-choc' })];
    const blocked = resolveIdea(chips).unresolved.some((e) => e.gaps.includes('product'));
    expect(blocked).toBe(false);
  });

  it('does not hold an empty idea — that is Create my own, not an unresolved element', () => {
    const blocked = resolveIdea([]).unresolved.some((e) => e.gaps.includes('product'));
    expect(blocked).toBe(false);
  });
});

describe('the page wires that gate', () => {
  it('no longer schedules the advance on a timer that races identity resolution', () => {
    // The exact shape of the defect: a setTimeout whose body scrolls to the next stage.
    expect(page).not.toMatch(/window\.setTimeout\(\(\) => \{\s*const next =/);
  });

  it('asks the gate before advancing, and returns instead of scrolling', () => {
    expect(page).toContain('resolveIdea(chips).unresolved.some((element) =>');
    expect(page).toContain("element.gaps.includes('product')");
    expect(page).toContain('if (needsProductChoice) return;');
  });

  it('reads the profile from the store at advance time, not from a stale render', () => {
    expect(page).toContain(
      "const next = useHomeDraftStore.getState().profile === null ? 'profile' : 'machine';",
    );
  });

  it('imports the gate from the single resolution authority', () => {
    expect(page).toContain(
      "import { resolveIdea } from '@/features/home-creator/homeIdeaResolution';",
    );
  });
});
