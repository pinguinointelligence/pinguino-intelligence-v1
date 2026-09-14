import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_BASELINE_RECIPES,
  OFFICIAL_RECIPES,
  officialRecipeHasImage,
  officialRecipeImage,
} from './officialRecipeLibrary';

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
    const overriddenNumbers = new Set(packageImages.map((image) => image.number));
    const effectiveImages = [
      ...images.filter((image) => !overriddenNumbers.has(image.number)),
      ...packageImages,
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

  it('[GRP-IMG-PACK-01] maps each delivered owner photograph by its canonical number', () => {
    expect(packageImages.map((image) => image.number)).toEqual([...expectedSources.keys()]);
    expect(new Set(packageImages.map((image) => image.recipeId)).size).toBe(packageImages.length);
    expect(new Set(packageImages.map((image) => image.source.sha256)).size).toBe(
      packageImages.length,
    );
    for (const image of packageImages) {
      const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === image.number)!;
      const padded = String(image.number).padStart(3, '0');
      expect(image.recipeId).toBe(recipe.recipeId);
      expect(image.photoId).toBe(`GEL-${padded}`);
      expect(image.collection).toBe(recipe.collection);
      expect(image.source).toMatchObject({
        file: `${folderOf[recipe.collection]}/${padded}.png`,
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
  });

  it('[GRP-IMG-PACK-02] keeps Eiskaffee pending when no canonical #180 asset exists', () => {
    const eiskaffee = OFFICIAL_RECIPES.find((recipe) => recipe.number === 180)!;
    expect(packageImages.some((image) => image.number === 180)).toBe(false);
    expect(officialRecipeHasImage(eiskaffee)).toBe(false);
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
