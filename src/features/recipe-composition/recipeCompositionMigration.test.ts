import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812034500_recipe_composition_toppings_and_defaults.sql'),
  'utf8',
).replace(/\r\n?/g, '\n');

describe('0042 Base/Topping persistence migration', () => {
  it('fails closed when required product-composition JSON members are missing', () => {
    expect(sql.match(/\) is true\)/g)).toHaveLength(2);
    expect(sql).toContain("jsonb_typeof(product_composition->'toppings') = 'array'");
    expect(sql).toContain("jsonb_typeof(product_composition->'baseOrder') = 'array'");
  });

  it('retires the legacy 12-argument save RPC before publishing the sidecar overload', () => {
    const drop = sql.indexOf('drop function if exists public.create_recipe_with_v1(');
    const create = sql.indexOf('create or replace function public.create_recipe_with_v1(');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(sql.slice(drop, create)).toContain(
      'text, text, jsonb, integer, numeric, text, text, text, text, numeric, text, text\n);',
    );
  });

  it('keeps account defaults owner-scoped and limited to canonical product contexts', () => {
    expect(sql).toContain("product_context_key in ('gelato', 'sorbet', 'vegan', 'protein')");
    expect(sql).toContain('for select using (auth.uid() = owner_user_id)');
    expect(sql).toContain('for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)');
    expect(sql).toContain('revoke all on public.user_recipe_defaults from public, anon');
  });
});
