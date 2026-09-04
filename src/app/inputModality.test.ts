// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GELLATTI_INPUT_MODALITY_ATTRIBUTE, installInputModalityAuthority } from './inputModality';

describe('Gellatti shared focus authority', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.replaceChildren();
  });

  it('ignores modifier-only keys, clears on pointer input and enables Tab / Shift+Tab focus', () => {
    cleanup = installInputModalityAuthority(document);
    const button = document.createElement('button');
    button.textContent = 'Receptura';
    document.body.append(button);

    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    button.focus();
    expect(document.documentElement.getAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE)).toBe(
      'pointer',
    );

    for (const key of ['Shift', 'Alt', 'Control', 'Meta']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(document.documentElement.getAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE)).toBe(
        'pointer',
      );
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.documentElement.getAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE)).toBe(
      'keyboard',
    );

    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.documentElement.getAttribute(GELLATTI_INPUT_MODALITY_ATTRIBUTE)).toBe(
      'keyboard',
    );
  });

  it('uses one neutral focus selector for every Pro interactive, never an orange attention ring', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../styles/theme-pro-light.css'), 'utf8');
    const authorityStart = css.indexOf('/* One focus authority for the Pro surface.');
    const authorityEnd = css.indexOf('.pro-scroll-safe', authorityStart);
    const authority = css.slice(authorityStart, authorityEnd);

    expect(authority).toContain("html[data-gellatti-input-modality='keyboard']");
    expect(authority).toContain(
      ':where(button, a, input, select, textarea, summary, [tabindex]):focus',
    );
    expect(authority).toContain('outline: 2px solid #4b4d52 !important');
    expect(authority).toContain('--tw-ring-shadow: 0 0 #0000 !important');
    expect(authority).not.toContain('gellatti-orange');
    expect(authority).not.toContain('attention');
    expect(authority).not.toContain('.pro-focus-ring:focus-visible');
    expect(authority).not.toContain('summary):focus-visible');

    const main = readFileSync(resolve(import.meta.dirname, '../main.tsx'), 'utf8');
    expect(main).toContain('installInputModalityAuthority(document)');
  });
});
