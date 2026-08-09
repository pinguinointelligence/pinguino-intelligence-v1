/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '0037_customer_ingredient_prices.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

describe('0037 private current customer prices', () => {
  it('requires a real Mapper canonical identity and one current row per owner + ingredient', () => {
    expect(CODE).toContain('references public.mapper_basement(ingredient_id)');
    expect(CODE).toContain('unique (owner_user_id, canonical_ingredient_id)');
  });

  it('is owner-private and pins created_by to the authenticated owner', () => {
    expect(CODE).toContain('alter table public.customer_ingredient_prices enable row level security');
    expect(CODE).toContain('auth.uid() = owner_user_id and auth.uid() = created_by');
    expect(CODE).not.toMatch(/grant[^;]*\bto anon\b/i);
  });

  it('uses server time and keeps ownership/identity/creator immutable on update', () => {
    expect(CODE).toContain('touch_customer_ingredient_price_updated_at');
    expect(CODE).toContain('new.updated_at = now()');
    for (const field of ['owner_user_id', 'canonical_ingredient_id', 'created_by', 'created_at']) {
      expect(CODE).toContain(`new.${field} = old.${field}`);
    }
  });
});

