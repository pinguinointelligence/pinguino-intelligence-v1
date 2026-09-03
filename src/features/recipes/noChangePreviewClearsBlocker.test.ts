/**
 * „Receptura już spełnia wybrany profil. Nie są potrzebne żadne zmiany."
 *
 * A preview that finds nothing to change has VERIFIED the recipe — but an apply was the
 * only thing that ever wrote an audit, and the save gate asks for an audit. So closing
 * that modal left the customer looking at „przelicz" for a recipe that had just been
 * checked, or hunting for a „Zastosuj" that did not exist because there was nothing to
 * apply.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STORE = readFileSync('src/stores/recipeStore.ts', 'utf8');
const STUDIO = readFileSync('src/features/constraint-studio/constraintStudioStore.ts', 'utf8');
const GATE = readFileSync('src/features/recipes/useCanonicalRecipeSave.ts', 'utf8');

const verifyAction = STORE.slice(
  STORE.indexOf('verifyPracticalAsWritten: (constraints) =>'),
  STORE.indexOf('loadRecipeInput: (input, link = {}) =>'),
);

describe('a no-change preview clears the recalculation blocker', () => {
  it('the studio asks, and never writes the recipe store itself', () => {
    expect(STUDIO).toContain("if (result.code === 'already_clean') {");
    expect(STUDIO).toContain('verifyPracticalAsWritten(get().constraints)');
    // The feature's boundary guard allows exactly ONE direct recipe write (undo). A
    // second one here is how atomic, guarded recipe writes stop being either.
    expect((STUDIO.match(/useRecipeStore\.setState\(/g) ?? []).length).toBe(1);
  });

  it('writes an audit ONLY when the recipe is executable exactly as written', () => {
    // The same practicalization the gate runs — not a flag, not a shortcut.
    expect(verifyAction).toContain('practicalizeRecipeCandidate(input, constraints)');
    expect(verifyAction).toContain('if (!result.ok) return false;');
    // Byte-identical or nothing is recorded.
    expect(verifyAction).toContain(
      'practicalRecipeInputFingerprint(result.audit.executableInput) !==',
    );
    expect(verifyAction).toContain('return false;');
  });

  it('records the same shape the gate reads back', () => {
    // The gate compares `practicalRecipeAudit` against the live input; an audit built any
    // other way would either never match or would match things it should not.
    expect(verifyAction).toContain('attachPracticalRecipeAudit(');
    expect(verifyAction).toContain('readPracticalRecipeAudit(');
    expect(GATE).toContain('practicalRecipeAuditMatchesInput(');
  });

  it('never certifies a recipe the engine refused', () => {
    // `already_clean` is the only preview outcome that gets this treatment.
    const branch = STUDIO.slice(
      STUDIO.indexOf("if (result.code === 'already_clean') {"),
      STUDIO.indexOf("if (result.code === 'already_clean') {") + 600,
    );
    expect(branch).not.toContain('best_safe_result');
    expect(branch).not.toContain('no_proposal');
  });
});
