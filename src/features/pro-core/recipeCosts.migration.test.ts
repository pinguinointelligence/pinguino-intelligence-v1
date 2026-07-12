/// <reference types="node" />
/**
 * 0029 recipe-costs migration guard — contract-lockstep + safety invariants, proven statically
 * against the SQL text (comment-stripped). No live DB.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CostBasis, PurchaseUnit } from './costContracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0029_recipe_costs.sql'), 'utf8');
const CODE = SQL.replace(/--.*$/gm, '');

const TABLES = ['ingredient_cost_entries', 'recipe_cost_snapshots'] as const;
const UNITS: PurchaseUnit[] = ['g', 'kg', 'ml', 'l', 'unit', 'package'];
const BASES: CostBasis[] = ['net', 'gross'];

const parseSet = (re: RegExp) => new Set(CODE.match(re)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) ?? []);

describe('0029 recipe-costs migration — shape & lockstep', () => {
  it('creates the two additive tables and recreates no existing one', () => {
    for (const t of TABLES) expect(CODE.includes(`create table if not exists public.${t}`), t).toBe(true);
    for (const owned of ['saved_recipes', 'recipe_versions', 'production_runs', 'products', 'entitlements']) {
      expect(new RegExp(`create table (if not exists )?public\\.${owned}\\b`).test(CODE), owned).toBe(false);
    }
    expect(/mapper_basement/.test(CODE)).toBe(false);
  });

  it('enables RLS on every table', () => {
    for (const t of TABLES) expect(CODE.includes(`alter table public.${t} enable row level security`), t).toBe(true);
  });

  it('snapshots reference the recipe + exact version (+ optional run)', () => {
    expect(CODE.includes('recipe_id uuid not null references public.saved_recipes(id)')).toBe(true);
    expect(CODE.includes('recipe_version_id uuid not null references public.recipe_versions(id)')).toBe(true);
    expect(CODE.includes('production_run_id uuid references public.production_runs(id)')).toBe(true);
  });

  it('purchase-unit + basis checks are lockstep with the TS unions', () => {
    expect(parseSet(/purchase_unit in\s*\(([^)]*)\)/)).toEqual(new Set(UNITS));
    expect(parseSet(/basis in\s*\(([^)]*)\)/)).toEqual(new Set(BASES));
  });

  it('constrains positive quantity/price and an ISO currency', () => {
    expect(/purchase_quantity numeric not null check \(purchase_quantity > 0\)/.test(CODE)).toBe(true);
    expect(/price numeric not null check \(price >= 0\)/.test(CODE)).toBe(true);
    expect(/currency text not null check \(currency ~ '\^\[A-Z\]\{3\}\$'\)/.test(CODE)).toBe(true);
  });
});

describe('0029 — cost safety invariants', () => {
  it('authorizes by auth.uid(), never email', () => {
    expect(CODE.includes('auth.uid()')).toBe(true);
    expect(/using \([^)]*email|with check \([^)]*email/i.test(CODE)).toBe(false);
  });

  it('cost snapshots are immutable: no update/delete policy or grant', () => {
    expect(/on public\.recipe_cost_snapshots\s+for (update|delete)/.test(CODE)).toBe(false);
    expect(/grant[^;]*(update|delete)[^;]*recipe_cost_snapshots to authenticated/.test(CODE)).toBe(false);
    expect(/grant select, insert on public\.recipe_cost_snapshots to authenticated/.test(CODE)).toBe(true);
  });

  it('cost entries are the owner\'s editable price list (full CRUD)', () => {
    expect(/grant select, insert, update, delete on public\.ingredient_cost_entries to authenticated/.test(CODE)).toBe(true);
  });

  it('grants nothing to anon', () => {
    expect(/to anon\b/.test(CODE)).toBe(false);
  });
});
