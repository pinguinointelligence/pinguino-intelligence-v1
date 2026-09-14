import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_BASELINE_RECIPES,
  OFFICIAL_RECIPES,
  officialRecipeHasImage,
  officialRecipeImage,
} from './officialRecipeLibrary';
import { GELLATTI_PACK_01_02_ADDITIONS } from './officialRecipePack0102';

const REPO = process.cwd();
const manifest = JSON.parse(
  readFileSync(
    resolve(REPO, 'src/data/recipes/official/officialRecipeLibrary.manifest.json'),
    'utf8',
  ),
);
const sha256 = (path: string) =>
  createHash('sha256')
    .update(readFileSync(resolve(REPO, path)))
    .digest('hex');

interface ImageEntry {
  number: number;
  photoId: string;
  recipeId: string;
  collection: string;
  source: { file: string; sha256: string; width: number; height: number };
  outputs: { width: number; path: string; sha256: string; bytes: number }[];
}
const images = manifest.images as ImageEntry[];
const packageManifest = JSON.parse(
  readFileSync(
    resolve(REPO, 'src/data/recipes/official/officialRecipePack0102.images.json'),
    'utf8',
  ),
);
const packageImages = packageManifest.images as ImageEntry[];
const package03Manifest = JSON.parse(
  readFileSync(resolve(REPO, 'src/data/recipes/official/officialRecipePack03.images.json'), 'utf8'),
);
const package03Images = package03Manifest.images as ImageEntry[];
const currentPackageImages = [...packageImages, ...package03Images];
const folderOf = {
  classics: 'Classics',
  icons: 'Icons',
  cocktails_spirits: 'Cocktails & Spirits',
  lost_legendary: 'Lost & Legendary',
  technical_bases: 'Technical Bases',
} as const;

describe('recipe images: strict number mapping (§9, §29)', () => {
  it('maps exactly 177 numbered images, one per recipe, none missing or duplicated', () => {
    expect(images).toHaveLength(177);
    expect(images.map((image) => image.number)).toEqual(
      OFFICIAL_BASELINE_RECIPES.map((recipe) => recipe.number),
    );
    expect(new Set(images.map((image) => image.source.file)).size).toBe(177);
    for (const image of images) {
      const recipe = OFFICIAL_BASELINE_RECIPES[image.number - 1]!;
      expect(image.recipeId).toBe(recipe.recipeId);
      expect(image.photoId).toBe(recipe.photoId);
      // The source file NUMBER is the recipe number, inside that recipe's collection folder.
      expect(image.source.file).toBe(
        `${folderOf[recipe.collection]}/${String(recipe.number).padStart(3, '0')}.png`,
      );
    }
  });

  it.each([
    1, 2, 3, 76, 77, 103, 104, 105, 149, 150, 151, 152, 153, 163, 164, 165, 166, 167, 168, 169, 170,
    171, 172, 173, 174, 175, 176, 177,
  ])('image %i belongs to recipe #%i with no off-by-one shift', (number) => {
    const recipe = OFFICIAL_BASELINE_RECIPES.find((candidate) => candidate.number === number)!;
    const image = images.find((candidate) => candidate.number === number)!;
    const padded = String(number).padStart(3, '0');
    expect(image.source.file.endsWith(`/${padded}.png`)).toBe(true);
    expect(officialRecipeImage(recipe)).toEqual({
      card: `/recipes/official/GEL-${padded}-480.webp`,
      detail: `/recipes/official/GEL-${padded}-960.webp`,
    });
    expect(image.outputs.map((output) => output.path)).toEqual([
      `public/recipes/official/GEL-${padded}-480.webp`,
      `public/recipes/official/GEL-${padded}-960.webp`,
    ]);
  });

  it('ships exactly the encoded files the manifest records, byte for byte', () => {
    const overriddenNumbers = new Set(currentPackageImages.map((image) => image.number));
    const effectiveImages = [
      ...images.filter((image) => !overriddenNumbers.has(image.number)),
      ...currentPackageImages,
    ];
    for (const image of effectiveImages) {
      for (const output of image.outputs) {
        expect(existsSync(resolve(REPO, output.path)), output.path).toBe(true);
        expect(sha256(output.path), output.path).toBe(output.sha256);
      }
    }
    const shipped = readdirSync(resolve(REPO, 'public/recipes/official')).filter(
      (name) => name !== 'collections',
    );
    expect(shipped.sort()).toEqual(
      effectiveImages
        .flatMap((image) => image.outputs.map((o) => o.path.split('/').at(-1)!))
        .sort(),
    );
  });

  it('encodes from the original 1254 × 1254 owner photographs', () => {
    for (const image of images)
      expect([image.source.width, image.source.height]).toEqual([1254, 1254]);
  });
});

