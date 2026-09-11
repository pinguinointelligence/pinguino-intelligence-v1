import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_RECIPES,
  officialRecipeImage,
} from './officialRecipeLibrary';

const REPO = process.cwd();
const manifest = JSON.parse(
  readFileSync(resolve(REPO, 'src/data/recipes/official/officialRecipeLibrary.manifest.json'), 'utf8'),
);
const sha256 = (path: string) => createHash('sha256').update(readFileSync(resolve(REPO, path))).digest('hex');

interface ImageEntry {
  number: number;
  photoId: string;
  recipeId: string;
  collection: string;
  source: { file: string; sha256: string; width: number; height: number };
  outputs: { width: number; path: string; sha256: string; bytes: number }[];
}
const images = manifest.images as ImageEntry[];
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
    expect(images.map((image) => image.number)).toEqual(OFFICIAL_RECIPES.map((r) => r.number));
    expect(new Set(images.map((image) => image.source.file)).size).toBe(177);
    for (const image of images) {
      const recipe = OFFICIAL_RECIPES[image.number - 1]!;
      expect(image.recipeId).toBe(recipe.recipeId);
      expect(image.photoId).toBe(recipe.photoId);
      // The source file NUMBER is the recipe number, inside that recipe's collection folder.
      expect(image.source.file).toBe(
        `${folderOf[recipe.collection]}/${String(recipe.number).padStart(3, '0')}.png`,
      );
    }
  });

  it.each([
    1, 2, 3, 76, 77, 103, 104, 105, 149, 150, 151, 152, 153, 163, 164, 165, 166, 167, 168, 169,
    170, 171, 172, 173, 174, 175, 176, 177,
  ])('image %i belongs to recipe #%i with no off-by-one shift', (number) => {
    const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === number)!;
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
    for (const image of images) {
      for (const output of image.outputs) {
        expect(existsSync(resolve(REPO, output.path)), output.path).toBe(true);
        expect(sha256(output.path), output.path).toBe(output.sha256);
      }
    }
    const shipped = readdirSync(resolve(REPO, 'public/recipes/official')).filter(
      (name) => name !== 'collections',
    );
    expect(shipped.sort()).toEqual(
      images.flatMap((image) => image.outputs.map((o) => o.path.split('/').at(-1)!)).sort(),
    );
  });

  it('encodes from the original 1254 × 1254 owner photographs', () => {
    for (const image of images) expect([image.source.width, image.source.height]).toEqual([1254, 1254]);
  });
});

describe('collection heroes (§10)', () => {
  it('uses the five owner hero files, one per collection, in order', () => {
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
    expect(readdirSync(resolve(REPO, 'public/recipes/official/collections'))).toHaveLength(10);
  });
});
