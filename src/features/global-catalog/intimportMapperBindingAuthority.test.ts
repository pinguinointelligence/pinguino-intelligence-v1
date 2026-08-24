import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260824160000_intimport_mapper_binding_authority.sql'),
  'utf8',
);
const edge = readFileSync(resolve(root, 'supabase/functions/catalog-submit/index.ts'), 'utf8');
const importer = readFileSync(resolve(root, 'src/services/productCatalogImport.ts'), 'utf8');
const mapperBefore = readFileSync(resolve(root, 'docs/ingredients/validation/mapper_basement.csv'));

describe('INTIMPORT Mapper binding is a distinct server authority', () => {
  it('uses the canonical Verified-prefix predicate without rewriting Mapper rows', () => {
    expect(migration).toContain("lower(trim(coalesce(m.verification_status,''))) like 'verified%'");
    expect(migration).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
    expect(mapperBefore.length).toBeGreaterThan(0);
  });

  it('keeps whole-profile authority distinct from signoff and independent provenance', () => {
    expect(migration).toContain('INTIMPORT_WHOLE_PROFILE_MATCH');
    expect(migration).toContain("p_source<>'catalog_import'");
    expect(migration).toContain("p_rate_action<>'catalog_import'");
    const intimportHelper = migration.slice(
      migration.indexOf('create or replace function public.bind_intimport_whole_profile_match_v1'),
      migration.indexOf('do $patch_ingest$', migration.indexOf('create or replace function public.bind_intimport_whole_profile_match_v1')),
    );
    expect(intimportHelper).not.toContain('independentProvenance');
    expect(intimportHelper).not.toContain('reviewSignoffId');
    expect(intimportHelper).not.toContain('verification_signoffs');
  });

  it('requires server-recomputed >=85, no contradiction, and the exact proposed ID', () => {
    expect(migration).toContain("p_server_authority->>'validationMode'<>'server_recomputed_whole_profile'");
    expect(migration).toContain('v_confidence<0.85');
    expect(migration).toContain("coalesce((p_server_authority->>'hardContradiction')::boolean,true)");
    expect(migration).toContain("p_server_authority->>'mapperIngredientId'<>v_mapper_id");
  });

  it('rejects manual/browser spoofing and accepts only an entitled catalog_import reservation', () => {
    expect(edge).toContain('validateIntimportWholeProfileProposal');
    expect(edge).toContain("source !== 'catalog_import'");
    expect(edge).toContain('if (canonicalCode !== proposedCode) return null;');
    expect(edge).toContain('intimportWholeProfileAuthority: serverWholeProfileAuthority');
    expect(edge).not.toMatch(/body\.intimportWholeProfileAuthority/);
    expect(migration).toContain("p_rate_action<>'catalog_import'");
    expect(migration).toContain('gellatti_ingest_rate_action_v1(p_actor_user_id,p_source)');
  });

  it('persists the parse-selected donor and never invokes the legacy matcher', () => {
    expect(edge).toContain('proposedMapperIngredientId');
    expect(migration).toContain("match_method='intimport_whole_profile_match'");
    expect(migration).toContain("'intimport_whole_profile_match'");
    expect(edge).not.toContain('productMatcher');
    expect(importer).not.toContain('matchAndSaveProduct(');
  });

  it('supports binding-only backfill without inserting a product or Mapper row', () => {
    expect(migration).toContain('resolve_intimport_existing_product_v1');
    expect(migration).toContain(
      "coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')<>'INTIMPORT'",
    );
    expect(migration).toContain('grant execute on function public.resolve_intimport_existing_product_v1');
    expect(migration).toContain("v_operation=''bind_intimport_mapper''");
    const backfill = migration.slice(
      migration.indexOf('-- Binding-only is the one-time/current-catalog path.'),
      migration.indexOf('-- Version-bound Mapper authorization is an administrator decision.', migration.indexOf('-- Binding-only is the one-time/current-catalog path.')),
    );
    expect(backfill).not.toMatch(/insert\s+into\s+public\.products/i);
    expect(migration).not.toMatch(/(insert\s+into|update)\s+public\.mapper_basement/i);
  });
});