describe('recipe package 03 image overlay', () => {
  it('[GRP03-IMG-01] maps exact, distinct owner sources to #189 and #190 only', () => {
    expect(package03Images.map((image) => image.number)).toEqual([189, 190]);
    expect(package03Images.map((image) => image.source.file)).toEqual([
      'Cocktails & Spirits/189.png',
      'Cocktails & Spirits/190.png',
    ]);
    expect(package03Images.map((image) => image.source.sha256)).toEqual([
      'a74ec46370bd24a84c3220159e519d2165e2adc736623bb03911e1a855841e59',
      'fe7e802f10185ce0a29914c9fd65b54f464d674509fe5d0ba9106dce309e6311',
    ]);
    expect(new Set(package03Images.map((image) => image.source.sha256)).size).toBe(2);
    expect(package03Images.every((image) => image.collection === 'cocktails_spirits')).toBe(true);
    expect(package03Images.every((image) => image.source.width === 1254)).toBe(true);
    expect(package03Images.every((image) => image.source.height === 1254)).toBe(true);
    expect(package03Manifest.encoder).toEqual({
      tool: 'cwebp',
      version: '1.6.0',
      quality: 80,
      method: 6,
      metadata: 'none',
    });
  });

  it('[GRP03-IMG-02] ships the exact 480/960 WebP files recorded in the manifest', () => {
    for (const image of package03Images) {
      const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === image.number)!;
      expect(image.recipeId).toBe(recipe.recipeId);
      expect(image.photoId).toBe(recipe.photoId);
      expect(image.collection).toBe(recipe.collection);
      expect(image.outputs.map((output) => output.width)).toEqual([480, 960]);
      expect(officialRecipeImage(recipe)).toEqual({
        card: `/recipes/official/GEL-${image.number}-480.webp`,
        detail: `/recipes/official/GEL-${image.number}-960.webp`,
      });
      for (const output of image.outputs) {
        expect(existsSync(resolve(REPO, output.path)), output.path).toBe(true);
        expect(sha256(output.path), output.path).toBe(output.sha256);
        expect(statSync(resolve(REPO, output.path)).size, output.path).toBe(output.bytes);
      }
    }
    expect(package03Images[0]!.outputs[0]!.sha256).not.toBe(package03Images[1]!.outputs[0]!.sha256);
    expect(package03Images[0]!.outputs[1]!.sha256).not.toBe(package03Images[1]!.outputs[1]!.sha256);
  });

  it('[GRP03-IMG-03] keeps #186-188 pending and ships no guessed #180 or #186-188 files', () => {
    for (const number of [186, 187, 188]) {
      const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === number)!;
      expect(recipe.photoStatus).toBe('pending');
      expect(officialRecipeHasImage(recipe)).toBe(false);
    }
    expect(OFFICIAL_RECIPES.some((candidate) => candidate.number === 180)).toBe(false);
    for (const number of [180, 186, 187, 188]) {
      expect(currentPackageImages.some((image) => image.number === number)).toBe(false);
      const padded = String(number).padStart(3, '0');
      expect(existsSync(resolve(REPO, `public/recipes/official/GEL-${padded}-480.webp`))).toBe(
        false,
      );
      expect(existsSync(resolve(REPO, `public/recipes/official/GEL-${padded}-960.webp`))).toBe(
        false,
      );
    }
  });
});

