import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDir = resolve(process.cwd(), 'supabase/migrations');
const migrations = readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, sql: readFileSync(resolve(migrationDir, file), 'utf8') }));

const legacyResolver = migrations.find(
  ({ file }) => file === '20260824160000_intimport_mapper_binding_authority.sql',
);
const productOwnedArchitecture = migrations.find(
  ({ file }) => file === '20260824203000_product_owned_profile_authority.sql',
);
const activeResolver = migrations
  .filter(({ sql }) =>
    sql.includes('create or replace function public.resolve_intimport_existing_product_v1('),
  )
  .at(-1);

describe('INTIMPORT product-owned upsert snapshot resolver', () => {
  it('reproduces the HTTP 400 drift between the retired binding guard and product-owned upsert', () => {
    expect(legacyResolver?.sql).toContain(
      "coalesce(p_input->>'operation','')<>'bind_intimport_mapper'",
    );
    expect(productOwnedArchitecture?.sql).toContain(
      "v_operation not in (''upsert'',''retire'')",
    );
  });

  it('makes the final resolver accept the canonical default/upsert operation', () => {
    expect(activeResolver?.sql).toContain(
      "coalesce(nullif(p_input->>'operation',''),'upsert')<>'upsert'",
    );
    expect(activeResolver?.sql).not.toContain(
      "coalesce(p_input->>'operation','')<>'bind_intimport_mapper'",
    );
  });

  it('keeps entitlement, exact INTIMPORT identity, ownership and read-only Mapper boundaries', () => {
    expect(activeResolver?.sql).toContain(
      "public.gellatti_ingest_rate_action_v1(p_actor_user_id,p_source)<>'catalog_import'",
    );
    expect(activeResolver?.sql).toContain(
      "coalesce(p_input#>>'{facts,catalogImportIdentity,system}','')<>'INTIMPORT'",
    );
    expect(activeResolver?.sql).toContain("p.created_by=p_actor_user_id or v_is_admin");
    expect(activeResolver?.sql).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
  });
});
