import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260815143100_canonical_product_projection_notes_repair.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('canonical product projection notes repair', () => {
  it('hydrates the private usage note from the real relation column', () => {
    expect(sql).toContain(
      'create or replace function public.get_canonical_product_for_account_v1(',
    );
    expect(sql).toContain("'usage_notes',r.notes");
    expect(sql).not.toMatch(/\br\.note\b/);
    expect(sql).toContain('left join public.user_product_relations r');
  });

  it('retains the account-safe visibility boundary and grants', () => {
    expect(sql).toContain('if auth.uid() is null');
    expect(sql).toContain("p.visibility='shared' and p.canonical_verification_status<>'blocked'");
    expect(sql).toContain('or p.owning_account_id=auth.uid() or p.created_by=auth.uid()');
    expect(sql).toContain('e.actor_user_id=auth.uid()');
    expect(sql).toContain(
      'revoke all on function public.get_canonical_product_for_account_v1(uuid) from public,anon',
    );
    expect(sql).toContain('to authenticated,service_role');
  });
});
