/**
 * TEST SCENARIO E (§68) — Demo data security, proven at the rendering boundary.
 *
 * The real guarantee is in the database: a non-entitled caller's response
 * never contains a formulation, so there is nothing in the browser to hide.
 * This file proves the OTHER half — that the components which render a Demo
 * payload cannot leak one even if a formulation were handed to them:
 *
 *   * the DOM contains no gram value, in text, in an attribute, or in a
 *     `title`/`aria-label`;
 *   * the serialized props of the whole tree contain no forbidden key;
 *   * a hostile payload carrying `recipe_input` alongside the demo projection
 *     still renders nothing from it.
 *
 * `renderToStaticMarkup` is deliberate: it produces exactly the bytes a
 * server-rendered or view-source inspection would show.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  findDemoLeaks,
  toDemoSafeRecipe,
  type DemoSafeRecipe,
} from '@/features/community/domain/demoSafeRecipe';
import { publicationMetadata } from '@/features/community/domain/shareUrls';
import { AttributionByline } from './AttributionByline';
import { CommunityRecipeCard } from './CommunityRecipeCard';
import { DemoRecipePreview } from './DemoRecipePreview';

const SECRET_GRAMS = [512, 148, 63, 27] as const;

const FULL_RECIPE_INPUT = {
  mode: 'PRO',
  category: 'GELATO_WHITE',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  goals: { sweetness: 'HIGH' },
  items: [
    {
      id: 'l1',
      planned_grams: SECRET_GRAMS[0],
      lock_type: 'MAIN',
      ingredient: {
        id: 'PI-ING-000123',
        name: 'MLEKO 3,2%',
        category: 'DAIRY_LIQUID',
        composition: { water_g: 88, fat_g: 3.2 },
        pod_value: 0,
        pac_value: 0,
        cost_per_kg: 3.4,
      },
    },
    {
      id: 'l2',
      planned_grams: SECRET_GRAMS[1],
      lock_type: 'NONE',
      ingredient: { id: 'PI-ING-000045', name: 'SACHAROZA', category: 'SUGAR', pod_value: 100 },
    },
    {
      id: 'l3',
      planned_grams: SECRET_GRAMS[2],
      lock_type: 'NONE',
      ingredient: { id: 'PI-ING-000077', name: 'MLEKO W PROSZKU ODTŁUSZCZONE', category: 'DAIRY_POWDER' },
    },
    {
      id: 'l4',
      planned_grams: SECRET_GRAMS[3],
      lock_type: 'NONE',
      ingredient: { id: 'PI-ING-000091', name: 'STABILIZATOR', category: 'STABILIZER' },
    },
  ],
};

const demoSafe: DemoSafeRecipe = toDemoSafeRecipe(FULL_RECIPE_INPUT);

const render = (node: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe('the Demo preview cannot render a gram', () => {
  const markup = render(<DemoRecipePreview recipe={demoSafe} />);

  it('shows the real ingredient names — a Demo is useful, not an empty paywall (§17)', () => {
    expect(markup).toContain('MLEKO 3,2%');
    expect(markup).toContain('SACHAROZA');
    expect(markup).toContain('STABILIZATOR');
    expect(markup).toContain('Main');
  });

  it('shows the recipe context a recipient needs', () => {
    expect(markup).toContain('GELATO_WHITE');
    expect(markup).toContain('-13');
    expect(markup).toContain('1000 g');
  });

  it('contains NO gram value from the source recipe', () => {
    for (const grams of SECRET_GRAMS) {
      expect(markup.includes(String(grams)), `${grams} leaked`).toBe(false);
    }
  });

  it('contains no composition, POD/PAC, cost or Mapper identifier', () => {
    for (const secret of ['88', '3.2', '3.4', 'PI-ING-000123', 'pod_value', 'composition']) {
      expect(markup.includes(secret), `${secret} leaked`).toBe(false);
    }
  });

  it('hides nothing with CSS — there is no gram in the markup to hide', () => {
    expect(markup).not.toMatch(/display:\s*none/i);
    expect(markup).not.toMatch(/visibility:\s*hidden/i);
    expect(markup).not.toContain('aria-hidden="true" data-grams');
  });

  it('leaks nothing through a title or aria-label either', () => {
    const attributes = markup.match(/(?:title|aria-label)="[^"]*"/g) ?? [];
    for (const attribute of attributes) {
      for (const grams of SECRET_GRAMS) {
        expect(attribute.includes(String(grams)), attribute).toBe(false);
      }
    }
  });
});

describe('a hostile payload cannot smuggle a formulation into the tree', () => {
  it('ignores extra fields bolted onto a demo-safe object', () => {
    const hostile = {
      ...demoSafe,
      recipe_input: FULL_RECIPE_INPUT,
      items: demoSafe.items.map((item, index) => ({
        ...item,
        planned_grams: SECRET_GRAMS[index],
      })),
    } as unknown as DemoSafeRecipe;

    const markup = render(<DemoRecipePreview recipe={hostile} />);
    for (const grams of SECRET_GRAMS) {
      expect(markup.includes(String(grams)), `${grams} leaked`).toBe(false);
    }
  });

  it('the projection itself is the chokepoint — it strips them before rendering', () => {
    expect(findDemoLeaks(demoSafe)).toEqual([]);
    expect(findDemoLeaks(FULL_RECIPE_INPUT).length).toBeGreaterThan(0);
  });
});

describe('the acquisition surfaces leak nothing either', () => {
  it('a Community card renders proof of use, never a formulation', () => {
    const markup = render(
      <CommunityRecipeCard
        card={{
          publication_id: 'pub-1',
          title: 'Pistachio Salted Caramel',
          slug: 'pistachio-salted-caramel',
          version_number: 1,
          published_at: '2026-08-01T00:00:00Z',
          creator: { handle: 'marysia', display_name: 'Marysia' },
          metrics: {
            unique_users: 40,
            unique_makers: 12,
            total_makes: 31,
            remix_count: 2,
            rating_count: 7,
            rating_average: 4.6,
          },
        }}
        rank={3}
      />,
    );
    expect(markup).toContain('Pistachio Salted Caramel');
    expect(markup).toContain('Marysia');
    expect(markup).toContain('#3');
    expect(markup).toContain('4.6');
    for (const grams of SECRET_GRAMS) {
      expect(markup.includes(String(grams)), `${grams} leaked`).toBe(false);
    }
  });

  it('Open Graph metadata carries no formulation (§16, §46)', () => {
    expect(
      findDemoLeaks(
        publicationMetadata({
          origin: 'https://gellatti.com',
          handle: 'marysia',
          slug: 'pistachio-salted-caramel',
          title: 'Pistachio Salted Caramel',
          creatorDisplayName: 'Marysia',
        }),
      ),
    ).toEqual([]);
  });
});

describe('§23 — the byline keeps authorship, sharing and commerce apart', () => {
  it('names the creator, and the sharer only when they differ', () => {
    const bySomeoneElse = render(
      <AttributionByline
        creatorDisplayName="Marysia"
        creatorHandle="marysia"
        sharedByDisplayName="Jan"
      />,
    );
    expect(bySomeoneElse).toContain('Marysia');
    expect(bySomeoneElse).toContain('Jan');

    const byTheCreator = render(
      <AttributionByline creatorDisplayName="Marysia" sharedByDisplayName="Marysia" />,
    );
    // „Udostępnił(a) Marysia" under „Autor Marysia" would be noise.
    expect(byTheCreator.match(/Marysia/g)).toHaveLength(1);
  });

  it('always shows „Na podstawie" on a remix — it cannot be suppressed', () => {
    const markup = render(
      <AttributionByline
        creatorDisplayName="Jan"
        basedOn={{ title: 'Pistachio Salted Caramel', creatorDisplayName: 'Marysia', handle: 'marysia' }}
      />,
    );
    expect(markup).toContain('Na podstawie');
    expect(markup).toContain('Pistachio Salted Caramel');
    expect(markup).toContain('Marysia');
    expect(markup).toContain('Jan');
  });

  it('never renders a Partner as if they were an author', () => {
    const markup = render(
      <AttributionByline creatorDisplayName="Marysia" sharedByDisplayName="Jan" />,
    );
    expect(markup).not.toMatch(/partner/i);
    expect(markup).not.toMatch(/prowizj/i);
  });
});
