/// <reference types="node" />
/**
 * Constraint Studio boundary guard (task hard rule: „an Apply path that skips
 * verifyConstraintsPreserved must be impossible”).
 *
 * The COMPILE-TIME half of the guarantee is the `VerifiedApply` private
 * constructor (the store's recipe write requires a `VerifiedApply`, and only
 * `VerifiedApply.commit` — which always runs verifyConstraintsPreserved —
 * can construct one). This test pins the SOURCE-LEVEL half:
 *  1. within the feature, the recipe store is written ONLY by the studio
 *     store module, in exactly the two sanctioned places (verified apply +
 *     exact undo restore);
 *  2. `verifyConstraintsPreserved` is called in the pipeline module and
 *     nowhere else in the feature (no second, divergent verify path);
 *  3. the pipeline really declares the private constructor, the store really
 *     goes through `commitPreview`, and no feature file constructs a
 *     `VerifiedApply` directly.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FEATURE_DIR = resolve(import.meta.dirname);

function featureSourceFiles(): string[] {
  const files: string[] = [];
  const entries = readdirSync(FEATURE_DIR, { recursive: true }) as string[];
  for (const rel of entries) {
    const full = join(FEATURE_DIR, String(rel));
    if (!/\.(ts|tsx)$/.test(full)) continue;
    if (/\.test\.(ts|tsx)$/.test(full)) continue;
    files.push(full);
  }
  return files;
}

const FILES = featureSourceFiles();
const readSource = (file: string) => readFileSync(file, 'utf8');
const baseName = (file: string) => file.replaceAll('\\', '/').split('/').pop() ?? file;

describe('constraint-studio boundary guard', () => {
  it('scans a non-empty feature source set', () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it('only the studio store writes the recipe store — exactly the two sanctioned writes', () => {
    for (const file of FILES) {
      const source = readSource(file);
      const writes = source.match(/useRecipeStore\.setState\(/g) ?? [];
      if (baseName(file) === 'constraintStudioStore.ts') {
        expect(writes.length, 'apply + undo are the only recipe writes').toBe(2);
        // the apply write consumes ONLY the pipeline-verified outcome…
        expect(source).toContain('outcome.verified.input.items');
        // …and the undo write consumes ONLY the pipeline-captured snapshot
        expect(source).toContain('last.before.input.items');
      } else {
        expect(writes.length, `unexpected recipe write in ${file}`).toBe(0);
      }
    }
  });

  it('verifyConstraintsPreserved is called in the pipeline and nowhere else in the feature', () => {
    for (const file of FILES) {
      const source = readSource(file);
      const calls = source.match(/verifyConstraintsPreserved\(/g) ?? [];
      if (baseName(file) === 'applyPipeline.ts') {
        expect(calls.length, 'the pipeline runs the verify gate').toBeGreaterThanOrEqual(1);
      } else {
        expect(calls.length, `stray verify call in ${file} (one door only)`).toBe(0);
      }
    }
  });

  it('VerifiedApply has a private constructor and the store applies via commitPreview', () => {
    const pipeline = readSource(join(FEATURE_DIR, 'applyPipeline.ts'));
    expect(pipeline).toContain('private constructor(');
    // the verify gate sits INSIDE the commit factory, before any VerifiedApply is built
    const commitBody = pipeline.slice(pipeline.indexOf('static commit('));
    expect(commitBody).toContain('verifyConstraintsPreserved(');
    expect(commitBody.indexOf('verifyConstraintsPreserved(')).toBeLessThan(
      commitBody.indexOf('new VerifiedApply('),
    );

    const store = readSource(join(FEATURE_DIR, 'constraintStudioStore.ts'));
    expect(store).toContain('commitPreview(');
    for (const file of FILES) {
      if (baseName(file) === 'applyPipeline.ts') continue;
      expect(readSource(file).includes('new VerifiedApply'), `direct construction in ${file}`).toBe(
        false,
      );
    }
  });

  it('the feature stays inside the sanctioned seams (engine barrel only, no supabase)', () => {
    for (const file of FILES) {
      const source = readSource(file);
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(source), `deep engine import in ${file}`).toBe(
        false,
      );
      expect(/\bsupabase\b/i.test(source), `supabase reference in ${file}`).toBe(false);
    }
  });
});
