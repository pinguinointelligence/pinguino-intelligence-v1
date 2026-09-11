import { describe, expect, it } from 'vitest';
import { HOME_TUTORIAL_STEPS, availableSteps, type TutorialStep } from './tutorialSteps';

const step = (id: string, anchor: string, anchorOptional = false): TutorialStep => ({
  id,
  anchor,
  title: id,
  body: id,
  anchorOptional,
});

describe('§29 — the tutorial never points at something that is not there', () => {
  it('drops a step whose element is absent', () => {
    const steps = [step('a', 'here'), step('b', 'gone'), step('c', 'here-too')];
    const kept = availableSteps(steps, (anchor) => anchor !== 'gone');
    expect(kept.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('keeps a step that explains a choice rather than pointing at a control', () => {
    const steps = [step('opener', 'nowhere', true), step('b', 'gone')];
    expect(availableSteps(steps, () => false).map((s) => s.id)).toEqual(['opener']);
  });

  it('preserves the authored order', () => {
    const kept = availableSteps(HOME_TUTORIAL_STEPS, () => true);
    expect(kept.map((s) => s.id)).toEqual(HOME_TUTORIAL_STEPS.map((s) => s.id));
  });

  it('an empty screen yields an empty tutorial, not an empty spotlight', () => {
    expect(availableSteps(HOME_TUTORIAL_STEPS, () => false).every((s) => s.anchorOptional)).toBe(
      true,
    );
  });
});

describe('§29 — the authored HOME steps', () => {
  it('cover the surfaces the owner listed, in order', () => {
    expect(HOME_TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'home-pro',
      'composer',
      'idea',
      'profile',
      'machine',
      'recipe',
      'ingredient-settings',
      'lets-make-it',
    ]);
  });

  it('every step is short, and every id and anchor is unique', () => {
    for (const s of HOME_TUTORIAL_STEPS) {
      expect(s.body.length, s.id).toBeLessThanOrEqual(190);
      expect(s.title.length, s.id).toBeLessThanOrEqual(40);
    }
    expect(new Set(HOME_TUTORIAL_STEPS.map((s) => s.id)).size).toBe(HOME_TUTORIAL_STEPS.length);
    expect(new Set(HOME_TUTORIAL_STEPS.map((s) => s.anchor)).size).toBe(HOME_TUTORIAL_STEPS.length);
  });

  it('teaches the crown as PRIORITY, and never says AUTO or MANUAL to a customer', () => {
    const crown = HOME_TUTORIAL_STEPS.find((s) => s.id === 'ingredient-settings')!;
    expect(crown.body).toContain('Korona = priorytet');
    expect(crown.body).toContain('priorytet mają tylko składniki oznaczone przez Ciebie');
    const all = HOME_TUTORIAL_STEPS.map((s) => `${s.title} ${s.body}`).join(' ');
    expect(all).not.toMatch(/\bAUTO\b|\bMANUAL\b/);
  });

  it('says the recipe calculates itself — there is no Przelicz to teach', () => {
    const recipe = HOME_TUTORIAL_STEPS.find((s) => s.id === 'recipe')!;
    expect(recipe.body).toContain('Liczy się sama');
    expect(recipe.body.toLowerCase()).not.toContain('przelicz ');
  });

  it('points at „Jak to działa?" instead of repeating it', () => {
    const profile = HOME_TUTORIAL_STEPS.find((s) => s.id === 'profile')!;
    expect(profile.body).toContain('Jak to działa?');
  });
});
