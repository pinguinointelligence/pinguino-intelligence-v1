/// <reference types="node" />
/**
 * D-ATTR-01 — one owner per paid subscription, enforced by the database as
 * well as by the domain rules (attribution.ts A1–A8, re-run as evidence).
 *
 * The domain decides who owns an attribution. These two partial unique indexes
 * make a second ACTIVE owner of the same subscription impossible to store —
 * by the subscription cache row and by the Stripe id alike.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const ALL = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, MIGRATIONS), 'utf8'))
  .join('\n');

const flat = (sql: string) => sql.replace(/\s+/g, ' ');
const uniqueIndex = (name: string) =>
  flat(new RegExp(`create unique index if not exists ${name}[^;]*;`, 'i').exec(ALL)?.[0] ?? '');

describe('D-ATTR-01 — one active owner per paid subscription', () => {
  it('by the subscription cache row', () => {
    expect(uniqueIndex('referral_attributions_active_owner_uniq')).toBe(
      "create unique index if not exists referral_attributions_active_owner_uniq on public.referral_attributions (subscription_id) where status = 'active' and subscription_id is not null;",
    );
  });

  it('by the Stripe subscription id', () => {
    expect(uniqueIndex('referral_attributions_active_stripe_uniq')).toBe(
      "create unique index if not exists referral_attributions_active_stripe_uniq on public.referral_attributions (stripe_subscription_id) where status = 'active' and stripe_subscription_id is not null;",
    );
  });

  it('neither index is dropped by any later migration', () => {
    expect(ALL).not.toMatch(/drop index[^;]*referral_attributions_active_(owner|stripe)_uniq/i);
  });
});
