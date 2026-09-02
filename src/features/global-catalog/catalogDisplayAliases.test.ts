import { describe, expect, it } from 'vitest';
import {
  canonicalFamilyAliasKeysPl,
  canonicalFamilyLabelPl,
  catalogQualifierPl,
  isGenericBrandPlaceholder,
} from './catalogDisplayAliases';

describe('catalog display aliases (dynamic data — DISPLAY ALIAS ONLY)', () => {
  it('localises generic canonical family values', () => {
    expect(canonicalFamilyLabelPl('General')).toBe('Ogólne');
    expect(canonicalFamilyLabelPl('dairy')).toBe('Nabiał');
    expect(canonicalFamilyLabelPl('nut_paste')).toBe('Orzechy');
    expect(canonicalFamilyLabelPl('strawberry')).toBe('Truskawka');
  });

  it('is case- and separator-insensitive on the lookup only', () => {
    expect(canonicalFamilyLabelPl('GENERAL')).toBe('Ogólne');
    expect(canonicalFamilyLabelPl('nut paste')).toBe('Orzechy');
    expect(canonicalFamilyLabelPl('nut-paste')).toBe('Orzechy');
  });

  it('returns an unknown catalog value EXACTLY as stored', () => {
    // canonical identity and unmapped dynamic data are never rewritten
    expect(canonicalFamilyLabelPl('SOME_NEW_FAMILY')).toBe('SOME_NEW_FAMILY');
    expect(canonicalFamilyLabelPl('Ravifruit Puree')).toBe('Ravifruit Puree');
  });

  it('passes null/undefined through untouched', () => {
    expect(canonicalFamilyLabelPl(null)).toBeNull();
    expect(canonicalFamilyLabelPl(undefined)).toBeNull();
  });

  it('every alias key is a lowercase canonical token', () => {
    for (const key of canonicalFamilyAliasKeysPl()) {
      expect(key).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    }
  });
});

describe('catalog qualifier — real brands stay exact, placeholders localize', () => {
  it('keeps a real commercial brand byte-exact', () => {
    expect(catalogQualifierPl('Mlekovita', 'dairy', 'dairy')).toBe('Mlekovita');
    expect(catalogQualifierPl('HARIBO', null, null)).toBe('HARIBO');
    expect(catalogQualifierPl('La Chocolatera', 'chocolate', null)).toBe('La Chocolatera');
    expect(catalogQualifierPl('Ravifruit', null, null)).toBe('Ravifruit');
  });

  it('falls through generic brand placeholders to the localized family', () => {
    expect(isGenericBrandPlaceholder('General')).toBe(true);
    expect(isGenericBrandPlaceholder('Mlekovita')).toBe(false);
    expect(catalogQualifierPl('General', 'fruit', null)).toBe('Owoce');
    expect(catalogQualifierPl('General', null, 'dairy')).toBe('Nabiał');
    expect(catalogQualifierPl('', null, 'stabilizer')).toBe('Stabilizatory');
  });

  it('returns null when nothing is known, so the caller can show its own default', () => {
    expect(catalogQualifierPl(null, null, null)).toBeNull();
    expect(catalogQualifierPl('General', null, null)).toBeNull();
  });
});
