import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { APIPage } from './APIPage';
import { CreateIngredientPage } from './CreateIngredientPage';
import { CreateLabelPage } from './CreateLabelPage';
import { RecipesHubPage } from './RecipesHubPage';
import { SubscriptionPage } from './SubscriptionPage';
import { WorkWithUsPage } from './WorkWithUsPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe('Slice 3 destination pages', () => {
  it('Work With Us shows the four offers + a mailto CTA', () => {
    const html = render(<WorkWithUsPage />);
    expect(html).toContain(copy.nav.work.offers.app.title);
    expect(html).toContain(copy.nav.work.offers.machinesApp.title);
    expect(html).toContain(copy.nav.work.offers.machineMixtures.title);
    expect(html).toContain(copy.nav.work.offers.ingredients.title);
    expect(html).toContain(copy.nav.work.cta);
    expect(html).toContain('href="mailto:');
  });

  it('Subscription shows Free Preview + PI Pro and the unlock CTA, with no checkout', () => {
    const html = render(<SubscriptionPage />);
    expect(html).toContain(copy.nav.subscription.free); // 'Free Preview'
    expect(html).toContain(copy.nav.subscription.pro); // 'PI Pro'
    expect(html).toContain(copy.gate.unlockCta); // 'Unlock PI Pro'
    expect(html).toContain(copy.nav.subscription.proFeatures[0]);
    expect(html).toContain(copy.nav.subscription.comingSoonNote);
    expect(/stripe/i.test(html)).toBe(false); // no payment provider wired
  });

  it('Create Label renders a real EU nutrition declaration from the sample recipe', () => {
    const html = render(<CreateLabelPage />);
    expect(html).toContain(copy.nav.label.title);
    expect(html).toContain(copy.nav.label.sampleHeading); // 'Sample recipe'
    expect(html).toContain(copy.studio.metrics.kcal); // 'Energy'
    expect(html).toContain(copy.studio.metrics.saturated); // 'of which saturated'
    expect(html).toContain(copy.nav.label.downloadCsv); // 'Download CSV'
    expect(html).toContain('kcal'); // energy declared in kJ + kcal
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

  it('Recipes hub links My Recipes to /my-recipes and shows categories', () => {
    const html = render(<RecipesHubPage />);
    expect(html).toContain(copy.nav.recipes.mine);
    expect(html).toContain('href="/my-recipes"');
    expect(html).toContain(copy.nav.recipes.gelato);
  });

  it('no destination page shows customer-facing "Demo"', () => {
    for (const el of [
      <WorkWithUsPage key="w" />,
      <SubscriptionPage key="s" />,
      <CreateLabelPage key="l" />,
      <APIPage key="a" />,
      <CreateIngredientPage key="i" />,
      <RecipesHubPage key="r" />,
    ]) {
      const text = render(el).replace(/<[^>]*>/g, ' ');
      expect(/\bdemo\b/i.test(text), 'no "Demo" in destination copy').toBe(false);
    }
  });
});
