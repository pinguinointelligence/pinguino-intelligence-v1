import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { landingCopy } from '@/pages/landing/landingCopy';
import { APIPage } from './APIPage';
import { CreateIngredientPage } from './CreateIngredientPage';
import { RecipesHubPage } from './RecipesHubPage';
import { SubscriptionPage } from './SubscriptionPage';
import { WorkWithUsPage } from './WorkWithUsPage';

const renderAt = (path: string, el: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
};
const render = (el: ReactElement) => renderAt('/', el);

describe('Slice 3 destination pages', () => {
  it('uses the same white editorial shell across destination pages', () => {
    for (const el of [
      <WorkWithUsPage key="w" />,
      <APIPage key="a" />,
      <CreateIngredientPage key="i" />,
      <RecipesHubPage key="r" />,
    ]) {
      const html = render(el);
      expect(html).toContain('theme-pro-light');
      expect(html).toContain('bg-paper');
      // V2.1 §5: every destination carries an approved display weight — 750 on
      // the shared PageHeading, 800 on the editorial hero that replaces it.
      // A page with neither has lost its heading treatment entirely.
      expect(html.includes('font-[750]') || html.includes('font-extrabold')).toBe(true);
      expect(html).not.toContain('[color-scheme:dark]');
    }
  });

  it('Work With Us shows the four offers + a mailto CTA', () => {
    const html = render(<WorkWithUsPage />);
    expect(html).toContain(copy.nav.work.offers.app.title);
    expect(html).toContain(copy.nav.work.offers.machinesApp.title);
    expect(html).toContain(copy.nav.work.offers.machineMixtures.title);
    expect(html).toContain(copy.nav.work.offers.ingredients.title);
    expect(html).toContain(copy.nav.work.cta);
    expect(html).toContain('href="mailto:');
  });

  it('Subscription (light-first, Polish) shows Home + Pro tiers and an honest Pro CTA, no checkout', () => {
    const html = render(<SubscriptionPage />);
    // Reuses the landing plan tiers so the paywall's target matches the landing.
    expect(html).toContain(landingCopy.plans.home.name); // 'Home'
    expect(html).toContain(landingCopy.plans.pro.name); // 'Pro'
    expect(html).toContain(landingCopy.plans.pro.bullets[0]); // a real Pro feature
    expect(html).toContain(landingCopy.subscription.proCta); // 'Przejdź na Pro'
    expect(html).toContain(landingCopy.subscription.title); // 'Home czy Pro?'
    // Light-first: renders on the paper surface, not the dark legacy shell.
    expect(html).toContain('bg-paper');
    expect(/stripe/i.test(html)).toBe(false); // no payment provider wired
  });

  it('API page lists the informational links', () => {
    const html = render(<APIPage />);
    expect(html).toContain(copy.nav.api.title);
    expect(html).toContain(copy.nav.api.overview);
    expect(html).toContain(copy.nav.api.partner);
  });

  it('Create Ingredient is a static surface with Coming soon steps', () => {
    const html = render(<CreateIngredientPage />);
    expect(html).toContain(copy.nav.ingredient.title);
    expect(html).toContain(copy.nav.ingredient.describe);
    expect(html).toContain(copy.nav.comingSoon);
  });

  it('Recipes hub exposes the canonical three-part library without a legacy My Recipes link', () => {
    const html = render(<RecipesHubPage />);
    expect(html).toContain('data-testid="recipes-tab-mine"');
    expect(html).toContain('data-testid="recipes-tab-pinguino"');
    expect(html).toContain('data-testid="recipes-tab-inspiration"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="recipes-panel-pinguino"');
    expect(html).toContain('id="recipes-panel-pinguino"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('min-h-10');
    expect(html).not.toContain('href="/my-recipes"');
    expect(html).toContain(copy.nav.recipes.gelato);
  });

  it('routes Mine, PINGÜINO and Inspiration inside the same recipe destination', () => {
    const mine = renderAt('/recipes?tab=mine', <RecipesHubPage />);
    expect(mine).toContain('data-testid="recipes-mine"');
    const curated = renderAt('/recipes', <RecipesHubPage />);
    expect(curated).toContain(copy.nav.recipes.discovery.lostTitle.replace('&', '&amp;'));
    expect(curated).toContain(copy.nav.recipes.discovery.naturalTitle);
    const inspiration = renderAt('/recipes?tab=inspiration', <RecipesHubPage />);
    expect(inspiration).toContain(copy.nav.recipes.discovery.inspirationTitle);
    expect(inspiration).not.toContain(copy.nav.recipes.discovery.lostTitle);
  });

  it('no destination page shows customer-facing "Demo"', () => {
    for (const el of [
      <WorkWithUsPage key="w" />,
      <SubscriptionPage key="s" />,
      <APIPage key="a" />,
      <CreateIngredientPage key="i" />,
      <RecipesHubPage key="r" />,
    ]) {
      const text = render(el).replace(/<[^>]*>/g, ' ');
      expect(/\bdemo\b/i.test(text), 'no "Demo" in destination copy').toBe(false);
    }
  });
});
