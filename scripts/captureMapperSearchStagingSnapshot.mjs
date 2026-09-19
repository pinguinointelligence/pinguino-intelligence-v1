#!/usr/bin/env node

/**
 * Read-only rollback snapshot for the supervised FINAL-2541 Mapper sync.
 *
 * The script uses the already authenticated Supabase CLI and never reads,
 * prints or persists credentials. Output lives under supabase/.temp, which is
 * intentionally gitignored because it contains a staging database snapshot.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_PROJECT = 'tunabqqrwabacxjcxxkz';
const repo = resolve(import.meta.dirname, '..');
const linkedProject = readFileSync(resolve(repo, 'supabase/.temp/project-ref'), 'utf8').trim();
if (linkedProject !== EXPECTED_PROJECT) {
  throw new Error(`Refusing snapshot for project ${linkedProject || '<unlinked>'}`);
}

const outputDirectory = resolve(
  repo,
  'supabase/.temp/mapper-search-final-2541-rollback-20260911',
);
mkdirSync(outputDirectory, { recursive: true });

const queries = {
  mapper_basement: `select to_jsonb(m) payload from public.mapper_basement m order by m.ingredient_id`,
  mapper_reference_products: `select to_jsonb(p) payload from public.products p where p.product_kind='mapper_reference' order by p.normalized_identity,p.id`,
  mapper_reference_versions: `select to_jsonb(v) payload from public.product_versions v join public.products p on p.id=v.product_id where p.product_kind='mapper_reference' order by p.normalized_identity,v.version,v.id`,
  mapper_behavior_bindings: `select to_jsonb(b) payload from public.mapper_product_behavior_bindings b order by b.mapper_ingredient_id,b.classified_at,b.id`,
  canonical_mapper_behavior_bindings: `select to_jsonb(b) payload from public.product_behavior_bindings b join public.products p on p.id=b.product_id where p.product_kind='mapper_reference' order by p.normalized_identity,b.classified_at,b.id`,
  mapper_reclassification_queue: `select to_jsonb(q) payload from public.product_behavior_reclassification_queue q where q.entity_kind='mapper' or (q.entity_kind='catalog_product_version' and exists(select 1 from public.product_versions v join public.products p on p.id=v.product_id where v.id::text=q.entity_id and p.product_kind='mapper_reference')) order by q.queued_at,q.id`,
  mapper_constraints: `select c.conname name,pg_get_constraintdef(c.oid,true) definition from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='mapper_basement' order by c.conname`,
  runtime_functions: `select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('search_products_v1','gellatti_search_root','classify_mapper_product_behavior_v2','classify_catalog_product_behavior_v2','resolve_country_products_for_slots_v1') order by p.oid::regprocedure::text`,
  closure_census: `select jsonb_build_object('active_mapper',count(*) filter(where m.is_active),'unique_active_mapper',count(distinct m.ingredient_id) filter(where m.is_active),'max_active_mapper',max(m.ingredient_id) filter(where m.is_active),'process_metadata', (select count(*) from public.mapper_process_metadata),'mapper_roots',(select count(*) from public.products p where p.product_kind='mapper_reference' and p.is_active and p.merged_into_product_id is null),'mapper_roots_with_current_version',(select count(*) from public.products p join public.product_versions v on v.id=p.current_version_id and v.product_id=p.id where p.product_kind='mapper_reference' and p.is_active and p.merged_into_product_id is null),'mapper_roots_with_current_binding',(select count(*) from public.products p join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id and b.product_id=p.id and b.product_version_id=p.current_version_id and b.is_current where p.product_kind='mapper_reference' and p.is_active and p.merged_into_product_id is null),'current_mapper_bindings',(select count(*) from public.mapper_product_behavior_bindings b where b.is_current)) payload from public.mapper_basement m`,
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const manifest = {
  schemaVersion: 1,
  projectRef: EXPECTED_PROJECT,
  capturedAt: new Date().toISOString(),
  readOnly: true,
  files: [],
};

for (const [name, sql] of Object.entries(queries)) {
  const file = `${name}.json`;
  const filePath = resolve(outputDirectory, file);
  if (existsSync(filePath)) {
    const source = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed.rows)) throw new Error(`Existing snapshot ${file} is invalid`);
    manifest.files.push({ file, rows: parsed.rows.length, sha256: sha256(source) });
    continue;
  }
  const stdout = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output', 'json', sql],
    {
      cwd: repo,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const clean = stdout.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const parsed = JSON.parse(clean.slice(clean.indexOf('{')));
  if (!Array.isArray(parsed.rows)) throw new Error(`Snapshot query ${name} returned no rows array`);
  const source = `${JSON.stringify({ rows: parsed.rows }, null, 2)}\n`;
  writeFileSync(filePath, source, 'utf8');
  manifest.files.push({ file, rows: parsed.rows.length, sha256: sha256(source) });
}

const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(resolve(outputDirectory, 'manifest.json'), manifestSource, 'utf8');
process.stdout.write(`${JSON.stringify({ outputDirectory, manifest }, null, 2)}\n`);
