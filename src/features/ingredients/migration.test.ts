/// <reference types="node" />
/**
 * Phase Ingredients 1 — the ingredients migration must expose a PI Pro-only
 * read policy (reusing the 2B.1 subscriptions cache), grant no anon access and
 * no writes, and depend on no privileged server role.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(join(REPO, 'supabase', 'migrations', '0004_ingredients.sql'), 'utf8');

describe('Phase Ingredients 1 migration (0004)', () => {
  it('creates the ingredients table with a unique ingredient_id key', () => {
    expect(SQL.includes('create table if not exists public.ingredients')).toBe(true);
    expect(/ingredient_id\s+text\s+primary key/.test(SQL)).toBe(true);
  });

  it('enables row level security', () => {
    expect(SQL.includes('alter table public.ingredients enable row level security')).toBe(true);
  });

  it('exposes a single PI Pro-only SELECT policy keyed on the subscriptions table', () => {
    expect(SQL.includes('ingredients_select_pro')).toBe(true);
    expect(/for\s+select/i.test(SQL)).toBe(true);
    expect(/to\s+authenticated/i.test(SQL)).toBe(true);
    expect(SQL.includes('public.subscriptions')).toBe(true);
    expect(SQL.includes('subscription_status')).toBe(true);
    // Pro = active / trialing, plus past_due until current_period_end
    expect(SQL.includes("'active'")).toBe(true);
    expect(SQL.includes("'trialing'")).toBe(true);
    expect(SQL.includes("'past_due'")).toBe(true);
    expect(/current_period_end\s*>\s*now\(\)/.test(SQL)).toBe(true);
    // only active, approved rows are ever visible
    expect(SQL.includes('approved_for_pinguino_base')).toBe(true);
    expect(SQL.includes('is_active')).toBe(true);
  });

  it('gives anon and free users no permissive read path', () => {
    // no blanket `using (true)` policy that would expose the library
    expect(/using\s*\(\s*true\s*\)/i.test(SQL)).toBe(false);
    // nothing is granted or policied to anon
    expect(/to\s+anon/i.test(SQL)).toBe(false);
  });

  it('grants SELECT to authenticated only, with no write policy or grant', () => {
    expect(/grant\s+select\s+on\s+public\.ingredients\s+to\s+authenticated/i.test(SQL)).toBe(true);
    expect(/for\s+(insert|update|delete)/i.test(SQL)).toBe(false);
    expect(/grant\s+(insert|update|delete)/i.test(SQL)).toBe(false);
  });

  it('does not depend on a privileged server role', () => {
    expect(/service[_-]?role/i.test(SQL)).toBe(false);
  });
});
