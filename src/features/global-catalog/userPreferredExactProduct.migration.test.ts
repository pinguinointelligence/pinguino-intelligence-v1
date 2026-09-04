import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260903173641_user_preferred_exact_product_slots.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('user preferred exact-product authority migration', () => {
  it('enforces one explicit product pointer per user and canonical Mapper slot', () => {
    expect(migration).toContain('create table public.user_preferred_product_slots');
    expect(migration).toContain('primary key (user_id, mapper_ingredient_id)');
    expect(migration).toContain(
      'preferred_product_id uuid not null references public.products(id) on delete cascade',
    );
    expect(migration).not.toMatch(/unique\s*\(\s*mapper_ingredient_id\s*\)/i);
  });

  it('accepts only a currently usable exact product truthfully bound to the same slot', () => {
    const validator = migration.slice(
      migration.indexOf('create or replace function private.user_preferred_product_slot_is_usable_v1'),
      migration.indexOf('create or replace function private.validate_user_preferred_product_slot_v1'),
    );
    expect(validator).toContain('public.can_use_product_relation_v1(p_user_id, p_product_id)');
    expect(validator).toContain("p.product_kind in ('commercial_product', 'customer_provisional')");
    expect(validator).toContain('b.id = p.current_behavior_binding_id');
    expect(validator).toContain('b.product_version_id = p.current_version_id');
    expect(validator).toContain('b.is_current');
    expect(validator).toContain("b.binding_status = 'ready'");
    expect(validator).toContain('b.mapper_ingredient_id = btrim(p_mapper_ingredient_id)');
    expect(migration).toContain("raise exception 'preferred_product_slot_mismatch'");
  });

  it('replaces the same user/slot pointer only through an explicit setter', () => {
    const setter = migration.slice(
      migration.indexOf('create or replace function public.set_user_preferred_product_for_slot_v1'),
      migration.indexOf('create or replace function public.clear_user_preferred_product_for_slot_v1'),
    );
    expect(setter).toContain('v_user_id uuid := auth.uid()');
    expect(setter).toContain('on conflict (user_id, mapper_ingredient_id) do update');
    expect(setter).toContain('preferred_product_id = excluded.preferred_product_id');
    expect(setter).not.toMatch(/favorite|recently_used_at|last_used_at/i);
    expect(migration).toContain(
      'revoke all on table public.user_preferred_product_slots from public, anon, authenticated',
    );
    expect(migration).not.toContain(
      'grant select on table public.user_preferred_product_slots to authenticated',
    );
    expect(migration).toContain(
      'grant execute on function public.set_user_preferred_product_for_slot_v1(text, uuid)',
    );
  });

  it('returns no active override after deletion, unavailability, or a binding change', () => {
    const getter = migration.slice(
      migration.indexOf('create or replace function public.get_user_preferred_product_for_slot_v1'),
      migration.indexOf('create or replace function public.set_user_preferred_product_for_slot_v1'),
    );
    expect(getter).toContain('private.user_preferred_product_slot_is_usable_v1(');
    expect(getter).toContain('return v_product_id');
    expect(migration).toContain('on delete cascade');
    expect(migration).not.toMatch(/order\s+by[\s\S]*recent/i);
  });

  it('keeps every row user-private and country/default resolution out of this authority', () => {
    expect(migration).toContain('alter table public.user_preferred_product_slots enable row level security');
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      expect(migration).toContain(`user_preferred_product_slots_${operation}_own`);
    }
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
    expect(migration).not.toMatch(/country_default|country_local|primary_market|additional_market/i);
  });
});