describe('recipe pack 01/02 image overlay', () => {
  const expectedSources = new Map([
    [39, '370ab034b44fa175f4ca4ba4972e3f27a0ae152f5eded29a84bea9724fd8538f'],
    [178, 'eddbb7ae95562df5aab52a2069920697d89cc3799f9db3d75580bd42bf25f699'],
    [179, '370d0367786292924071ebd879cf9a3bd92b3d7e6622326fb35d3765a846d2e8'],
    [181, 'e75bc26b843035f344bf3579bed0dbe8e1858dfd753b79cd967a2aaaaf3e212f'],
    [182, 'f11eaa89d1c628c0c13836272d8bf5c3d382fac070cbed5ef0ad7d3e81b2232e'],
    [183, '48d4dfab4cd7eabcf0c3c1755325da56721963b6ce268433a38d9aa5ad6bd44e'],
    [184, 'e238452b9c77a97da0f54410defd8296974026abec9e9f3742d8e03ad9c00206'],
    [185, 'df08176d1e31e42f525620eb3af085117738aa659f154e7de312c147c1d3abc2'],
  ]);
  const expectedSourceCollections = new Map<number, keyof typeof folderOf>([
    [39, 'classics'],
    [178, 'classics'],
    [179, 'cocktails_spirits'],
    [181, 'classics'],
    [182, 'icons'],
    [183, 'icons'],
    [184, 'icons'],
    [185, 'lost_legendary'],
  ]);

  it('[GRP-IMG-PACK-01] maps each delivered owner photograph by its canonical number', () => {
    expect(packageImages.map((image) => image.number)).toEqual([...expectedSources.keys()]);
    expect(new Set(packageImages.map((image) => image.recipeId)).size).toBe(packageImages.length);
    expect(new Set(packageImages.map((image) => image.source.sha256)).size).toBe(
      packageImages.length,
    );
    for (const image of packageImages) {
      const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === image.number)!;
      const sourceCollection = expectedSourceCollections.get(image.number)!;
      const padded = String(image.number).padStart(3, '0');
      expect(image.recipeId).toBe(recipe.recipeId);
      expect(image.photoId).toBe(`GEL-${padded}`);
      expect(image.collection).toBe(sourceCollection);
      expect(image.source).toMatchObject({
        file: `${folderOf[sourceCollection]}/${padded}.png`,
        sha256: expectedSources.get(image.number),
        width: 1254,
        height: 1254,
      });
      expect(image.outputs.map((output) => output.path)).toEqual([
        `public/recipes/official/GEL-${padded}-480.webp`,
        `public/recipes/official/GEL-${padded}-960.webp`,
      ]);
      expect(officialRecipeHasImage(recipe)).toBe(true);
    }
    expect(OFFICIAL_RECIPES.find((recipe) => recipe.number === 178)?.collection).toBe(
      'lost_legendary',
    );
    expect(OFFICIAL_RECIPES.find((recipe) => recipe.number === 181)?.collection).toBe(
      'lost_legendary',
    );
  });

  it('[GRP-IMG-PACK-02] keeps the excluded Eiskaffee source pending without a canonical asset', () => {
    const eiskaffee = GELLATTI_PACK_01_02_ADDITIONS.find((recipe) => recipe.number === 180)!;
    expect(packageImages.some((image) => image.number === 180)).toBe(false);
    expect(officialRecipeHasImage(eiskaffee)).toBe(false);
    expect(OFFICIAL_RECIPES.some((recipe) => recipe.number === 180)).toBe(false);
    expect(existsSync(resolve(REPO, 'public/recipes/official/GEL-180-480.webp'))).toBe(false);
    expect(existsSync(resolve(REPO, 'public/recipes/official/GEL-180-960.webp'))).toBe(false);
  });
});

describe('collection heroes (§10)', () => {
  it('uses the five owner collection heroes plus the supplied Community card image', () => {
    const heroes = manifest.heroes as {
      collection: string;
      source: { file: string };
      outputs: { width: number; path: string; sha256: string }[];
    }[];
    expect(heroes.map((hero) => hero.collection)).toEqual(OFFICIAL_COLLECTIONS.map((c) => c.id));
    expect(heroes.map((hero) => hero.source.file)).toEqual([
      'Classics/Classics.png',
      'Icons/Icons.png',
      'Cocktails & Spirits/Cocktails_Spirits.png',
      'Lost & Legendary/Lost_Legendary.png',
      'Technical Bases/Technical_Bases.png',
    ]);
    for (const [index, hero] of heroes.entries()) {
      const collection = OFFICIAL_COLLECTIONS[index]!;
      expect(hero.outputs.map((output) => `/${output.path.replace(/^public\//, '')}`)).toEqual([
        collection.heroImage.small,
        collection.heroImage.large,
      ]);
      for (const output of hero.outputs) expect(sha256(output.path)).toBe(output.sha256);
    }
    expect(readdirSync(resolve(REPO, 'public/recipes/official/collections')).sort()).toEqual(
      [
        ...heroes.flatMap((hero) => hero.outputs.map((output) => output.path.split('/').at(-1)!)),
        'community.png',
      ].sort(),
    );
    expect(sha256('public/recipes/official/collections/community.png')).toBe(
      '1fe6a25ca3148707a291d73728c0ef2738b2ba146d4797d56dc14410012e45f5',
    );
  });
});
