/**
 * ONE host of the production workspace — Produkcja v3, Etap 2.
 *
 * The consolidation's whole claim is that Produkcja has one batch, one store and one
 * Rescue. The way that claim dies is quietly: a screen that wants „just the current
 * batch" calls `useProductionWorkspace` itself, and from then on two instances reconcile
 * the same run against the server, each convinced it owns it.
 *
 * So the rule is structural rather than remembered. `useProductionWorkspace` may be
 * CALLED from exactly one module — `ProductionProcessHost`, which re-exports it as
 * `useProductionHost` — and every host goes through that door. Two hosts exist („Partie"
 * with the shared process, the recipe's Produkcja tab with the PRO cockpit), but they are
 * different ROUTES, so the hook is live in one place at a time. Its TYPE stays freely
 * importable: reading the view is not owning it.
 *
 * A test that only read constants would not catch this, so it reads the call sites.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Prose explains the rule; only CODE can break it. */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SRC = resolve(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !full.includes('.test.') ? [full] : [];
  });
}

/** The module that owns the hook, plus the hook's own file (its declaration). */
const OWNERS = [
  'production-workspace/ProductionProcessHost.tsx',
  'production-workspace/useProductionWorkspace.ts',
];

describe('one production workspace host', () => {
  const callers = sourceFiles(SRC)
    .filter((file) => /\buseProductionWorkspace\(/.test(codeOf(file)))
    .map((file) => file.replace(`${SRC}/`, ''));

  it('is the only module that calls useProductionWorkspace', () => {
    const strangers = callers.filter((file) => !OWNERS.some((owner) => file.endsWith(owner)));
    expect(strangers).toEqual([]);
  });

  it('exposes the workspace to hosts through one door', () => {
    const host = codeOf(join(SRC, 'features/production-workspace/ProductionProcessHost.tsx'));
    expect(host).toContain('export function useProductionHost(');
    // The host's own process mount uses the same door, never the hook directly.
    expect(host).toContain('useProductionHost(true, runContext)');
  });

  it('keeps the recipe Produkcja tab on that door', () => {
    const surface = codeOf(join(SRC, 'features/studio/StudioEngineSurface.tsx'));
    expect(surface).toContain('useProductionHost(');
    expect(surface).not.toContain('useProductionWorkspace(');
  });

  it('leaves the batch process with one preparation plan and no gram arithmetic', () => {
    const durable = codeOf(
      join(SRC, 'features/production-workspace/useDurableProductionProcess.ts'),
    );
    // The steps come from the ONE plan…
    expect(durable).toContain('preparationPlanForSession(session, guide)');
    // …the deviation verdict from the SERVER authority, never a second local assessment…
    expect(durable).toContain('production.deviationDecisionUnresolved');
    expect(durable).not.toContain('assessProductionRescue(');
    // …and no host recalculates a recipe.
    expect(durable).not.toContain('calculateRecipe(');
  });
});
