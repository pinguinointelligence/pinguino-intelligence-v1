import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductCategory, RecipeItem } from '@/engine';
import { visibleProductTypeFor } from '@/features/home-creator/homeProfileMapping';
import type { IntentProfile } from '@/features/home-creator/homeIntentParsing';
import {
  internalCategoryFor,
  visibleTypeOf,
  type VisibleProductType,
} from '@/features/studio/productType';
import {
  BRANDED_PROFILE_IMAGE,
  brandedProfileKey,
  communityPhotoAccepted,
  resolveRecipeImage,
  type BrandedProfileKey,
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

/** Width × height from a baseline or progressive JPEG's start-of-frame segment. */
function jpegFrame(bytes: Buffer): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

describe('owner-approved share photos (2026-09-17)', () => {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it('each profile names its own file — gelato, sorbet, vegan, protein, never by position', () => {
    expect(BRANDED_PROFILE_IMAGE).toEqual({
      gelato: '/brand/profile/gelato.jpg',
      sorbet: '/brand/profile/sorbet.jpg',
      vegan: '/brand/profile/vegan.jpg',
      protein: '/brand/profile/protein.jpg',
    });
  });

  it('every file is a real square JPEG, not a renamed PNG, and light enough for a share page', () => {
    for (const url of Object.values(BRANDED_PROFILE_IMAGE)) {
      const bytes = readFileSync(`public${url}`);
      expect(bytes.subarray(0, 4).equals(PNG_SIGNATURE), url).toBe(false);
      const frame = jpegFrame(bytes);
      expect(frame, url).not.toBeNull();
      // Square: the share page frames them square, so nothing is cropped.
      expect(frame!.width, url).toBe(frame!.height);
      expect(frame!.width, url).toBeGreaterThanOrEqual(1024);
      expect(bytes.length, url).toBeLessThan(800 * 1024);
    }
  });

  it('nothing but the authority names a profile file (one mapping for HOME, PRO, mobile and recipient)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (full.endsWith('recipeImageAuthority.ts')) continue;
          if (readFileSync(full, 'utf8').includes('/brand/profile/')) offenders.push(full);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});

describe('customer share from HOME and PRO — own photo, otherwise the version profile card', () => {
  const MILK: RecipeItem[] = [];
  /** Every `ProductCategory` a saved version can carry, and the profile the app reopens it as. */
  const ALL_CATEGORIES = [
    'milk_gelato',
    'fruit_gelato',
    'nut_gelato',
    'chocolate_gelato',
    'alcohol_gelato',
    'sorbet',
    'vegan_gelato',
    'protein_gelato',
    'custom',
  ] as const satisfies readonly ProductCategory[];
  type Missing = Exclude<ProductCategory, (typeof ALL_CATEGORIES)[number]>;
  const exhaustive: [Missing] extends [never] ? true : false = true;

  const shareImage = (category: ProductCategory, userImageUrl?: string | null) =>
    resolveRecipeImage({ context: 'customer_share', profile: category, userImageUrl });

  it('HOME × four types × no photo → that type’s delivered photograph', () => {
    const home: ReadonlyArray<readonly [IntentProfile, BrandedProfileKey]> = [
      ['gelato', 'gelato'],
      ['sorbet', 'sorbet'],
      ['vegan', 'vegan'],
      ['protein', 'protein'],
    ];
    for (const [profile, expected] of home) {
      // HOME speaks IntentProfile; the saved version carries the Engine category.
      const category = internalCategoryFor(visibleProductTypeFor(profile), MILK, 'milk_gelato');
      const decision = shareImage(category);
      expect(decision.url, `HOME ${profile} → ${category}`).toBe(BRANDED_PROFILE_IMAGE[expected]);
      expect(decision.origin).toBe('branded_profile');
    }
  });

  it('PRO × four types × no photo → that type’s delivered photograph', () => {
    const pro: ReadonlyArray<readonly [VisibleProductType, BrandedProfileKey]> = [
      ['gelato', 'gelato'],
      ['sorbet', 'sorbet'],
      ['vegan', 'vegan'],
      ['protein', 'protein'],
    ];
    for (const [visible, expected] of pro) {
      const category = internalCategoryFor(visible, MILK, 'milk_gelato');
      const decision = shareImage(category);
      expect(decision.url, `PRO ${visible} → ${category}`).toBe(BRANDED_PROFILE_IMAGE[expected]);
      expect(decision.origin).toBe('branded_profile');
    }
  });

  it('the card always matches the profile the app reopens that version as', () => {
    expect(exhaustive).toBe(true);
    for (const category of ALL_CATEGORIES) {
      expect(brandedProfileKey(category), category).toBe(visibleTypeOf(category));
      expect(shareImage(category).url).toBe(BRANDED_PROFILE_IMAGE[visibleTypeOf(category)]);
    }
  });

  it('the customer’s own photograph wins over the profile card', () => {
    const own = 'https://project.supabase.co/storage/v1/object/sign/x/own.jpg?token=t';
    for (const category of ALL_CATEGORIES) {
      expect(shareImage(category, own)).toEqual({
        url: own,
        origin: 'user_photo',
        isPlaceholder: false,
      });
    }
  });

  it('a version that started from a library recipe still gets the profile card, not the library picture', () => {
    const decision = resolveRecipeImage({
      context: 'customer_share',
      libraryFlavorCode: 'FL-000001',
      profile: 'sorbet',
    });
    expect(decision.origin).toBe('branded_profile');
    expect(decision.url).toBe(BRANDED_PROFILE_IMAGE.sorbet);
    expect(decision.isPlaceholder).toBe(true);
  });

  it('outside a customer share the library picture is untouched', () => {
    const decision = resolveRecipeImage({ libraryFlavorCode: 'FL-000001', profile: 'sorbet' });
    expect(decision.origin).toBe('library_recipe');
    expect(decision.url).toMatch(/^\/recipes\/FL-000001/);
  });

  it('a placeholder is never reported as the customer’s own photograph', () => {
    for (const category of ALL_CATEGORIES) {
      for (const blank of [null, undefined, '', '   ']) {
        const decision = shareImage(category, blank);
        expect(decision.origin).toBe('branded_profile');
        expect(decision.isPlaceholder).toBe(true);
      }
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

  it('accepts a photograph the maker uploaded to the Community photo bucket', () => {
    expect(
      communityPhotoAccepted(
        'https://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/public/community-recipe-images/5f0c7b1e-2d7a-4c1e-9d2b-0f6f3f0f9a11/8a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg',
      ),
    ).toBe(true);
  });

  it('refuses our branded cards and library pictures in absolute form', () => {
    for (const origin of ['https://staging.pinguinoai.com', 'https://gellatti.com']) {
      for (const url of Object.values(BRANDED_PROFILE_IMAGE)) {
        expect(communityPhotoAccepted(`${origin}${url}`), `${origin}${url}`).toBe(false);
      }
      expect(communityPhotoAccepted(`${origin}/recipes/FL-000001_chocolate.webp`)).toBe(false);
    }
  });

  it('refuses an asset with an upload path smuggled into the query, the fragment or dot segments', () => {
    const upload =
      '/storage/v1/object/public/community-recipe-images/5f0c7b1e-2d7a-4c1e-9d2b-0f6f3f0f9a11/a.jpg';
    for (const url of [
      `https://staging.pinguinoai.com/brand/profile/gelato.jpg?${upload}`,
      `https://staging.pinguinoai.com/brand/profile/gelato.jpg#${upload}`,
      `https://tunabqqrwabacxjcxxkz.supabase.co${upload}?v=1`,
      `https://tunabqqrwabacxjcxxkz.supabase.co${upload}#brand`,
      `https://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/public/community-recipe-images/x/../../../../brand/profile/gelato.jpg`,
      `https://user:pass@tunabqqrwabacxjcxxkz.supabase.co${upload}`,
    ]) {
      expect(communityPhotoAccepted(url), url).toBe(false);
    }
  });

  it('refuses anything that is not an https upload object: relative, other buckets, other paths', () => {
    for (const url of [
      '/storage/v1/object/public/community-recipe-images/owner/a.jpg',
      'http://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/public/community-recipe-images/owner/a.jpg',
      'https://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/public/recipe-share-photos/owner/a.jpg',
      'https://tunabqqrwabacxjcxxkz.supabase.co/storage/v1/object/sign/community-recipe-images/owner/a.jpg',
      'https://cdn.example/storage/community/mine.jpg',
      'data:image/jpeg;base64,AAAA',
      'blob:https://staging.pinguinoai.com/1234',
    ]) {
      expect(communityPhotoAccepted(url), url).toBe(false);
    }
  });
});
