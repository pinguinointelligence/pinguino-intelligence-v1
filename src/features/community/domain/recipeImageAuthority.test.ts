import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRANDED_PROFILE_IMAGE,
  brandedProfileKey,
  communityPhotoAccepted,
  resolveRecipeImage,
} from './recipeImageAuthority';

describe('§23 — one order of preference, decided once', () => {
  it('the user’s own photograph outranks everything', () => {
    const decision = resolveRecipeImage({
      userImageUrl: 'https://cdn.example/mine.jpg',
      libraryFlavorCode: 'FL-000001',
      profile: 'sorbet',
    });
    expect(decision).toEqual({
      url: 'https://cdn.example/mine.jpg',
      origin: 'user_photo',
      isPlaceholder: false,
    });
  });

  it('one of OUR library recipes uses that recipe’s own picture', () => {
    const decision = resolveRecipeImage({ libraryFlavorCode: 'FL-000001', profile: 'sorbet' });
    expect(decision.origin).toBe('library_recipe');
    expect(decision.url).toMatch(/^\/recipes\/FL-000001/);
    expect(decision.isPlaceholder).toBe(false);
  });

  it('a user’s own recipe with no photograph gets its branded profile card', () => {
    for (const [profile, expected] of [
      ['sorbet', BRANDED_PROFILE_IMAGE.sorbet],
      ['vegan_gelato', BRANDED_PROFILE_IMAGE.vegan],
      ['protein_gelato', BRANDED_PROFILE_IMAGE.protein],
      ['standard_gelato', BRANDED_PROFILE_IMAGE.gelato],
    ] as const) {
      const decision = resolveRecipeImage({ profile });
      expect(decision.url, profile).toBe(expected);
      expect(decision.origin).toBe('branded_profile');
      expect(decision.isPlaceholder).toBe(true);
    }
  });

  it('always answers — an unknown profile, blank strings and nothing at all', () => {
    expect(resolveRecipeImage({}).url).toBe(BRANDED_PROFILE_IMAGE.gelato);
    expect(resolveRecipeImage({ userImageUrl: '   ', libraryFlavorCode: '  ' }).url).toBe(
      BRANDED_PROFILE_IMAGE.gelato,
    );
    expect(resolveRecipeImage({ profile: 'something we never shipped' }).origin).toBe(
      'branded_profile',
    );
  });

  it('an unknown library code is simply not a library recipe', () => {
    expect(resolveRecipeImage({ libraryFlavorCode: 'FL-999999', profile: 'sorbet' }).url).toBe(
      BRANDED_PROFILE_IMAGE.sorbet,
    );
  });

  it('reads every name the application uses for a profile', () => {
    expect(brandedProfileKey('Sorbet')).toBe('sorbet');
    expect(brandedProfileKey('granita')).toBe('sorbet');
    expect(brandedProfileKey('vegan_gelato')).toBe('vegan');
    expect(brandedProfileKey('Protein Gelato')).toBe('protein');
    expect(brandedProfileKey('chocolate_gelato')).toBe('gelato');
    expect(brandedProfileKey(null)).toBe('gelato');
  });

  it('the four placeholder files really exist, so nothing renders a broken frame', () => {
    for (const url of Object.values(BRANDED_PROFILE_IMAGE)) {
      expect(existsSync(`public${url}`), url).toBe(true);
    }
  });
});

describe('§24 — Community takes the maker’s OWN photograph, and only that', () => {
  it('refuses our branded profile cards', () => {
    for (const url of Object.values(BRANDED_PROFILE_IMAGE)) {
      expect(communityPhotoAccepted(url), url).toBe(false);
    }
  });

  it('refuses our own library recipe renders', () => {
    expect(communityPhotoAccepted('/recipes/FL-000001_chocolate_fudge_with_brown_sugar.webp')).toBe(
      false,
    );
  });

  it('refuses no photograph at all', () => {
    expect(communityPhotoAccepted(null)).toBe(false);
    expect(communityPhotoAccepted('')).toBe(false);
    expect(communityPhotoAccepted('   ')).toBe(false);
  });

  it('accepts a photograph the maker supplied', () => {
    expect(communityPhotoAccepted('https://cdn.example/storage/community/mine.jpg')).toBe(true);
  });
});
