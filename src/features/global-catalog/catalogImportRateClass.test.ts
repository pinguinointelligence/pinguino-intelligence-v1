/**
 * The INTIMPORT exemption must be NARROW: a bulk catalogue import carries no
 * product-count quota, and nothing else changes. These tests pin both halves —
 * what is exempt, and what is emphatically not.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCatalogRateLimit, type CatalogRateEvent } from './rateLimit';

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260824100000_intimport_catalog_import_rate_class.sql',
  ),
  'utf8',
);

const events = (action: CatalogRateEvent['action'], n: number): CatalogRateEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    accountId: 'acc-1',
    action,
    at: new Date(Date.UTC(2026, 7, 24, 9, 0, i % 60)).toISOString(),
  }));

const decide = (action: CatalogRateEvent['action'], prior: CatalogRateEvent[]) =>
  evaluateCatalogRateLimit({
    accountId: 'acc-1',
    action,
    now: new Date(Date.UTC(2026, 7, 24, 9, 30, 0)).toISOString(),
    events: prior,
  });

describe('catalogue import carries no product-count quota', () => {
  it('allows far more than the manual daily cap', () => {
    expect(decide('catalog_import', events('catalog_import', 11)).allowed).toBe(true);
    expect(decide('catalog_import', events('catalog_import', 900)).allowed).toBe(true);
  });

  it('allows more than a thousand rows', () => {
    expect(decide('catalog_import', events('catalog_import', 5000)).allowed).toBe(true);
  });

  it('does not treat a repeated payload inside one file as a denial', () => {
    const prior: CatalogRateEvent[] = [
      {
        accountId: 'acc-1',
        action: 'catalog_import',
        at: '2026-08-24T09:00:00Z',
        payloadHash: 'h1',
      },
    ];
    const decision = evaluateCatalogRateLimit({
      accountId: 'acc-1',
      action: 'catalog_import',
      now: '2026-08-24T09:30:00Z',
      events: prior,
      payloadHash: 'h1',
    });
    expect(decision.allowed).toBe(true);
  });
});

describe('every other class keeps its existing limits', () => {
  it('manual candidate still stops at its daily cap', () => {
    expect(decide('manual_candidate', events('manual_candidate', 9)).allowed).toBe(true);
    const blocked = decide('manual_candidate', events('manual_candidate', 10));
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('daily');
  });

  it('scanner submissions still burst-limit', () => {
    const blocked = evaluateCatalogRateLimit({
      accountId: 'acc-1',
      action: 'ocr_scan',
      now: '2026-08-24T09:00:30Z',
      events: [
        { accountId: 'acc-1', action: 'ocr_scan', at: '2026-08-24T09:00:00Z' },
        { accountId: 'acc-1', action: 'ocr_scan', at: '2026-08-24T09:00:10Z' },
        { accountId: 'acc-1', action: 'ocr_scan', at: '2026-08-24T09:00:20Z' },
      ],
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('burst');
  });

  it('a flood of catalogue imports does not consume the manual allowance', () => {
    // Different action → different bucket. Importing a catalogue must not cost
    // the owner their ordinary manual product creations.
    expect(decide('manual_candidate', events('catalog_import', 5000)).allowed).toBe(true);
  });
});

describe('the exemption is earned server-side, not claimed by the client', () => {
  it('grants the unmetered class only to an admin or a paid entitlement', () => {
    expect(MIGRATION).toContain("when p_source='catalog_import'");
    expect(MIGRATION).toContain('gellatti_has_paid_access_v1(p_actor_user_id)');
    // Anyone else sending source=catalog_import lands on the manual quota.
    expect(MIGRATION).toContain("else 'manual_candidate'");
  });

  it('leaves the manual candidate quota itself untouched', () => {
    expect(MIGRATION).toContain("if v_count>=10*v_multiplier then v_reason:='daily'; end if;");
  });

  it('keeps IP and device risk guarding the other classes', () => {
    expect(MIGRATION).toContain("v_reason:='ip_risk'");
    expect(MIGRATION).toContain("v_reason:='device_risk'");
    // …while a catalogue import neither trips them nor inflates them.
    expect(MIGRATION).toContain("action<>'catalog_import'");
  });
});
