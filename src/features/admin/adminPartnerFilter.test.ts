/// <reference types="node" />
/**
 * I-ADM-02 — an admin can find a partner by e-mail, name, slug, code or id,
 * and narrow the list by status.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterAdminPartners } from './adminPartnerFilter';

const partner = (
  id: string,
  status: string,
  email: string,
  name: string,
  slug: string,
  codes: string[],
) => ({
  id,
  status,
  email,
  profile: { display_name: name, slug },
  codes: codes.map((code, index) => ({
    id: `${id}-${index}`,
    code,
    status: index === 0 ? 'active' : 'retired',
  })),
});

const ROWS = [
  partner('a1b2c3', 'active', 'kasia@example.com', 'Kasia Lody', 'kasia-lody', [
    'KASIA1',
    'KASIAOLD',
  ]),
  partner('d4e5f6', 'suspended', 'jan@example.com', 'Jan Gelato', 'jan-gelato', ['JANEK5']),
  partner('g7h8i9', 'terminated', 'ola@example.com', 'Ola', 'ola', []),
];

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('search', () => {
  it('an empty search keeps everyone', () => {
    expect(ids(filterAdminPartners(ROWS, { query: '   ', status: 'all' }))).toEqual([
      'a1b2c3',
      'd4e5f6',
      'g7h8i9',
    ]);
  });

  it('matches e-mail, display name and slug, case-insensitively', () => {
    expect(ids(filterAdminPartners(ROWS, { query: 'JAN@', status: 'all' }))).toEqual(['d4e5f6']);
    expect(ids(filterAdminPartners(ROWS, { query: 'lody', status: 'all' }))).toEqual(['a1b2c3']);
    expect(ids(filterAdminPartners(ROWS, { query: 'jan-gel', status: 'all' }))).toEqual(['d4e5f6']);
  });

  it('matches any code the partner holds — an alias too', () => {
    expect(ids(filterAdminPartners(ROWS, { query: 'kasiaold', status: 'all' }))).toEqual([
      'a1b2c3',
    ]);
    expect(ids(filterAdminPartners(ROWS, { query: 'janek5', status: 'all' }))).toEqual(['d4e5f6']);
  });

  it('matches the partner id', () => {
    expect(ids(filterAdminPartners(ROWS, { query: 'g7h8', status: 'all' }))).toEqual(['g7h8i9']);
  });

  it('a search that matches nobody returns nobody', () => {
    expect(filterAdminPartners(ROWS, { query: 'nikt', status: 'all' })).toEqual([]);
  });
});

describe('status filter', () => {
  it('narrows to one status, and combines with the search', () => {
    expect(ids(filterAdminPartners(ROWS, { query: '', status: 'suspended' }))).toEqual(['d4e5f6']);
    expect(ids(filterAdminPartners(ROWS, { query: 'kasia', status: 'suspended' }))).toEqual([]);
  });
});

describe('the Partners panel uses it', () => {
  it('renders the search and lists only the filtered partners', () => {
    const section = readFileSync(new URL('./AdminPartnersSection.tsx', import.meta.url), 'utf8');
    expect(section).toContain('filterAdminPartners(');
    expect(section).toContain('Szukaj partnera');
    expect(section).toContain('visiblePartners.map((partner) =>');
  });
});
