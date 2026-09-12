/**
 * PRO MOBILE UX v2 · Workstream B — source contracts for the guided phone flow.
 *
 * The movement itself is CSS on the View Transitions API (jsdom has neither), so
 * these pin the wiring and the stylesheet; runtime behaviour is covered by the
 * *.runtime tests and by served QA on a phone.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_TUTORIAL_STEPS } from '@/features/tutorial/tutorialSteps';
import { shouldAutoStart } from '@/features/tutorial/tutorialState';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
const css = read('styles', 'theme-pro-light.css');
const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
const dialog = read('components', 'ui', 'DialogShell.tsx');

/** The body of every `@media not all and (min-width: 68.5rem) { … }` block. */
const phoneBlocks = () => {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf('@media not all and (min-width: 68.5rem)', from);
    if (start < 0) return blocks;
    let depth = 0;
    for (let index = css.indexOf('{', start); index < css.length; index += 1) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}' && --depth === 0) {
        blocks.push(css.slice(start, index + 1));
        from = index + 1;
        break;
      }
    }
  }
};

describe('B1/B2 — the Receptura dashboard is a sheet that lifts into the recipe bar', () => {
  it('keeps the recipe bar in the workbench, once, as the edge the dashboard lifts into', () => {
    expect(surface.match(/<RecipeContextBar/g)).toHaveLength(1);
    expect(read('features', 'studio', 'RecipeContextBar.tsx')).toContain(
      'pro-workbench-mobile-only sticky top-0',
    );
  });

  it('anchors the dashboard at the top and the modules at the bottom', () => {
    expect(surface).toContain("data-sheet-anchor={activeTab === 'profile' ? 'top' : 'bottom'}");
    expect(css).toMatch(/#mobile-cockpit-dialog\[data-sheet-anchor='top'\]/);
  });
});

describe('B9 — every cockpit change moves spatially, phone only, reduced motion respected', () => {
  it('routes the bottom bar, collapsing and „Otwórz ustawienia" through one spatial move', () => {
    expect(surface).toContain('cockpitMove(mobileCockpitState, next)');
    expect(surface).toContain('const collapseWithMove = (move?: SpatialMove)');
    expect(surface).toContain("phoneSheetRef.current ? 'drop' : null");
    expect(surface).toContain('!mobileViewport ? null : move');
  });

  it('names the moving surfaces only below the workbench breakpoint', () => {
    const phone = phoneBlocks().join('\n');
    for (const name of ['pro-cockpit-sheet', 'pro-recipe-workspace', 'pro-recipe-bar']) {
      expect(phone).toContain(`view-transition-name: ${name}`);
      expect(css.split(`view-transition-name: ${name}`)).toHaveLength(2);
    }
  });

  it('gives every move its keyframes and switches all of them off for reduced motion', () => {
    for (const move of ['drop', 'lift', 'forward', 'back', 'rise', 'close', 'reveal']) {
      expect(css).toContain(`html[data-pro-spatial='${move}']`);
    }
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\) \{\s*animation: none !important;/,
    );
  });
});

describe('B3/B6/B7 — profile first, one next step, the one save card', () => {
  it('opens a NEW unconfirmed recipe on its settings once, then reveals the workspace', () => {
    expect(surface).toContain(`activeDraftIdentity.startsWith('["unsaved-draft"')`);
    expect(surface).toContain("collapseWithMove('reveal')");
    expect(surface).toContain('profileFirstIdentityRef.current === activeDraftIdentity');
  });

  it('passes the phone flow to the phone dock only — the desktop dock is unchanged', () => {
    expect(
      surface.match(/mobileFlow=\{\{ next: mobileNext, onNext: onMobileNext \}\}/g),
    ).toHaveLength(1);
    expect(surface.indexOf('mobileFlow={{')).toBeGreaterThan(
      surface.indexOf('const mobileRecipeActionDock'),
    );
  });

  it('saves through the existing name/save card instead of a second save control', () => {
    expect(surface).toContain('selector: \'[data-testid="pro-workbar"]\'');
    expect(surface).not.toMatch(/useCanonicalRecipeSave|createNew\(|saveVersion\(/);
  });
});

describe('B8 — no redundant settings confirmation', () => {
  it('resumes a recalculation refused only for unconfirmed settings once they are confirmed', () => {
    expect(page).toContain(
      "state.recalculationTerminal?.state === 'SETTINGS_CONFIRMATION_REQUIRED'",
    );
    expect(page).toContain('resumeRecalculationRef.current();');
    expect(page).toContain('resumePendingRef.current = false;\n  }, [draftContextSeq]);');
  });
});

describe('B11 — the translucent dialog tone is ONE complete treatment', () => {
  it('chooses the scrim and the panel surface in DialogShell, one declaration each', () => {
    expect(dialog).toContain("tone?: 'default' | 'attention' | 'context';");
    expect(dialog).toMatch(
      /tone === 'context'\s*\?\s*'fixed inset-0 z-\[70\] bg-black\/20'\s*:\s*'fixed inset-0 z-\[70\] bg-black\/45'/,
    );
    expect(dialog).toContain(
      "tone === 'context' ? 'bg-white/[0.92] backdrop-blur-md' : 'bg-white'",
    );
    expect(dialog).not.toContain("'relative overflow-y-auto border bg-white text-ink");
  });
});

describe('B13 — one tutorial, and the phone flow is not a second one', () => {
  // v2.2 §29 (#271) brought THE tutorial. B reconciles with it instead of adding its own:
  // the phone flow guides through the product's own next step, never through a tour.
  const guidedFlow = [
    surface,
    read('features', 'studio', 'RecipeContextBar.tsx'),
    read('features', 'pro-workbench', 'mobileNextStep.ts'),
    read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx'),
    read('features', 'pro-workbench', 'WorkbenchIntelligenceHeader.tsx'),
  ].join('\n');
  const proWorkbench = [
    guidedFlow,
    page,
    read('features', 'pro-core', 'ProWorkbar.tsx'),
    read('features', 'pro-workbench', 'RecipeProfilePanel.tsx'),
    read('features', 'ingredient-builder', 'IngredientRow.tsx'),
    read('features', 'ingredient-builder', 'IngredientLineControls.tsx'),
  ].join('\n');

  it('adds no tutorial engine, coach-mark or hold-to-confirm of its own', () => {
    expect(guidedFlow).not.toMatch(/Tutorial|Coachmark|hold-to-confirm/);
  });

  it('never has the §29 tutorial start over the PRO workbench, where B3 opens the settings', () => {
    const anchoredOnPro = HOME_TUTORIAL_STEPS.filter(
      (step) => !step.anchorOptional && proWorkbench.includes(step.anchor),
    );
    expect(anchoredOnPro).toEqual([]);
    expect(
      shouldAutoStart({
        seen: false,
        anchoredStepCount: anchoredOnPro.length,
        alreadyRunning: false,
      }),
    ).toBe(false);
  });
});
