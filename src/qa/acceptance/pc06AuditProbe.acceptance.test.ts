/**
 * PC-06 attribution probe (QA only, acceptance runner — never in `npm test`).
 *
 * Answers one question with the application's OWN authority: for each saved
 * version test1 can open on staging, does the persisted practical audit still
 * match its input? That single boolean decides whether the PC-06 change is a
 * no-op for a recipe (audit matches -> the new disjunct is never consulted) or
 * the thing that opened its gate (audit absent/stale).
 */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { practicalRecipeAuditMatchesInput } from '@/features/practical-recipe/practicalRecipe';
import { productionRecipeLifecycleState } from '@/features/production-workspace/productionReadinessState';
import { STAGING_URL, STAGING_ANON, QA_EMAIL, QA_PASSWORD } from './__campaign__/matrixSupport';
import { writeFileSync } from 'node:fs';

describe('PC-06 audit probe', () => {
  it('records audit presence and match for every saved version', async () => {
    const supabase = createClient(STAGING_URL, STAGING_ANON);
    const auth = await supabase.auth.signInWithPassword({
      email: QA_EMAIL,
      password: QA_PASSWORD,
    });
    expect(auth.error).toBeNull();

    const { data: recipes, error } = await supabase
      .from('saved_recipes')
      .select('id,name')
      .order('name');
    expect(error).toBeNull();

    const rows: unknown[] = [];
    for (const recipe of recipes ?? []) {
      const { data: versions } = await supabase
        .from('recipe_versions')
        .select('version_number,recipe_input')
        .eq('recipe_id', recipe.id)
        .order('version_number', { ascending: false })
        .limit(1);
      const version = versions?.[0];
      if (!version) continue;
      const input = version.recipe_input as Record<string, unknown>;
      const audit = input.pinguino_practical_v1 as never;
      const matches = practicalRecipeAuditMatchesInput(input as never, audit ?? null);

      /* Both codebases agree on everything except this one disjunct, so the
         probe reports the PRE-fix verdict too: pre-fix stale iff the audit does
         not match (calculationStale is false on a freshly reopened version and
         no fixture carries a 0 g row). */
      const post = productionRecipeLifecycleState({
        workingInput: input as never,
        practicalAudit: audit ?? null,
        calculationStale: false,
        currentProductionFingerprint: 'fp',
        savedProductionFingerprint: 'fp',
        savedVersionId: recipe.id,
      });
      rows.push({
        name: recipe.name,
        version: version.version_number,
        auditPresent: audit != null,
        auditMatches: matches,
        preFixLifecycle: matches ? 'READY' : 'TECHNICALLY_STALE',
        postFixLifecycle: post,
        changedByPc06: (matches ? 'READY' : 'TECHNICALLY_STALE') !== post,
      });
    }
    writeFileSync('reports/e2e/pc06/audit-probe.json', JSON.stringify(rows, null, 2));
    console.log(JSON.stringify(rows, null, 2));
    expect(rows.length).toBeGreaterThan(0);
  }, 180_000);
});
