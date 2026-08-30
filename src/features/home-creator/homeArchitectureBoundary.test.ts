/**
 * §1 — HOME IS NOT A SECOND APPLICATION.
 *
 * This is a STRUCTURAL guard, not a style rule. It reads the real files under
 * `src/features/home-creator` and fails if HOME ever grows its own engine, solver,
 * recipe model, Crown, ProductBehavior, machine authority or production authority.
 *
 * It exists because the failure mode is silent and expensive: a "simple HOME
 * calculator" that quietly forks the science is indistinguishable from a working
 * feature until two presentations of the same recipe disagree.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOME_DIR = join(process.cwd(), 'src/features/home-creator');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sourceFiles = () =>
  walk(HOME_DIR).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

/** The forbidden parallel authorities named verbatim in §1. */
const FORBIDDEN_SYMBOLS = [
  'HomeEngine',
  'HomeSolver',
  'HomeRecipe',
  'HomeCrown',
  'HomeProductBehavior',
  'HomeMachineAuthority',
  'HomeProductionAuthority',
] as const;

describe('§1 — HOME defines no parallel authority', () => {
  it('declares none of the forbidden Home* authorities', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const symbol of FORBIDDEN_SYMBOLS) {
        // A DECLARATION is the offence (`class HomeEngine`, `function HomeSolver`,
        // `const HomeRecipe =`, `interface HomeCrown`), not a mention in a comment.
        const declaration = new RegExp(
          `\\b(?:class|function|interface|type|const|let|var|enum)\\s+${symbol}\\b`,
        );
        if (declaration.test(source)) {
          offenders.push(`${file.replace(process.cwd(), '.')} declares ${symbol}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never imports the Engine through a deep path — only the public barrel', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      // `@/engine` is the sanctioned barrel; `@/engine/anything` is a private reach-in.
      if (/from\s+'@\/engine\/[^']+'/.test(source)) {
        offenders.push(file.replace(process.cwd(), '.'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contains no recipe MATH — HOME presents results, it never computes them', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      // Calling the Engine/Solver entry points from a presentation layer would mean
      // HOME had started formulating on its own instead of driving the shared stores.
      for (const call of ['calculateRecipe(', 'detectViolations(', 'solveRecipe(']) {
        if (source.includes(call)) {
          offenders.push(`${file.replace(process.cwd(), '.')} calls ${call}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the view authority free of IO, storage and React', () => {
    const pure = readFileSync(join(HOME_DIR, 'homeViewMode.ts'), 'utf8');
    for (const forbidden of ['localStorage', 'fetch(', 'supabase', 'useState', 'Date.now']) {
      expect(pure).not.toContain(forbidden);
    }
  });
});
