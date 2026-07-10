/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_CORRECTION_DRAFT_KEYS,
  buildAcceptedCorrectionDraft,
  sourceRecipeHash,
  validateAcceptedCorrectionDraft,
  type AcceptedCorrectionCapabilities,
  type AcceptedCorrectionDraft,
} from './acceptedCorrectionDraft';
import { findOptimizationPreviewFixture } from './optimizationPreviewFixtures';
import { previewOptimization, runOptimizationPreview, type OptimizationPreviewView } from './optimizationPreviewRunner';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '..', '..', '..');

const PRO: AcceptedCorrectionCapabilities = { exactCorrectionGrams: true, saveRecipes: true };
const FREE: AcceptedCorrectionCapabilities = { exactCorrectionGrams: false, saveRecipes: true };
const DEMO: AcceptedCorrectionCapabilities = { exactCorrectionGrams: false, saveRecipes: false };
const USER = { id: 'user-123' };

const tradeoffFixture = findOptimizationPreviewFixture('gelato-tradeoff')!;
const tradeoffView = runOptimizationPreview(tradeoffFixture);
const build = (over: Partial<Parameters<typeof buildAcceptedCorrectionDraft>[0]> = {}) =>
  buildAcceptedCorrectionDraft({
    view: tradeoffView,
    acceptedSolve: 'engine_seeded',
    originalRecipe: tradeoffFixture.recipe,
    user: USER,
    capabilities: PRO,
    ...over,
  });

