import { describe, expect, it } from 'vitest';
import { findDemoLeaks } from './demoSafeRecipe';
import {
  absoluteUrl,
  canWebShare,
  creatorPath,
  directShareMetadata,
  publicationMetadata,
  publicationPath,
  sharePath,
} from './shareUrls';

describe('§8/§10 — canonical addresses', () => {
  it('builds the public and unlisted paths', () => {
    expect(publicationPath('marysia', 'pistachio-salted-caramel')).toBe(
      '/@marysia/pistachio-salted-caramel',
    );
    expect(creatorPath('marysia')).toBe('/@marysia');
    expect(sharePath('tok3n')).toBe('/share/tok3n');
  });

  it('joins an origin without doubling slashes', () => {
    expect(absoluteUrl('https://gellatti.com/', '/@marysia')).toBe('https://gellatti.com/@marysia');
    expect(absoluteUrl('https://gellatti.com', '@marysia')).toBe('https://gellatti.com/@marysia');
  });
});

describe('§46 — Community is shareable, a direct share is not indexable', () => {
  const publication = publicationMetadata({
    origin: 'https://gellatti.com',
    handle: 'marysia',
    slug: 'pistachio-salted-caramel',
    title: 'Pistachio Salted Caramel',
    description: 'Pistacja i słona karmel.',
    imageUrl: 'https://cdn.example/pistachio.jpg',
    creatorDisplayName: 'Marysia',
  });

  it('gives a Community page a canonical URL, an image and index,follow', () => {
    expect(publication.canonical).toBe('https://gellatti.com/@marysia/pistachio-salted-caramel');
    expect(publication.robots).toBe('index,follow');
    expect(publication.image).toBe('https://cdn.example/pistachio.jpg');
    expect(publication.creator).toBe('Marysia');
    expect(publication.title).toContain('Marysia');
  });

  it('leaks no formulation through Open Graph metadata (§16)', () => {
    expect(findDemoLeaks(publication)).toEqual([]);
  });

  it('gives a direct share NOTHING: no canonical, no image, noindex', () => {
    const share = directShareMetadata();
    expect(share.robots).toBe('noindex,nofollow');
    expect(share.canonical).toBeNull();
    expect(share.image).toBeNull();
    expect(share.creator).toBeNull();
  });

  it('a direct-share preview never names the recipe or its creator', () => {
    const share = directShareMetadata();
    const text = `${share.title} ${share.description}`;
    expect(text).not.toMatch(/pistachio|marysia/i);
    expect(findDemoLeaks(share)).toEqual([]);
  });

  it('falls back to copy-link where the Web Share API is unavailable (§45)', () => {
    expect(canWebShare(undefined)).toBe(false);
    expect(canWebShare({} as Navigator)).toBe(false);
    expect(canWebShare({ share: async () => {} } as unknown as Navigator)).toBe(true);
  });
});
