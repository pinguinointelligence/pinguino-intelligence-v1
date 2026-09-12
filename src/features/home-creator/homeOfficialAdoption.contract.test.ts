/**
 * Source contracts for the official Gellatti recipe in HOME (RL-15, RL-24): the library's
 * one-shot address, a chosen match and the §35 single match all go through the ONE official
 * handoff, and HOME never generates a recipe behind one that is still opening.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

describe('HOME opens an official Gellatti recipe', () => {
  it('reads the library address once, after sign-in, and consumes it', () => {
    expect(page).toContain("searchParams.get('source') === 'official_recipe'");
    expect(page).toContain('if (officialHandoffClaimed.current === key) return;');
    expect(page).toContain("navigate('/home', { replace: true });");
  });

  it('adopts through the one official handoff and never generates behind it', () => {
    expect(page.match(/await openOfficialRecipe\(/g) ?? []).toHaveLength(1);
    expect(page).toContain("officialAdoption?.state !== 'loading' &&");
    expect(page).not.toContain('currentUserHasOwnerReviewAccess');
  });

  it('adopts the §35 single match and a chosen match, keeping the customer idea', () => {
    expect(page).toContain("result.decision.kind === 'auto_adopt_official' && userId");
    expect(page).toContain(
      'void adoptOfficialRecipe(match.candidate.id, { keepIdea: true, automatic: false });',
    );
  });
});
