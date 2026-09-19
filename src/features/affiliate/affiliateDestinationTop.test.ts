/**
 * AFFILIATE — the shared destination top, and the owner's audience order.
 *
 * Two owner decisions of 2026-09-18, and they fail differently:
 *
 *  * Sklep, Affiliate and Franchise share ONE top. The page used to own a hero
 *    of its own — a second graphite block with its own radius, its own 52 px
 *    headline and its own two gradients. If a later edit reintroduces one, the
 *    three stop reading as one family, which is the whole point of the
 *    component.
 *  * The audience cards are ordered creators → communities and media →
 *    professionals. The order is the owner's, not alphabetical and not the one
 *    the copy happened to be written in, and the images must follow the copy
 *    rather than an index that silently drifts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { affiliateCopyPl } from '@/copy/affiliate';

const page = readFileSync(
  new URL('../../pages/destinations/AffiliatePage.tsx', import.meta.url),
  'utf8',
);

describe('the shared destination top', () => {
  it('Affiliate renders THE shared top, not a hero of its own', () => {
    expect(page).toContain("from '@/components/shared/destinationEditorial'");
    expect(page).toContain('<DestinationTop');
    // The retired local hero: its own headline, its own 520 px photo column and
    // its own two seam gradients. The top owns the page's h1 now, so a second
    // one here would mean a second hero.
    expect(page).not.toContain('<h1');
    expect(page).not.toContain('lg:min-h-[520px]');
    expect(page).not.toContain('from-[var(--g-ink)] to-transparent');
  });

  it('keeps both calls to action and the honest note the hero always carried', () => {
    expect(page).toContain('href="#affiliate-application"');
    expect(page).toContain('href="#affiliate-how"');
    expect(page).toContain('note={c.hero.note}');
  });
});

describe("the owner's audience order", () => {
  const titles = affiliateCopyPl.audience.groups.map((group) => group.title);

  it('is creators, then communities and media, then professionals', () => {
    expect(titles).toEqual([
      'Twórcy i influencerzy',
      'Media i społeczności',
      'Profesjonaliści i edukatorzy',
    ]);
  });

  it('gives each group its own photograph in that same order', () => {
    const images = page.slice(page.indexOf('const AUDIENCE_IMAGES'));
    const order = [...images.slice(0, images.indexOf('];')).matchAll(/affiliate\/(\w+)\.jpg/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual(['creators', 'communities', 'professionals']);
  });
});
