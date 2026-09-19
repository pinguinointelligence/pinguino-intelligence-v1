/**
 * §41 — the composer's inner black rectangle, tested where it actually lives.
 *
 * The defect was never in the composer's own CSS: the application shell owns ONE
 * focus authority in `theme-pro-light.css`, and it paints
 * `outline: 2px solid #4b4d52 !important` on any focused input under
 * `.theme-pro-light` once the input modality is keyboard. HOME sits inside
 * `.theme-pro-light` (AppShell), and the composer's field is a bare square
 * textarea inside a rounded card, so that outline drew a hard rectangle inside
 * the card the moment anyone typed.
 *
 * A component test cannot see that — jsdom does not cascade a stylesheet it was
 * never given, and reading the JSX shows a `outline-none` class that loses to
 * `!important` anyway. So this reads the two real stylesheets and checks the
 * relationship between them: the shell rule still exists (it is the app's
 * accessible default and must not be deleted), the composer field is exempted
 * from it, and the exemption is specific enough to win.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync('src/styles/theme-pro-light.css', 'utf8');
const composer = readFileSync('src/styles/home-composer.css', 'utf8');
const index = readFileSync('src/styles/index.css', 'utf8');

/** (id, class-ish, element) for the selectors this test compares. */
function specificity(selector: string): [number, number, number] {
  const withoutWhere = selector.replace(/:where\([^)]*\)/g, '');
  const ids = (withoutWhere.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (withoutWhere.match(/\.[\w-]+/g) ?? []).length +
    (withoutWhere.match(/\[[^\]]+\]/g) ?? []).length +
    (withoutWhere.match(/:(?!:)[\w-]+/g) ?? []).length;
  const elements = (withoutWhere.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length;
  return [ids, classes, elements];
}

const beats = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

const SHELL_KEYBOARD_FOCUS =
  "html[data-gellatti-input-modality='keyboard'] .theme-pro-light :where(button, a, input, select, textarea, summary, [tabindex]):focus";
const COMPOSER_EXEMPTION =
  'html[data-gellatti-input-modality] .theme-pro-light .home-composer-field:focus';

describe('§41 — the composer never renders a second, rectangular focus box', () => {
  it('the shell focus authority is still there — the fix does not remove accessibility', () => {
    expect(shell).toContain("html[data-gellatti-input-modality='keyboard']");
    expect(shell).toContain('outline: 2px solid #4b4d52 !important');
  });

  it('the composer stylesheet is actually loaded by the application', () => {
    expect(index).toContain("@import './home-composer.css';");
  });

  it('exempts the composer field from the shell outline, with !important', () => {
    expect(composer).toContain(COMPOSER_EXEMPTION);
    const rule = composer.slice(composer.indexOf('.home-composer-field:focus'));
    expect(rule).toContain('outline: none !important');
  });

  it('the exemption is more specific than the rule it has to beat', () => {
    const mine = specificity(COMPOSER_EXEMPTION);
    const shellRule = specificity(SHELL_KEYBOARD_FOCUS);
    expect(shellRule).toEqual([0, 3, 1]);
    expect(mine).toEqual([0, 4, 1]);
    expect(beats(mine, shellRule)).toBe(true);
  });

  it('keyboard focus is MOVED to the rounded wrapper, not simply deleted', () => {
    expect(composer).toContain(
      "html[data-gellatti-input-modality='keyboard'] .home-composer:focus-within",
    );
    // A box-shadow follows border-radius; an outline on the square field did not.
    expect(composer).toMatch(/\.home-composer:focus-within[\s\S]*?box-shadow:/);
    expect(composer).toContain('#4b4d52');
  });

  it('focusing the composer cannot move anything: only colours change', () => {
    const focusBlocks = composer.match(/\.home-composer:focus-within\s*\{[^}]*\}/g) ?? [];
    expect(focusBlocks.length).toBeGreaterThan(0);
    for (const block of focusBlocks) {
      expect(block).not.toMatch(/\bborder-width\b|\bpadding\b|\bmargin\b|\bwidth\b|\bheight\b/);
    }
  });
});
