import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(resolve(SRC, ...parts), 'utf8');

describe('PRO_BOTTOM_RIGHT_FLOATING_ACTIONS_OWNER_LOCK', () => {
  const actions = read('features', 'pro-workbench', 'ProBottomRightFloatingActions.tsx');
  const copy = read('copy', 'en.ts');
  const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
  const css = read('styles', 'gellatti-v2-1.css');

  it('keeps Monitor above Przelicz z PI in one dedicated desktop stack', () => {
    const monitorAt = actions.indexOf('data-testid="pro-floating-monitor"');
    const recalculateAt = actions.indexOf('data-testid="pro-floating-recalculate"');
    expect(monitorAt).toBeGreaterThan(-1);
    expect(recalculateAt).toBeGreaterThan(monitorAt);
    expect(actions).toContain('onClick={() => onMonitor()}');
    expect(actions).toContain('onClick={onRecalculate}');
    expect(copy).toContain("monitor: 'MONITOR'");
    expect(copy).toContain("recalculate: 'PRZELICZ Z PI'");
  });

  it('mounts the stack outside the workbench/document-flow grid', () => {
    const gridEndsAt = surface.indexOf('</section>');
    const actionsAt = surface.indexOf('<ProBottomRightFloatingActions');
    expect(gridEndsAt).toBeGreaterThan(-1);
    expect(actionsAt).toBeGreaterThan(gridEndsAt);
    expect(surface).not.toContain('recipeActionDock={recipeActionDock');
  });

  it('locks positioning to the viewport and preserves it through global scaling', () => {
    expect(css).toContain(
      'OWNER LOCK: viewport-fixed Pro Monitor/Recalculate actions. Do not move into workbench/document flow without explicit Owner authorization.',
    );
    const ownerLockAt = css.indexOf('OWNER LOCK: viewport-fixed Pro Monitor/Recalculate actions.');
    const ruleAt = css.indexOf('.pro-bottom-right-floating-actions {', ownerLockAt);
    const rule = css.slice(ruleAt, css.indexOf('\n  }', ruleAt) + 4);
    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('right: var(--gellatti-viewport-fixed-inset');
    expect(rule).toContain('bottom: var(--gellatti-viewport-fixed-inset');
    expect(rule).not.toMatch(/position:\s*(?:absolute|sticky|relative);/);
  });
});