describe('buildAcceptedCorrectionDraft — accepts a real, verified correction', () => {
  it('builds a draft from the engine-seeded tradeoff solve (Pro, signed in)', () => {
    const r = build();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.schemaVersion).toBe('1');
    expect(r.draft.ownerId).toBe('user-123');
    expect(r.draft.createdBy).toBe('user-123');
    expect(r.draft.recipeId).toBeNull();
    expect(r.draft.optimizerDecision).toBe('tradeoff');
    expect(r.draft.targetMode).toBe('engine_seeded');
    expect(r.draft.correctionActions.length).toBeGreaterThan(0);
    expect(r.draft.correctedRecipeSnapshot).not.toBeNull();
    expect(r.draft.originalRecipeSnapshot).toBe(tradeoffFixture.recipe); // snapshot, not a copy-mutation
    expect(r.draft.beforeMetrics.npac).toBe(tradeoffView.beforeMetrics.npac);
    expect(r.draft.afterMetrics).toEqual(tradeoffView.engineSeededSolve.afterMetrics);
    expect(r.draft.engineVersion).toBeTruthy();
    expect(r.draft.configVersion).toBeTruthy();
    expect(r.draft.sourceRecipeHash).toBe(sourceRecipeHash(tradeoffFixture.recipe));
    // and the built draft passes its own validator
    expect(validateAcceptedCorrectionDraft(r.draft)).toEqual({ valid: true, errors: [] });
  });

  it('builds a draft from the regulator-shadow solve with targetMode regulator_shadow', () => {
    const r = build({ acceptedSolve: 'regulator_shadow' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.targetMode).toBe('regulator_shadow');
    expect(r.draft.trace.rerunState).toBe('rerun_complete');
    expect(typeof r.draft.trace.improvementDetected).toBe('boolean');
  });

  it('carries the saved-recipe id when supplied', () => {
    const r = build({ savedRecipeId: 'recipe-42' });
    expect(r.ok && r.draft.recipeId === 'recipe-42').toBe(true);
  });

  it('is deterministic (no timestamps, no randomness)', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe('buildAcceptedCorrectionDraft — rejections', () => {
  it('rejects a missing user (no anonymous drafts)', () => {
    expect(build({ user: null })).toEqual({ ok: false, reason: 'missing_owner' });
    expect(build({ user: { id: '' } })).toEqual({ ok: false, reason: 'missing_owner' });
  });

  it('rejects Demo and Free — saving a correction embodies exact grams (Pro only)', () => {
    expect(build({ capabilities: DEMO })).toEqual({ ok: false, reason: 'requires_pro' });
    expect(build({ capabilities: FREE })).toEqual({ ok: false, reason: 'requires_pro' });
  });

  it('rejects a missing corrected snapshot', () => {
    const view: OptimizationPreviewView = {
      ...tradeoffView,
      engineSeededSolve: { ...tradeoffView.engineSeededSolve, correctedRecipeSnapshot: null },
    };
    expect(build({ view })).toEqual({ ok: false, reason: 'missing_corrected_snapshot' });
  });

  it('rejects an unverified rerun (no fake save of an unproven correction)', () => {
    const view: OptimizationPreviewView = {
      ...tradeoffView,
      engineSeededSolve: { ...tradeoffView.engineSeededSolve, rerunState: 'rerun_not_connected', rerun: null },
    };
    expect(build({ view })).toEqual({ ok: false, reason: 'rerun_not_verified' });
  });

  it('rejects blocked / impossible / no_action_needed — nothing true to save', () => {
    const impossible = runOptimizationPreview(findOptimizationPreviewFixture('gelato-impossible')!);
    expect(build({ view: impossible })).toEqual({ ok: false, reason: 'decision_not_saveable' });

    const ready = runOptimizationPreview(findOptimizationPreviewFixture('sorbet-ready')!);
    expect(build({ view: ready })).toEqual({ ok: false, reason: 'decision_not_saveable' });

    const blocked = runOptimizationPreview(findOptimizationPreviewFixture('granita-blocked')!);
    expect(build({ view: blocked })).toEqual({ ok: false, reason: 'decision_not_saveable' });
    // the regulator-shadow solve on granita is inactive (unsupported profile) → solve_blocked
    expect(build({ view: blocked, acceptedSolve: 'regulator_shadow' })).toEqual({ ok: false, reason: 'solve_blocked' });
  });

  it('rejects an empty original recipe snapshot', () => {
    const empty = { ...tradeoffFixture.recipe, items: [] };
    expect(build({ originalRecipe: empty })).toEqual({ ok: false, reason: 'missing_original_snapshot' });
  });
});

describe('validateAcceptedCorrectionDraft — closed key set + integrity', () => {
  const validDraft = (): AcceptedCorrectionDraft => {
    const r = build();
    if (!r.ok) throw new Error('expected ok draft');
    return r.draft;
  };

  it('rejects any extra top-level key (no product PAC/POD or Mapper field can ride along)', () => {
    const smuggled = { ...validDraft(), pac_value: 12 } as unknown as AcceptedCorrectionDraft;
    const v = validateAcceptedCorrectionDraft(smuggled);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('unexpected_key:pac_value');
  });

  it('the closed key set contains no product/Mapper write field', () => {
    for (const forbidden of ['pac_value', 'pod_value', 'product_id', 'productId', 'status', 'lifecycle_status']) {
      expect(ACCEPTED_CORRECTION_DRAFT_KEYS as readonly string[]).not.toContain(forbidden);
    }
  });

  it('rejects a tampered source-recipe hash (drift detection)', () => {
    const tampered = { ...validDraft(), sourceRecipeHash: 'deadbeef' };
    const v = validateAcceptedCorrectionDraft(tampered);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('source_recipe_hash_mismatch');
  });

  it('rejects creator/owner mismatch and non-positive gram actions', () => {
    const wrongCreator = { ...validDraft(), createdBy: 'someone-else' };
    expect(validateAcceptedCorrectionDraft(wrongCreator).errors).toContain('creator_owner_mismatch');
    const badAction = {
      ...validDraft(),
      correctionActions: [{ type: 'add', ingredient: 'Dextrose', grams: 0 }],
    };
    expect(validateAcceptedCorrectionDraft(badAction).errors).toContain('invalid_action:Dextrose');
  });

  it('sourceRecipeHash is deterministic and input-sensitive', () => {
    expect(sourceRecipeHash({ a: 1 })).toBe(sourceRecipeHash({ a: 1 }));
    expect(sourceRecipeHash({ a: 1 })).not.toBe(sourceRecipeHash({ a: 2 }));
    expect(sourceRecipeHash({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('acceptedCorrectionDraft — boundary (pure, NON-writing)', () => {
  const src = readFileSync(join(HERE, 'acceptedCorrectionDraft.ts'), 'utf8');
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('has no external-DB client, service, or Mapper import — pure module', () => {
    expect(/supabase|service_role/i.test(src)).toBe(false); // raw source incl. comments
    expect(/@\/lib\/|@\/services\/|@\/data\/products|mapper_basement/.test(stripped)).toBe(false);
    expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(stripped)).toBe(false); // barrel only
  });

  it('has no DB write path and no persistence verbs', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(stripped.includes(verb), verb).toBe(false);
    }
    expect(/saveRecipe\(|persistRecipe\(|\.save\(/.test(stripped)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(stripped)).toBe(false);
  });

  it('never mutates the preview view or the original recipe', () => {
    const viewSnapshot = JSON.stringify(tradeoffView);
    const recipeSnapshot = JSON.stringify(tradeoffFixture.recipe);
    build();
    build({ acceptedSolve: 'regulator_shadow' });
    expect(JSON.stringify(tradeoffView)).toBe(viewSnapshot);
    expect(JSON.stringify(tradeoffFixture.recipe)).toBe(recipeSnapshot);
  });
});

describe('accepted_corrections migration — LIVE (Slice 24, migration 0012)', () => {
  const proposalPath = join(ROOT, 'docs', 'spine', 'proposals', 'accepted_corrections_table.proposal.sql');
  const proposal = readFileSync(proposalPath, 'utf8');
  const migrationPath = join(ROOT, 'supabase', 'migrations', '0012_accepted_corrections.sql');
  const migration = readFileSync(migrationPath, 'utf8');

  /** Executable SQL only — full-line comments and blank lines stripped. */
  const executableSql = (sql: string) =>
    sql
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'))
      .join('\n');

  it('exists in the live migration path — 0012 (table+RLS) and 0013 (tier policy)', () => {
    const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'));
    expect(migrations.filter((f) => /accepted_correction/i.test(f))).toEqual([
      '0012_accepted_corrections.sql',
      '0013_accepted_corrections_tier_policy.sql',
    ]);
  });

  it('is the approved proposal VERBATIM apart from comments (header swap only)', () => {
    expect(executableSql(migration)).toBe(executableSql(proposal));
  });

  it('the Slice-16 proposal file remains, unchanged, as the design record it was approved from', () => {
    expect(proposalPath.includes('supabase')).toBe(false);
    expect(/PROPOSAL — NOT APPLIED/.test(proposal)).toBe(true);
  });

  it('live migration: RLS owner policies, NO update policy (immutable audit)', () => {
    expect(/enable row level security/.test(migration)).toBe(true);
    expect(/auth\.uid\(\)\s*=\s*user_id/.test(migration)).toBe(true);
    expect(/for insert with check/.test(migration)).toBe(true);
    expect(/for select using/.test(migration)).toBe(true);
    expect(/for delete using/.test(migration)).toBe(true);
    expect(/create policy [a-z_]* on public\.accepted_corrections\s*for update/.test(migration)).toBe(false);
    expect(/NO update grant/.test(migration)).toBe(true);
  });

  it('live migration: the ONLY grant is select+insert+delete to authenticated — no update, nothing to anon', () => {
    const grantStatements = migration
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('grant '));
    expect(grantStatements).toEqual([
      'grant select, insert, delete on table public.accepted_corrections to authenticated;',
    ]);
    expect(migration.includes('to anon')).toBe(false);
  });

  it('live migration: ownership, provenance and a rollback plan', () => {
    expect(/user_id uuid not null references auth\.users/.test(migration)).toBe(true);
    expect(/engine_version/.test(migration)).toBe(true);
    expect(/config_version/.test(migration)).toBe(true);
    expect(/source_recipe_hash/.test(migration)).toBe(true);
    expect(/ROLLBACK PLAN/.test(migration)).toBe(true);
    expect(/drop table if exists public\.accepted_corrections/.test(migration)).toBe(true);
  });

  it('never touches Mapper tables or product PAC/POD columns', () => {
    expect(/mapper_basement|update public\.products|alter table public\.products/i.test(migration)).toBe(false);
    expect(/mapper_basement|update public\.products|alter table public\.products/i.test(proposal)).toBe(false);
  });
});

describe('Studio — save-correction control wired (Slice 24)', () => {
  it('StudioPage mounts SaveCorrectionControl and delegates — no direct draft building or service calls', () => {
    const studio = readFileSync(join(ROOT, 'src', 'pages', 'studio', 'StudioPage.tsx'), 'utf8');
    expect(studio.includes('SaveCorrectionControl')).toBe(true);
    expect(/buildAcceptedCorrectionDraft/.test(studio)).toBe(false);
    expect(studio.includes('acceptedCorrections')).toBe(false);
  });

  it('the runner exposes the corrected snapshot for the future write path (view-only data)', () => {
    const v = previewOptimization({ recipe: tradeoffFixture.recipe, intent: tradeoffFixture.intent });
    expect(v.engineSeededSolve.correctedRecipeSnapshot).not.toBeNull();
    expect(v.regulatorShadowSolve.correctedRecipeSnapshot).not.toBeNull();
  });
});
