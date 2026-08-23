/**
 * Migration 20260823110000 — a failed product save leaves the scan RETRYABLE (owner v1.4 §15).
 *
 * Found while re-running the owner's Cacao Puro finalize after the classifier fix: the call
 * answered HTTP 429 `scanner_product_quota_reached` on an account holding exactly ONE reservation
 * ever — and that one already `released`. `reserve_product_scan_creation_v1` short-circuited on the
 * idempotency key with `allowed = status <> 'released'`, so the slot the failed save had correctly
 * given back still blocked the key forever. Because the scanner derives the key from the session
 * (`<sessionId>:create-v1`), every scan that hit a save failure became permanently unsavable.
 *
 * The three statuses must keep meaning three different things, and the no-duplicate guarantee for
 * `consumed` must survive the fix — that is what this pins.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260823110000_product_scan_retry_after_failed_save.sql'),
  'utf8',
).replace(/--.*$/gm, '');

const BODY = SQL.slice(SQL.indexOf('select * into v_existing'));

describe('reserve_product_scan_creation_v1 — retry after a failed save', () => {
  it('no longer refuses a released reservation outright', () => {
    expect(SQL).not.toContain("'allowed',v_existing.status<>'released'");
  });

  it('re-opens a RELEASED slot instead of treating it as spent quota', () => {
    expect(BODY).toContain("if v_existing.status <> 'released' then");
    expect(BODY).toContain('v_reopen := true;');
    expect(BODY).toMatch(/update public\.product_scan_creation_reservations set\s*\n\s*status='reserved'/);
  });

  it('still returns the EXISTING product for a consumed slot — a retry never duplicates', () => {
    expect(BODY).toContain("'consumed',v_existing.status='consumed'");
    expect(BODY).toContain("'productId',v_existing.product_id");
  });

  it('an in-flight (reserved) slot is still idempotent, not a second reservation', () => {
    expect(BODY).toContain("'idempotent',true");
  });

  it('a re-opened slot passes the SAME limits as a fresh one (retry is not a way around them)', () => {
    const reopenAt = BODY.indexOf('if v_reopen then');
    for (const limit of [
      'pro_monthly_product_limit',
      'basic_monthly_product_limit',
      'basic_daily_product_limit',
    ]) {
      const at = BODY.indexOf(limit);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(reopenAt); // every ceiling is evaluated before the re-open
    }
  });

  it('reuses the row so one scan keeps exactly one reservation', () => {
    expect(BODY).toContain('where id=v_existing.id');
    // the fresh-insert path stays reachable for a genuinely new key
    expect(BODY).toContain('insert into public.product_scan_creation_reservations(');
  });

  it('keeps counting only reserved+consumed toward every ceiling', () => {
    expect(BODY.match(/status in \('reserved','consumed'\)/g)?.length).toBe(3);
  });

  it('keeps the ownership and readiness preconditions ahead of everything else', () => {
    const guard = SQL.indexOf("'scan_not_ready'");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(SQL.indexOf('select * into v_existing'));
    expect(SQL).toContain('pg_advisory_xact_lock');
  });
});
