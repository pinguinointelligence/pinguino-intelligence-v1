/// <reference types="node" />
/**
 * E-REV-04 — the profile's moderation status and the partner's status and tier
 * read as copy on /partner, never as the database's own values.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PARTNER_STATUS_COPY,
  PARTNER_TIER_COPY,
  PROFILE_MODERATION_COPY,
  partnerStatusCopy,
  partnerTierCopy,
  profileModerationCopy,
} from './partnerAccountDisplay';

const partnerPage = readFileSync(
  new URL('../../pages/community/PartnerPage.tsx', import.meta.url),
  'utf8',
);

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/**
 * The values a column's CHECK allows, read from whichever migration creates the
 * table — found by content, so a rename cannot break the lookup.
 */
const checkValues = (table: string, column: string): string[] => {
  const opener = `create table if not exists public.${table} (`;
  const pattern = new RegExp(
    `\\b${column}\\b[^,]*?check\\s*\\(\\s*${column} in \\(([^)]*)\\)\\s*\\)`,
  );
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const start = sql.indexOf(opener);
    if (start < 0) continue;
    const values = sql.slice(start, sql.indexOf('\n);', start)).match(pattern)?.[1];
    if (!values) throw new Error(`public.${table}.${column} has no CHECK`);
    return [...values.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '').sort();
  }
  throw new Error(`no migration creates public.${table}`);
};

describe('every value the database allows has copy', () => {
  it('profile moderation', () => {
    expect(Object.keys(PROFILE_MODERATION_COPY).sort()).toEqual(
      checkValues('partner_public_profiles', 'moderation_status'),
    );
  });

  it('partner status', () => {
    expect(Object.keys(PARTNER_STATUS_COPY).sort()).toEqual(checkValues('partners', 'status'));
  });

  it('partner tier', () => {
    expect(Object.keys(PARTNER_TIER_COPY).sort()).toEqual(checkValues('partners', 'tier'));
  });

  it('no label is a raw value, and every state explains itself', () => {
    const all = [
      ...Object.values(PROFILE_MODERATION_COPY),
      ...Object.values(PARTNER_STATUS_COPY),
      ...Object.values(PARTNER_TIER_COPY),
    ];
    for (const copy of all) {
      expect(copy.label).not.toMatch(/_|^[A-Z]{2,}$|^[a-z]+$/);
      expect(copy.help.length).toBeGreaterThan(0);
    }
  });

  it('an unknown value degrades to a dash instead of leaking', () => {
    expect(profileModerationCopy(undefined).label).toBe('—');
    expect(partnerStatusCopy('paused').label).toBe('—');
    expect(partnerTierCopy('platinum').label).toBe('—');
  });
});

describe('the partner page prints none of them raw', () => {
  it('Profile and Settings go through the display maps', () => {
    expect(partnerPage).not.toContain("profile?.moderationStatus ?? '—'");
    expect(partnerPage).not.toContain("['Status', data.partner?.status]");
    expect(partnerPage).not.toContain("['Tier', data.partner?.tier]");
    expect(partnerPage).toContain('profileModerationCopy(profile?.moderationStatus)');
    expect(partnerPage).toContain('partnerStatusCopy(data.partner?.status)');
    expect(partnerPage).toContain('partnerTierCopy(data.partner?.tier)');
  });
});
